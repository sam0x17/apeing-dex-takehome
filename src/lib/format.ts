import { formatUnits } from 'viem';

/**
 * Format a raw token amount for display: thousands separators and a
 * sensible number of fraction digits (full precision is never needed in UI).
 */
export function formatTokenAmount(
  raw: bigint,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const asNumber = Number(formatUnits(raw, decimals));
  return asNumber.toLocaleString('en-US', {
    maximumFractionDigits: maxFractionDigits,
  });
}

export function formatUsd(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortenHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** Format seconds as a compact ETA, e.g. "~3m 20s". */
export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  if (m === 0) return `~${s}s`;
  if (s === 0) return `~${m}m`;
  return `~${m}m ${s}s`;
}
