import type { Route } from '@lifi/types';
import { checkRoutePricing, type RouteGuardResult } from './routeGuard';

/** Display-ready summary of a Li.Fi route quote. */
export interface QuoteSummary {
  /** Expected pUSD received, raw units (token decimals apply). */
  toAmount: bigint;
  /** Guaranteed minimum after slippage, raw units. */
  toAmountMin: bigint;
  toAmountUSD: string;
  fromAmountUSD: string;
  /** Bridge/exchange fees in USD (both included-in-quote and on-top). */
  feeUSD: number;
  /** Estimated source-side gas in USD. */
  gasUSD: number;
  /** Total estimated execution time in seconds across all steps. */
  etaSeconds: number;
  /** Bridge/tool names along the route, e.g. ["Stargate"]. */
  tools: string[];
  /** Result of the toAmountUSD/fromAmountUSD pricing sanity guard. */
  guard: RouteGuardResult;
}

export function summarizeRoute(route: Route): QuoteSummary {
  const feeUSD = route.steps
    .flatMap((s) => s.estimate.feeCosts ?? [])
    .reduce((sum, fee) => sum + Number(fee.amountUSD || 0), 0);

  const gasUSD = Number(route.gasCostUSD || 0);

  const etaSeconds = route.steps.reduce(
    (sum, s) => sum + (s.estimate.executionDuration ?? 0),
    0,
  );

  const tools = [...new Set(route.steps.map((s) => s.toolDetails.name))];

  return {
    toAmount: BigInt(route.toAmount),
    toAmountMin: BigInt(route.toAmountMin),
    toAmountUSD: route.toAmountUSD,
    fromAmountUSD: route.fromAmountUSD,
    feeUSD,
    gasUSD,
    etaSeconds,
    tools,
    guard: checkRoutePricing(route),
  };
}
