import { parseUnits } from 'viem';
import { ARBITRUM_USDC_DECIMALS } from './chains';

/**
 * Parse free-form user input into raw USDC units.
 * Returns undefined for anything that isn't a positive decimal number.
 */
export function parseUsdcAmount(input: string): bigint | undefined {
  const trimmed = input.trim();
  if (!trimmed || !/^\d*\.?\d*$/.test(trimmed)) return undefined;
  try {
    const amount = parseUnits(trimmed, ARBITRUM_USDC_DECIMALS);
    return amount > 0n ? amount : undefined;
  } catch {
    return undefined;
  }
}
