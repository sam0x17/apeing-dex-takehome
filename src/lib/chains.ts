import type { Address } from 'viem';

/** Polygon PoS — destination chain for all flows in this app. */
export const POLYGON_CHAIN_ID = 137;

/** Arbitrum One — source chain for bridging. */
export const ARBITRUM_CHAIN_ID = 42161;

/** Polymarket V2 collateral token (pUSD) on Polygon. */
export const PUSD: Address = '0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB';
export const PUSD_DECIMALS = 6;
export const PUSD_SYMBOL = 'pUSD';

/** Native USDC on Arbitrum One. */
export const ARBITRUM_USDC: Address =
  '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
export const ARBITRUM_USDC_DECIMALS = 6;

// Default to publicnode: the long-standing polygon-rpc.com endpoint is now
// gated and returns 401 "tenant disabled" for unkeyed traffic. Override with
// your own RPC via NEXT_PUBLIC_POLYGON_RPC for production rate limits.
export const POLYGON_RPC =
  process.env.NEXT_PUBLIC_POLYGON_RPC ?? 'https://polygon-bor-rpc.publicnode.com';

export const ARBITRUM_RPC =
  process.env.NEXT_PUBLIC_ARBITRUM_RPC ?? 'https://arbitrum-one-rpc.publicnode.com';

const EXPLORERS: Record<number, string> = {
  [POLYGON_CHAIN_ID]: 'https://polygonscan.com',
  [ARBITRUM_CHAIN_ID]: 'https://arbiscan.io',
};

export function explorerTxUrl(chainId: number, txHash: string): string | undefined {
  const base = EXPLORERS[chainId];
  return base ? `${base}/tx/${txHash}` : undefined;
}
