'use client';

import type { EIP1193Provider } from 'viem';

/**
 * EIP-6963 multi-injected-provider discovery.
 *
 * Talking to `window.ethereum` directly breaks when more than one wallet is
 * installed: whichever extension grabbed the global wins, so MetaMask can be
 * shadowed by e.g. Phantom's EVM provider. EIP-6963 fixes this — the page
 * dispatches `eip6963:requestProvider`, each wallet answers with an
 * `eip6963:announceProvider` event carrying its own provider + metadata, and
 * the user picks. We keep `window.ethereum` only as a last-resort fallback.
 */

export interface EIP6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  /** Reverse-DNS wallet id, e.g. "io.metamask" — stable dedupe key. */
  rdns: string;
}

export interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: EIP1193Provider;
}

interface AnnounceEvent extends CustomEvent {
  detail: EIP6963ProviderDetail;
}

/**
 * Merge a freshly-announced provider into the known list.
 *
 * Pure and unit-tested: dedupe by `rdns` (a wallet may announce repeatedly —
 * once on load and again per request — and the latest wins), then sort by
 * name so the picker order is deterministic.
 */
export function upsertProviderDetail(
  list: readonly EIP6963ProviderDetail[],
  detail: EIP6963ProviderDetail,
): EIP6963ProviderDetail[] {
  const next = list.filter((d) => d.info.rdns !== detail.info.rdns);
  next.push(detail);
  next.sort((a, b) => a.info.name.localeCompare(b.info.name));
  return next;
}

/** Stable empty snapshot for SSR / pre-discovery (referential identity). */
export const NO_WALLETS: readonly EIP6963ProviderDetail[] = Object.freeze([]);

let details: readonly EIP6963ProviderDetail[] = NO_WALLETS;
const listeners = new Set<() => void>();
let started = false;

function emit() {
  for (const l of listeners) l();
}

/**
 * Begin (idempotently) listening for wallet announcements and ask wallets to
 * announce. Safe to call from every component mount.
 */
export function startWalletDiscovery(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('eip6963:announceProvider', (event) => {
    details = upsertProviderDetail(details, (event as AnnounceEvent).detail);
    emit();
  });
  window.dispatchEvent(new Event('eip6963:requestProvider'));
}

export function subscribeWalletDiscovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWalletDetails(): readonly EIP6963ProviderDetail[] {
  return details;
}
