'use client';

import { createClient, type SDKClient } from '@lifi/sdk';
import { EthereumProvider } from '@lifi/sdk-provider-ethereum';
import type { ExecutionType, RouteOptions } from '@lifi/types';
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
// e2e overrides: 'transaction' keeps the source leg an on-chain tx the fork
// can observe; the deny list excludes tools whose source txs depend on
// off-chain state that doesn't hold on a fork (e.g. Mayan Swift auctions).
const denyBridges = process.env.NEXT_PUBLIC_LIFI_BRIDGE_DENY?.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const LIFI_ROUTE_OPTIONS: RouteOptions = {
  integrator: LIFI_INTEGRATOR,
  slippage: 0.005,
  // 'all' per the assessment.
  executionType: (process.env.NEXT_PUBLIC_LIFI_EXECUTION_TYPE ??
    'all') as ExecutionType,
  order: 'SAFEST',
  ...(denyBridges?.length ? { bridges: { deny: denyBridges } } : {}),
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
        // e2e: force plain approve txs — the native-permit (EIP-2612)
        // shortcut can't be validated against a forked chain.
        disableMessageSigning:
          process.env.NEXT_PUBLIC_LIFI_DISABLE_MESSAGE_SIGNING === '1',
      }),
    ],
  });
  return client;
}
