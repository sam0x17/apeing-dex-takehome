import { describe, expect, it } from 'vitest';
import { parseUsdcAmount } from './amount';

describe('parseUsdcAmount', () => {
  it('parses whole and fractional amounts to 6dp units', () => {
    expect(parseUsdcAmount('10')).toBe(10_000_000n);
    expect(parseUsdcAmount('0.5')).toBe(500_000n);
    expect(parseUsdcAmount(' 1.25 ')).toBe(1_250_000n);
  });

  it('rejects empty, zero, and malformed input', () => {
    expect(parseUsdcAmount('')).toBeUndefined();
    expect(parseUsdcAmount('0')).toBeUndefined();
    expect(parseUsdcAmount('.')).toBeUndefined();
    expect(parseUsdcAmount('1e5')).toBeUndefined();
    expect(parseUsdcAmount('-1')).toBeUndefined();
    expect(parseUsdcAmount('10,5')).toBeUndefined();
    expect(parseUsdcAmount('abc')).toBeUndefined();
  });

  it('rejects sub-unit dust that parses to zero', () => {
    expect(parseUsdcAmount('0.0000001')).toBeUndefined();
  });
});
