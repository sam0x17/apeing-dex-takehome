import type { Route } from '@lifi/types';

/**
 * Pricing sanity guard required by the assessment:
 * reject routes where toAmountUSD / fromAmountUSD is outside [0.5, 1.5].
 *
 * This protects against mispriced quotes (bad oracle data, decimal bugs,
 * sandwich-prone routes) ever reaching execution.
 */
export const PRICE_RATIO_MIN = 0.5;
export const PRICE_RATIO_MAX = 1.5;

export type RouteGuardResult =
  | { ok: true; ratio: number }
  | { ok: false; reason: string; ratio?: number };

export function checkRoutePricing(
  route: Pick<Route, 'fromAmountUSD' | 'toAmountUSD'>,
): RouteGuardResult {
  const fromUSD = Number(route.fromAmountUSD);
  const toUSD = Number(route.toAmountUSD);

  if (!Number.isFinite(fromUSD) || fromUSD <= 0) {
    return { ok: false, reason: 'Route is missing a USD valuation for the source amount.' };
  }
  if (!Number.isFinite(toUSD) || toUSD <= 0) {
    return { ok: false, reason: 'Route is missing a USD valuation for the destination amount.' };
  }

  const ratio = toUSD / fromUSD;
  if (ratio < PRICE_RATIO_MIN || ratio > PRICE_RATIO_MAX) {
    return {
      ok: false,
      ratio,
      reason: `Route pricing failed the sanity check: you would receive ~${(ratio * 100).toFixed(1)}% of the USD value you send (allowed: ${PRICE_RATIO_MIN * 100}%–${PRICE_RATIO_MAX * 100}%).`,
    };
  }

  return { ok: true, ratio };
}
