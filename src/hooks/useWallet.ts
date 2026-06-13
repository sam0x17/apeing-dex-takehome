'use client';

import { useCallback, useState, useSyncExternalStore } from 'react';
import type { EIP6963ProviderDetail } from '@/lib/eip6963';
import {
  connectWallet,
  disconnectWallet,
  getWalletState,
  subscribeWallet,
  type WalletState,
} from '@/lib/wallet';

const SERVER_SNAPSHOT: WalletState = { status: 'disconnected' };

export interface UseWallet extends WalletState {
  /** Connect a specific EIP-6963 wallet, or the fallback if omitted. */
  connect: (detail?: EIP6963ProviderDetail) => Promise<void>;
  disconnect: () => void;
  /** Readable error from the last connect attempt, if any. */
  connectError?: string;
}

export function useWallet(): UseWallet {
  const state = useSyncExternalStore(
    subscribeWallet,
    getWalletState,
    () => SERVER_SNAPSHOT,
  );
  const [connectError, setConnectError] = useState<string>();

  const connect = useCallback(async (detail?: EIP6963ProviderDetail) => {
    setConnectError(undefined);
    try {
      await connectWallet(detail);
    } catch (error) {
      const code = (error as { code?: number }).code;
      setConnectError(
        code === 4001
          ? 'Connection request was rejected in the wallet.'
          : error instanceof Error
            ? error.message
            : 'Failed to connect wallet.',
      );
    }
  }, []);

  return { ...state, connect, disconnect: disconnectWallet, connectError };
}
