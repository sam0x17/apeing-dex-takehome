import { describe, expect, it } from 'vitest';
import {
  formatEta,
  formatPercent,
  formatTokenAmount,
  formatUsd,
  shortenAddress,
} from './format';

describe('formatTokenAmount', () => {
  it('formats 6-decimal token amounts', () => {
    expect(formatTokenAmount(9_950_000n, 6)).toBe('9.95');
    expect(formatTokenAmount(1_234_567_000_000n, 6)).toBe('1,234,567');
  });

  it('caps fraction digits', () => {
    expect(formatTokenAmount(1_123_456n, 6, 2)).toBe('1.12');
  });

  it('handles zero', () => {
    expect(formatTokenAmount(0n, 6)).toBe('0');
  });
});

describe('formatUsd', () => {
  it('formats numbers and numeric strings', () => {
    expect(formatUsd(1.5)).toBe('$1.50');
    expect(formatUsd('10')).toBe('$10.00');
  });

  it('falls back for non-numeric input', () => {
    expect(formatUsd('not-a-number')).toBe('—');
  });
});

describe('formatEta', () => {
  it('formats seconds, minutes, and mixed', () => {
    expect(formatEta(45)).toBe('~45s');
    expect(formatEta(120)).toBe('~2m');
    expect(formatEta(200)).toBe('~3m 20s');
  });

  it('handles nonsense input', () => {
    expect(formatEta(0)).toBe('—');
    expect(formatEta(Number.NaN)).toBe('—');
  });
});

describe('formatPercent', () => {
  it('formats a fraction as a percentage, up to one decimal', () => {
    expect(formatPercent(0.58)).toBe('58%');
    expect(formatPercent(0.585)).toBe('58.5%');
    expect(formatPercent(1)).toBe('100%');
  });

  it('falls back for undefined / non-finite', () => {
    expect(formatPercent(undefined)).toBe('—');
    expect(formatPercent(Number.NaN)).toBe('—');
  });
});

describe('shortenAddress', () => {
  it('keeps prefix and suffix', () => {
    expect(
      shortenAddress('0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB'),
    ).toBe('0xC011…2DFB');
  });
});
