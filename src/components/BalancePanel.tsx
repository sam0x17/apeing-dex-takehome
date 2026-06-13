'use client';

import type { Address } from 'viem';
import { usePusdBalance } from '@/hooks/useTokenBalances';
import { PUSD, PUSD_DECIMALS, PUSD_SYMBOL } from '@/lib/chains';
import { formatTokenAmount, shortenAddress } from '@/lib/format';
import { Button, ErrorNote, KV, Panel } from './ui';

export function BalancePanel({ account }: { account?: Address }) {
  const balance = usePusdBalance(account);

  return (
    <Panel step={2} title="pUSD balance on Polygon">
      {!account ? (
        <p className="text-sm text-zinc-500">Connect a wallet to see your balance.</p>
      ) : (
        <>
          <div className="text-3xl font-semibold text-zinc-100">
            {balance.data !== undefined ? (
              <>
                {formatTokenAmount(balance.data, PUSD_DECIMALS)}{' '}
                <span className="text-lg text-zinc-400">{PUSD_SYMBOL}</span>
              </>
            ) : balance.isLoading ? (
              <span className="animate-pulse text-zinc-600">…</span>
            ) : (
              '—'
            )}
          </div>
          {balance.error && (
            <ErrorNote>
              Could not read balance: {balance.error.message}
            </ErrorNote>
          )}
          <KV label="Token">
            <a
              href={`https://polygonscan.com/token/${PUSD}`}
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:underline"
            >
              {shortenAddress(PUSD)} ↗
            </a>
          </KV>
          <KV label="Wallet">{shortenAddress(account)}</KV>
          <Button
            variant="secondary"
            onClick={() => balance.refetch()}
            disabled={balance.isFetching}
          >
            {balance.isFetching ? 'Refreshing…' : 'Refresh'}
          </Button>
          <p className="text-xs text-zinc-600">
            Auto-refetches after the bridge settles and every 30s.
          </p>
        </>
      )}
    </Panel>
  );
}
