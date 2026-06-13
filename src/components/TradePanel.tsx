'use client';

import { useState } from 'react';
import type { Address } from 'viem';
import { useBookTop } from '@/hooks/useOrderBook';
import { useReadiness } from '@/hooks/useReadiness';
import { useTokenBalanceGate } from '@/hooks/useTradeGate';
import { useTrade } from '@/hooks/useTrade';
import { PUSD_DECIMALS, PUSD_SYMBOL } from '@/lib/chains';
import { formatTokenAmount } from '@/lib/format';
import { FIXED_MARKET, type OrderSide } from '@/lib/polymarket';
import { Button, ErrorNote, KV, Panel } from './ui';

function shortTokenId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function TradePanel({ account }: { account?: Address }) {
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const readiness = useReadiness(account, FIXED_MARKET);
  const gate = useTokenBalanceGate(account);
  const trade = useTrade(account);
  const tokenId =
    outcome === 'YES' ? FIXED_MARKET.yesTokenId : FIXED_MARKET.noTokenId;
  const book = useBookTop(tokenId);

  const ready = readiness.ready === true;
  const hasBalance = gate.hasPusd === true;
  const enabled = !!account && ready && hasBalance && !trade.isPending;

  const place = (side: OrderSide) => {
    const top = book.data;
    // Cross the spread by one tick for a marketable limit order; fall back
    // to the midpoint if the book is one-sided.
    const price =
      side === 'BUY'
        ? (top?.bestAsk?.price ?? top?.midpoint ?? 0.5)
        : (top?.bestBid?.price ?? top?.midpoint ?? 0.5);
    trade.mutate({
      market: FIXED_MARKET,
      outcome,
      side,
      price: Math.round(price / FIXED_MARKET.tickSize) * FIXED_MARKET.tickSize,
      shares: FIXED_MARKET.minOrderSize,
    });
  };

  return (
    <Panel step={4} title="Fixed market — Polymarket V2 trade proof">
      <p className="text-sm font-medium text-zinc-100">{FIXED_MARKET.title}</p>

      <div className="grid grid-cols-2 gap-2">
        {(['YES', 'NO'] as const).map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setOutcome(o)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              outcome === o
                ? 'border-emerald-500 bg-emerald-950/40 text-emerald-300'
                : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500'
            }`}
          >
            {o}
            <span className="block text-[10px] font-normal text-zinc-500">
              {shortTokenId(o === 'YES' ? FIXED_MARKET.yesTokenId : FIXED_MARKET.noTokenId)}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-1">
        <KV label={`Best bid (${outcome})`}>
          {book.data?.bestBid
            ? `${book.data.bestBid.price.toFixed(2)} × ${book.data.bestBid.size}`
            : book.isLoading
              ? '…'
              : '—'}
        </KV>
        <KV label={`Best ask (${outcome})`}>
          {book.data?.bestAsk
            ? `${book.data.bestAsk.price.toFixed(2)} × ${book.data.bestAsk.size}`
            : book.isLoading
              ? '…'
              : '—'}
        </KV>
        <KV label="Your pUSD">
          {gate.balance !== undefined
            ? `${formatTokenAmount(gate.balance, PUSD_DECIMALS)} ${PUSD_SYMBOL}`
            : '—'}
        </KV>
        {book.error ? (
          <ErrorNote>{(book.error as Error).message}</ErrorNote>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => place('BUY')} disabled={!enabled}>
          Buy {FIXED_MARKET.minOrderSize} {outcome}
        </Button>
        <Button variant="danger" onClick={() => place('SELL')} disabled={!enabled}>
          Sell {FIXED_MARKET.minOrderSize} {outcome}
        </Button>
      </div>

      {!enabled && (
        <p className="text-xs text-zinc-600">
          {!account
            ? 'Connect a wallet to trade.'
            : !ready
              ? 'Complete the approvals in panel 3 first.'
              : !hasBalance
                ? 'Bridge some pUSD in panel 1 first — trading needs a positive pUSD balance.'
                : 'Signing order…'}
        </p>
      )}

      {trade.error && <ErrorNote>{trade.error.message}</ErrorNote>}

      {trade.data && (
        <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-xs text-amber-200 flex flex-col gap-2">
          <p className="font-medium">
            Order prepared and signed (EIP-712, V2 Order struct) — submission
            stops at the execution boundary:
          </p>
          <ul className="list-disc pl-4 flex flex-col gap-1">
            {trade.data.result.blockedBy.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <details>
            <summary className="cursor-pointer text-amber-300">
              POST {trade.data.result.request.url} payload
            </summary>
            <pre className="mt-1 overflow-x-auto rounded bg-zinc-950 p-2 text-[10px] text-zinc-300">
              {JSON.stringify(trade.data.result.request.body, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </Panel>
  );
}
