import type { Route } from '@lifi/types';
import { describe, expect, it } from 'vitest';
import { summarizeRoute } from './quote';

function fakeRoute(): Route {
  return {
    id: 'r1',
    fromChainId: 42161,
    fromAmount: '10000000',
    fromAmountUSD: '10.00',
    toChainId: 137,
    toAmount: '9950000',
    toAmountMin: '9900000',
    toAmountUSD: '9.95',
    gasCostUSD: '0.02',
    steps: [
      {
        toolDetails: { key: 'stargate', name: 'Stargate', logoURI: '' },
        estimate: {
          executionDuration: 90,
          feeCosts: [
            { amountUSD: '0.03', included: true },
            { amountUSD: '0.01', included: false },
          ],
        },
      },
      {
        toolDetails: { key: 'stargate', name: 'Stargate', logoURI: '' },
        estimate: { executionDuration: 30, feeCosts: [] },
      },
    ],
  } as unknown as Route;
}

describe('summarizeRoute', () => {
  it('extracts receive amounts as bigints', () => {
    const s = summarizeRoute(fakeRoute());
    expect(s.toAmount).toBe(9_950_000n);
    expect(s.toAmountMin).toBe(9_900_000n);
  });

  it('sums fees across steps and reads route-level gas', () => {
    const s = summarizeRoute(fakeRoute());
    expect(s.feeUSD).toBeCloseTo(0.04);
    expect(s.gasUSD).toBeCloseTo(0.02);
  });

  it('sums execution duration across steps', () => {
    expect(summarizeRoute(fakeRoute()).etaSeconds).toBe(120);
  });

  it('dedupes tool names', () => {
    expect(summarizeRoute(fakeRoute()).tools).toEqual(['Stargate']);
  });

  it('runs the pricing guard on the route', () => {
    const s = summarizeRoute(fakeRoute());
    expect(s.guard.ok).toBe(true);

    const bad = fakeRoute();
    bad.toAmountUSD = '2.00';
    expect(summarizeRoute(bad).guard.ok).toBe(false);
  });
});
