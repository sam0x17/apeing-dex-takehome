'use client';

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type EIP1193Provider,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { arbitrum, polygon } from 'viem/chains';
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_RPC,
  POLYGON_CHAIN_ID,
  POLYGON_RPC,
} from './chains';
import type { EIP6963ProviderDetail } from './eip6963';

export interface WalletState {
  status: 'disconnected' | 'connecting' | 'connected';
  address?: Address;
  chainId?: number;
}

type Listener = () => void;

declare global {
  interface Window {
    ethereum?: EIP1193Provider;
  }
}

const CHAINS = { [POLYGON_CHAIN_ID]: polygon, [ARBITRUM_CHAIN_ID]: arbitrum };

/**
 * Minimal injected-wallet (EIP-1193) store. Deliberately not wagmi: the
 * assessment stack is viem + injected wallet, and this slice only needs
 * connect / account / chain tracking / chain switching.
 *
 * Consumed from React via useSyncExternalStore (see hooks/useWallet.ts)
 * and from the Li.Fi EthereumProvider via getWalletClient/switchChain.
 */
let state: WalletState = { status: 'disconnected' };
const listeners = new Set<Listener>();

/**
 * The provider we actually talk to. Chosen via EIP-6963 (a specific wallet
 * the user picked) and falling back to `window.ethereum` only when no
 * EIP-6963 wallet is available.
 */
let activeProvider: EIP1193Provider | undefined;
let boundProvider: EIP1193Provider | undefined;

function setState(next: WalletState) {
  state = next;
  for (const l of listeners) l();
}

export function getWalletState(): WalletState {
  return state;
}

export function subscribeWallet(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Legacy global injected provider (EIP-6963 fallback only). */
export function getInjectedProvider(): EIP1193Provider | undefined {
  return typeof window === 'undefined' ? undefined : window.ethereum;
}

/** The provider in use: the EIP-6963 selection, else `window.ethereum`. */
export function getActiveProvider(): EIP1193Provider | undefined {
  return activeProvider ?? getInjectedProvider();
}

function bindProviderListeners(provider: EIP1193Provider) {
  // Rebind when the user switches to a different wallet.
  if (boundProvider === provider) return;
  boundProvider = provider;
  provider.on('accountsChanged', (accounts) => {
    const [address] = accounts as Address[];
    setState(
      address
        ? { ...state, status: 'connected', address }
        : { status: 'disconnected' },
    );
  });
  provider.on('chainChanged', (chainIdHex) => {
    setState({ ...state, chainId: Number(chainIdHex) });
  });
}

/**
 * Connect a specific wallet. Pass an EIP-6963 detail to target one wallet
 * (e.g. MetaMask even when Phantom is also installed); omit it to use the
 * legacy `window.ethereum` fallback.
 */
export async function connectWallet(
  detail?: EIP6963ProviderDetail,
): Promise<void> {
  const provider = detail?.provider ?? getActiveProvider();
  if (!provider) {
    throw new Error(
      'No injected wallet found. Install MetaMask (or another EIP-1193 wallet) and reload.',
    );
  }
  activeProvider = provider;
  setState({ ...state, status: 'connecting' });
  try {
    const accounts = (await provider.request({
      method: 'eth_requestAccounts',
    })) as Address[];
    const chainIdHex = (await provider.request({
      method: 'eth_chainId',
    })) as string;
    bindProviderListeners(provider);
    setState({
      status: 'connected',
      address: accounts[0],
      chainId: Number(chainIdHex),
    });
  } catch (error) {
    setState({ status: 'disconnected' });
    throw error;
  }
}

export function disconnectWallet(): void {
  // Injected wallets have no programmatic disconnect; we just drop our state.
  setState({ status: 'disconnected' });
}

/** Wallet client for the connected account on whatever chain it is on. */
export function getWalletClient(): WalletClient {
  const provider = getActiveProvider();
  if (!provider || !state.address) {
    throw new Error('Wallet is not connected.');
  }
  const chain = CHAINS[state.chainId as keyof typeof CHAINS];
  return createWalletClient({
    account: state.address,
    chain,
    transport: custom(provider),
  });
}

/**
 * Ask the wallet to switch chains (adding the chain first if unknown),
 * then return a wallet client bound to it. Shape matches what the Li.Fi
 * EthereumProvider expects for its `switchChain` option.
 */
export async function switchChain(chainId: number): Promise<WalletClient> {
  const provider = getActiveProvider();
  if (!provider) throw new Error('Wallet is not connected.');
  const chain = CHAINS[chainId as keyof typeof CHAINS];
  if (!chain) throw new Error(`Unsupported chain id ${chainId}.`);

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: `0x${chainId.toString(16)}` }],
    });
  } catch (error) {
    // 4902: the chain has not been added to the wallet yet.
    if ((error as { code?: number }).code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: `0x${chainId.toString(16)}`,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: [chain.rpcUrls.default.http[0]],
            blockExplorerUrls: [chain.blockExplorers?.default.url ?? ''],
          },
        ],
      });
    } else {
      throw error;
    }
  }
  setState({ ...state, chainId });
  return getWalletClient();
}

let polygonClient: PublicClient | undefined;
let arbitrumClient: PublicClient | undefined;

/** Shared read-only client for Polygon (balances, allowances). */
export function getPolygonPublicClient(): PublicClient {
  polygonClient ??= createPublicClient({
    chain: polygon,
    transport: http(POLYGON_RPC),
  });
  return polygonClient;
}

/** Shared read-only client for Arbitrum (source-chain USDC balance). */
export function getArbitrumPublicClient(): PublicClient {
  arbitrumClient ??= createPublicClient({
    chain: arbitrum,
    transport: http(ARBITRUM_RPC),
  });
  return arbitrumClient;
}
