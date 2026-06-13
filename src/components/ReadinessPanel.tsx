'use client';

import type { Address } from 'viem';
import { useReadiness } from '@/hooks/useReadiness';
import { MIN_USABLE_ALLOWANCE } from '@/lib/approvals';
import { FIXED_MARKET } from '@/lib/polymarket';
import { Button, Dot, ErrorNote, Panel } from './ui';

export function ReadinessPanel({ account }: { account?: Address }) {
  const readiness = useReadiness(account, FIXED_MARKET);

  return (
    <Panel step={3} title="Trade readiness — Polymarket V2 approvals">
      {!account ? (
        <p className="text-sm text-zinc-500">
          Connect a wallet to check approvals.
        </p>
      ) : readiness.isLoading ? (
        <p className="text-sm text-zinc-500 animate-pulse">
          Checking allowances and operator approvals…
        </p>
      ) : (
        <>
          {readiness.state && (
            <div className="flex flex-col gap-1.5">
              {readiness.state.allowances.map(({ spender, allowance }) => (
                <div
                  key={`a-${spender.address}`}
                  className="flex items-center gap-2 text-sm text-zinc-300"
                >
                  <Dot tone={allowance >= MIN_USABLE_ALLOWANCE ? 'ok' : 'warn'} />
                  <span>pUSD allowance → {spender.name}</span>
                </div>
              ))}
              {readiness.state.operators.map(({ operator, approved }) => (
                <div
                  key={`o-${operator.address}`}
                  className="flex items-center gap-2 text-sm text-zinc-300"
                >
                  <Dot tone={approved ? 'ok' : 'warn'} />
                  <span>Outcome-token operator → {operator.name}</span>
                </div>
              ))}
            </div>
          )}

          {readiness.ready ? (
            <div className="rounded-lg border border-emerald-800 bg-emerald-950/40 px-3 py-2 text-sm font-medium text-emerald-300">
              ✓ Ready to trade
            </div>
          ) : (
            <>
              <Button
                onClick={() => readiness.approve()}
                disabled={readiness.approving}
              >
                {readiness.approving
                  ? 'Submitting approvals…'
                  : `Set approvals (${readiness.plan?.length ?? 0} transaction${(readiness.plan?.length ?? 0) === 1 ? '' : 's'})`}
              </Button>
              <p className="text-xs text-zinc-600">
                Only missing approvals are submitted — approvals already set
                are skipped, so this is safe to re-run at any time.
              </p>
            </>
          )}

          {readiness.error ? (
            <ErrorNote>{readiness.error.message}</ErrorNote>
          ) : null}
        </>
      )}
    </Panel>
  );
}
