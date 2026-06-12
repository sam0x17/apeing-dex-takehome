'use client';

import { getRoutes } from '@lifi/sdk';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { Address } from 'viem';
import { parseUsdcAmount } from '@/lib/amount';
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_USDC,
  POLYGON_CHAIN_ID,
  PUSD,
} from '@/lib/chains';
import { getLifiClient, LIFI_ROUTE_OPTIONS } from '@/lib/lifi';
import { summarizeRoute } from '@/lib/quote';

/** Fetch the best Arbitrum USDC → Polygon pUSD route for `amount`. */
export async function fetchBridgeRoute(amount: bigint, account: Address) {
  const result = await getRoutes(getLifiClient(), {
    fromChainId: ARBITRUM_CHAIN_ID,
    fromTokenAddress: ARBITRUM_USDC,
    fromAmount: amount.toString(),
    fromAddress: account,
    toChainId: POLYGON_CHAIN_ID,
    toTokenAddress: PUSD,
    toAddress: account,
    options: LIFI_ROUTE_OPTIONS,
  });
  const route = result.routes[0];
  if (!route) {
    throw new Error(
      'No bridge route available for this amount. Try a different amount.',
    );
  }
  return route;
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * Live quote for the bridge form. Debounced and auto-refreshed every 30s so
 * the preview stays honest, but execution NEVER uses this route object — the
 * bridge button re-fetches a fresh route immediately before executeRoute.
 */
export function useBridgeQuote(amountInput: string, account?: Address) {
  const debouncedInput = useDebounced(amountInput, 400);
  const amount = parseUsdcAmount(debouncedInput);

  return useQuery({
    queryKey: ['bridge-quote', debouncedInput, account],
    enabled: !!account && amount !== undefined,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async () => {
      const route = await fetchBridgeRoute(amount!, account!);
      return { route, summary: summarizeRoute(route) };
    },
  });
}
