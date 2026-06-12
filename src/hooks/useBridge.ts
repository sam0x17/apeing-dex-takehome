'use client';

import { executeRoute } from '@lifi/sdk';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useState } from 'react';
import type { Address } from 'viem';
import {
  deriveBridgeProgress,
  type BridgeProgress,
} from '@/lib/bridgeLifecycle';
import { getLifiClient } from '@/lib/lifi';
import { checkRoutePricing } from '@/lib/routeGuard';
import { fetchBridgeRoute } from './useBridgeQuote';
import { PUSD_BALANCE_QUERY_KEY } from './useTokenBalances';

const IDLE: BridgeProgress = { phase: 'idle' };

export interface UseBridge {
  progress: BridgeProgress;
  /** True while a bridge is in flight (quoting through settlement). */
  busy: boolean;
  start: (amount: bigint, account: Address) => Promise<void>;
  reset: () => void;
}

/**
 * Bridge execution state machine.
 *
 * `start` always fetches a FRESH route immediately before executeRoute —
 * the preview quote shown in the form is never executed. The fresh route
 * must pass the pricing sanity guard or we abort before any wallet prompt.
 */
export function useBridge(): UseBridge {
  const [progress, setProgress] = useState<BridgeProgress>(IDLE);
  const queryClient = useQueryClient();
  const inFlight = useRef(false);

  const start = useCallback(
    async (amount: bigint, account: Address) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setProgress({ phase: 'quoting' });

      try {
        const route = await fetchBridgeRoute(amount, account);

        const guard = checkRoutePricing(route);
        if (!guard.ok) {
          setProgress({ phase: 'failed', message: guard.reason });
          return;
        }

        setProgress({ phase: 'signing' });
        await executeRoute(getLifiClient(), route, {
          updateRouteHook: (updated) => {
            const next = deriveBridgeProgress(updated);
            setProgress(next);
            // Funds may land before the final DONE tick; keep the balance
            // panel honest as soon as the destination side settles.
            if (next.phase === 'done') {
              queryClient.invalidateQueries({
                queryKey: [PUSD_BALANCE_QUERY_KEY],
              });
            }
          },
        });
      } catch (error) {
        setProgress((prev) =>
          // executeRoute rejects after the hook already reported FAILED;
          // don't clobber a more specific message.
          prev.phase === 'failed'
            ? prev
            : {
                phase: 'failed',
                message: toReadableBridgeError(error),
              },
        );
      } finally {
        inFlight.current = false;
        queryClient.invalidateQueries({ queryKey: [PUSD_BALANCE_QUERY_KEY] });
      }
    },
    [queryClient],
  );

  const reset = useCallback(() => setProgress(IDLE), []);

  return {
    progress,
    busy:
      progress.phase !== 'idle' &&
      progress.phase !== 'done' &&
      progress.phase !== 'failed',
    start,
    reset,
  };
}

function toReadableBridgeError(error: unknown): string {
  const code = (error as { code?: number | string }).code;
  if (code === 4001 || code === 'ACTION_REJECTED') {
    return 'Transaction was rejected in the wallet.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'Bridge execution failed. Your funds were not moved if no transaction was signed.';
}
