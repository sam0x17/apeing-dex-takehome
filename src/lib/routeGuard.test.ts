import { describe, expect, it } from 'vitest';
import { checkRoutePricing } from './routeGuard';

describe('checkRoutePricing', () => {
  it('accepts a fair route (ratio ~1)', () => {
    const result = checkRoutePricing({ fromAmountUSD: '10.00', toAmountUSD: '9.95' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.ratio).toBeCloseTo(0.995);
  });

  it('accepts ratios exactly on the boundaries', () => {
    expect(checkRoutePricing({ fromAmountUSD: '10', toAmountUSD: '5' }).ok).toBe(true);
    expect(checkRoutePricing({ fromAmountUSD: '10', toAmountUSD: '15' }).ok).toBe(true);
  });

  it('rejects a route paying out too little (< 0.5)', () => {
    const result = checkRoutePricing({ fromAmountUSD: '10', toAmountUSD: '4.99' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.ratio).toBeCloseTo(0.499);
      expect(result.reason).toMatch(/sanity/i);
    }
  });

  it('rejects a route paying out suspiciously much (> 1.5)', () => {
    const result = checkRoutePricing({ fromAmountUSD: '10', toAmountUSD: '15.01' });
    expect(result.ok).toBe(false);
  });

  it('rejects routes with missing or zero USD valuations', () => {
    expect(checkRoutePricing({ fromAmountUSD: '', toAmountUSD: '10' }).ok).toBe(false);
    expect(checkRoutePricing({ fromAmountUSD: '0', toAmountUSD: '10' }).ok).toBe(false);
    expect(checkRoutePricing({ fromAmountUSD: '10', toAmountUSD: '' }).ok).toBe(false);
    expect(checkRoutePricing({ fromAmountUSD: '10', toAmountUSD: '0' }).ok).toBe(false);
    expect(checkRoutePricing({ fromAmountUSD: 'nan', toAmountUSD: '10' }).ok).toBe(false);
  });

  it('rejects negative valuations', () => {
    expect(checkRoutePricing({ fromAmountUSD: '-10', toAmountUSD: '10' }).ok).toBe(false);
  });
});
