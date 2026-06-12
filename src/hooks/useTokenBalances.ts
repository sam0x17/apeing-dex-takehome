'use client';

import { useQuery } from '@tanstack/react-query';
import type { Address } from 'viem';
import {
  ARBITRUM_USDC,
  PUSD,
} from '@/lib/chains';
import { ERC20_ABI } from '@/lib/erc20';
import {
  getArbitrumPublicClient,
  getPolygonPublicClient,
} from '@/lib/wallet';

export const PUSD_BALANCE_QUERY_KEY = 'pusd-balance';

/** pUSD balance of `address` on Polygon. Refetched on demand after bridging. */
export function usePusdBalance(address?: Address) {
  return useQuery({
    queryKey: [PUSD_BALANCE_QUERY_KEY, address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: () =>
      getPolygonPublicClient().readContract({
        address: PUSD,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address!],
      }),
  });
}

/** USDC balance of `address` on Arbitrum (bridge source funds). */
export function useArbitrumUsdcBalance(address?: Address) {
  return useQuery({
    queryKey: ['arbitrum-usdc-balance', address],
    enabled: !!address,
    refetchInterval: 30_000,
    queryFn: () =>
      getArbitrumPublicClient().readContract({
        address: ARBITRUM_USDC,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address!],
      }),
  });
}
