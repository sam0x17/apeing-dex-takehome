/**
 * Injected EIP-1193 test wallet.
 *
 * Runs inside the page before app scripts (page.addInitScript). It is a thin
 * JSON-RPC proxy to the anvil forks: anvil signs transactions and typed data
 * for its dev accounts, so the app's real wallet store, viem clients, and the
 * Li.Fi EthereumProvider all run unmodified — no mocks inside the app.
 */
export interface WalletInitArgs {
  account: string;
  /** chainId → fork RPC url */
  chains: Record<number, string>;
  initialChainId: number;
}

export function injectTestWallet({
  account,
  chains,
  initialChainId,
}: WalletInitArgs) {
  let activeChainId = initialChainId;
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const sendCallsStore: Record<string, string[]> = {};
  let rpcId = 0;

  async function rpc(method: string, params: unknown[]) {
    const res = await fetch(chains[activeChainId], {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
    });
    const json = (await res.json()) as {
      result?: unknown;
      error?: { code: number; message: string };
    };
    if (json.error) {
      const error = new Error(json.error.message) as Error & { code: number };
      error.code = json.error.code;
      throw error;
    }
    return json.result;
  }

  const provider = {
    isMetaMask: true,
    async request({
      method,
      params,
    }: {
      method: string;
      params?: unknown[];
    }) {
      console.debug(`[test-wallet] ${method}`);
      switch (method) {
        case 'eth_requestAccounts':
        case 'eth_accounts':
          return [account];
        case 'eth_chainId':
          return `0x${activeChainId.toString(16)}`;
        case 'wallet_switchEthereumChain': {
          const target = Number(
            (params?.[0] as { chainId: string }).chainId,
          );
          if (!chains[target]) {
            const error = new Error(
              `Unrecognized chain ${target}`,
            ) as Error & { code: number };
            error.code = 4902;
            throw error;
          }
          activeChainId = target;
          for (const fn of listeners.chainChanged ?? []) {
            fn(`0x${target.toString(16)}`);
          }
          return null;
        }
        case 'wallet_addEthereumChain':
          return null;

        // --- EIP-5792: batch calls in one confirmation. anvil auto-mines,
        // so we execute the calls sequentially and report them as a bundle.
        case 'wallet_getCapabilities':
          return {
            [`0x${activeChainId.toString(16)}`]: {
              atomic: { status: 'supported' },
            },
          };
        case 'wallet_sendCalls': {
          const req = params?.[0] as {
            from: string;
            calls: { to: string; data?: string; value?: string }[];
          };
          const hashes: string[] = [];
          for (const call of req.calls) {
            const hash = (await rpc('eth_sendTransaction', [
              {
                from: req.from,
                to: call.to,
                data: call.data,
                ...(call.value ? { value: call.value } : {}),
              },
            ])) as string;
            hashes.push(hash);
          }
          const id = hashes[0];
          sendCallsStore[id] = hashes;
          return { id };
        }
        case 'wallet_getCallsStatus': {
          const id = params?.[0] as string;
          const hashes = sendCallsStore[id] ?? [];
          const receipts = await Promise.all(
            hashes.map((h) => rpc('eth_getTransactionReceipt', [h])),
          );
          const settled = receipts.every((r) => r !== null);
          return {
            version: '2.0.0',
            id,
            chainId: `0x${activeChainId.toString(16)}`,
            atomic: true,
            status: settled ? 200 : 100,
            receipts: settled ? receipts : [],
          };
        }

        default:
          return rpc(method, params ?? []);
      }
    },
    on(event: string, fn: (...args: unknown[]) => void) {
      (listeners[event] ??= []).push(fn);
    },
    removeListener(event: string, fn: (...args: unknown[]) => void) {
      listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
    },
  };

  (window as unknown as { ethereum: typeof provider }).ethereum = provider;

  // Announce over EIP-6963 too (as real wallets do), so the app's discovery
  // path is exercised end-to-end and not just the window.ethereum fallback.
  const detail = Object.freeze({
    info: {
      uuid: '00000000-0000-4000-8000-000000000001',
      name: 'Test Wallet',
      icon: 'data:image/svg+xml;base64,PHN2Zy8+',
      rdns: 'com.example.testwallet',
    },
    provider,
  });
  const announce = () =>
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', { detail }),
    );
  window.addEventListener('eip6963:requestProvider', announce);
  announce();
}
