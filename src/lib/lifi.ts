'use client';

import { createClient, type SDKClient } from '@lifi/sdk';
import { EthereumProvider } from '@lifi/sdk-provider-ethereum';
import type { RouteOptions } from '@lifi/types';
import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_RPC,
  POLYGON_CHAIN_ID,
  POLYGON_RPC,
} from './chains';
import { getWalletClient, switchChain } from './wallet';

export const LIFI_INTEGRATOR =
  process.env.NEXT_PUBLIC_LIFI_INTEGRATOR ?? 'sam-johnson-assessment';

/**
 * Route options required by the assessment. Note: 'SAFEST' is deprecated
 * upstream (Li.Fi treats it as 'RECOMMENDED'-era ordering) but remains a
 * valid API value; we pass it as specified.
 */
export const LIFI_ROUTE_OPTIONS: RouteOptions = {
  integrator: LIFI_INTEGRATOR,
  slippage: 0.005,
  executionType: 'all',
  order: 'SAFEST',
};

let client: SDKClient | undefined;

/** Lazily-created Li.Fi SDK client wired to the injected wallet. */
export function getLifiClient(): SDKClient {
  client ??= createClient({
    integrator: LIFI_INTEGRATOR,
    routeOptions: LIFI_ROUTE_OPTIONS,
    rpcUrls: {
      [POLYGON_CHAIN_ID]: [POLYGON_RPC],
      [ARBITRUM_CHAIN_ID]: [ARBITRUM_RPC],
    },
    providers: [
      EthereumProvider({
        getWalletClient: async () => getWalletClient(),
        switchChain: async (chainId) => switchChain(chainId),
      }),
    ],
  });
  return client;
}
