'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  getWalletDetails,
  NO_WALLETS,
  startWalletDiscovery,
  subscribeWalletDiscovery,
  type EIP6963ProviderDetail,
} from '@/lib/eip6963';

/** EIP-6963 wallets discovered in the browser (MetaMask, Phantom, …). */
export function useWallets(): readonly EIP6963ProviderDetail[] {
  useEffect(() => {
    startWalletDiscovery();
  }, []);
  return useSyncExternalStore(
    subscribeWalletDiscovery,
    getWalletDetails,
    () => NO_WALLETS,
  );
}
