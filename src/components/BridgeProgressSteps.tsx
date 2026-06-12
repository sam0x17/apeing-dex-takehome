'use client';

import type { BridgePhase, BridgeProgress } from '@/lib/bridgeLifecycle';
import { Dot, ErrorNote, TxLink } from './ui';

const STEPS: { phase: BridgePhase; label: string }[] = [
  { phase: 'quoting', label: 'Fetching fresh route' },
  { phase: 'signing', label: 'Waiting for wallet signature' },
  { phase: 'sourceSubmitted', label: 'Source transaction submitted' },
  { phase: 'awaitingDestination', label: 'Awaiting destination settlement' },
  { phase: 'done', label: 'pUSD received on Polygon' },
];

const ORDER: BridgePhase[] = STEPS.map((s) => s.phase);

export function BridgeProgressSteps({ progress }: { progress: BridgeProgress }) {
  if (progress.phase === 'idle') return null;

  const failed = progress.phase === 'failed';
  // On failure, freeze the checklist at the furthest milestone we reached.
  const reachedIndex = failed
    ? progress.sourceTxHash
      ? ORDER.indexOf('sourceSubmitted')
      : ORDER.indexOf('signing')
    : ORDER.indexOf(progress.phase);

  return (
    <div className="flex flex-col gap-1.5">
      {STEPS.map(({ phase, label }, i) => {
        const isCurrent = i === reachedIndex;
        const isPast = i < reachedIndex || progress.phase === 'done';
        return (
          <div
            key={phase}
            className={`flex items-center gap-2 text-sm ${
              isPast
                ? 'text-zinc-300'
                : isCurrent
                  ? failed
                    ? 'text-rose-300'
                    : 'text-zinc-100'
                  : 'text-zinc-600'
            }`}
          >
            <Dot
              tone={
                isPast ? 'ok' : isCurrent ? (failed ? 'err' : 'warn') : 'idle'
              }
            />
            <span>{label}</span>
            {isCurrent && !failed && progress.phase !== 'done' && (
              <span className="animate-pulse text-zinc-500">…</span>
            )}
          </div>
        );
      })}

      <div className="mt-1 flex flex-col gap-0.5">
        {progress.sourceTxHash && (
          <TxLink
            href={progress.sourceTxLink}
            hash={progress.sourceTxHash}
            label="Source tx"
          />
        )}
        {progress.destinationTxHash && (
          <TxLink
            href={progress.destinationTxLink}
            hash={progress.destinationTxHash}
            label="Destination tx"
          />
        )}
      </div>

      {failed && (
        <ErrorNote>{progress.message ?? 'Bridge failed.'}</ErrorNote>
      )}
      {!failed && progress.message && (
        <p className="text-xs text-zinc-500">{progress.message}</p>
      )}
    </div>
  );
}
