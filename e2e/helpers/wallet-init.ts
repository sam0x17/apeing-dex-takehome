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
}
