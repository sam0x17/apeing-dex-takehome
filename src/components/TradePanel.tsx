'use client';

import { useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useBookTop } from '@/hooks/useOrderBook';
import { useReadiness } from '@/hooks/useReadiness';
import { useTokenBalanceGate } from '@/hooks/useTradeGate';
import { useTrade } from '@/hooks/useTrade';
import { PUSD_DECIMALS, PUSD_SYMBOL } from '@/lib/chains';
import { formatPercent, formatTokenAmount, formatUsd } from '@/lib/format';
import {
  FIXED_MARKET,
  impliedProbability,
  parseOrderShares,
  type OrderSide,
} from '@/lib/polymarket';
import { Button, ErrorNote, KV, Panel } from './ui';

function shortTokenId(id: string): string {
  return `${id.slice(0, 8)}…${id.slice(-6)}`;
}

export function TradePanel({ account }: { account?: Address }) {
  const [outcome, setOutcome] = useState<'YES' | 'NO'>('YES');
  const [sharesInput, setSharesInput] = useState(String(FIXED_MARKET.minOrderSize));
  const readiness = useReadiness(account, FIXED_MARKET);
  const gate = useTokenBalanceGate(account);
  const trade = useTrade(account);
  // Both books so each outcome button can show its own live implied odds.
  const yesBook = useBookTop(FIXED_MARKET.yesTokenId);
  const noBook = useBookTop(FIXED_MARKET.noTokenId);
  const book = outcome === 'YES' ? yesBook : noBook;
  const odds = {
    YES: yesBook.data ? impliedProbability(yesBook.data) : undefined,
    NO: noBook.data ? impliedProbability(noBook.data) : undefined,
  };

  const parsedShares = parseOrderShares(sharesInput, FIXED_MARKET);
  const shares = parsedShares.ok ? parsedShares.shares : undefined;

  // Estimated buy cost: marketable ask (or midpoint) × shares, in pUSD.
  const buyPrice = book.data?.bestAsk?.price ?? book.data?.midpoint;
  const estBuyCost = buyPrice && shares ? buyPrice * shares : undefined;
  const balancePusd =
    gate.balance !== undefined
      ? Number(formatUnits(gate.balance, PUSD_DECIMALS))
      : undefined;
  const affordable =
    estBuyCost === undefined ||
    balancePusd === undefined ||
    estBuyCost <= balancePusd;

  const ready = readiness.ready === true;
  const hasBalance = gate.hasPusd === true;
  const baseEnabled =
    !!account && ready && hasBalance && shares !== undefined && !trade.isPending;

  const place = (side: OrderSide) => {
    if (shares === undefined) return;
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
      shares,
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
            <span className="flex items-baseline justify-center gap-2">
              {o}
              <span className="text-base font-semibold text-zinc-100">
                {formatPercent(odds[o])}
              </span>
            </span>
            <span className="block text-[10px] font-normal text-zinc-500">
              {shortTokenId(o === 'YES' ? FIXED_MARKET.yesTokenId : FIXED_MARKET.noTokenId)}
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-1">
        <KV label={`Implied odds (${outcome})`}>
          {book.data ? formatPercent(impliedProbability(book.data)) : '—'}
        </KV>
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

      <div className="flex flex-col gap-1">
        <label htmlFor="trade-shares" className="text-sm text-zinc-400">
          Shares
        </label>
        <input
          id="trade-shares"
          inputMode="decimal"
          value={sharesInput}
          onChange={(e) => setSharesInput(e.target.value)}
          disabled={trade.isPending}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-50"
        />
        <p className="text-xs text-zinc-500">
          {!parsedShares.ok
            ? parsedShares.error
            : estBuyCost !== undefined
              ? `≈ ${formatUsd(estBuyCost)} to buy at the current ask (min ${FIXED_MARKET.minOrderSize} shares)`
              : `Minimum ${FIXED_MARKET.minOrderSize} shares`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => place('BUY')}
          disabled={!baseEnabled || !affordable}
        >
          Buy {shares ?? FIXED_MARKET.minOrderSize} {outcome}
        </Button>
        <Button
          variant="danger"
          onClick={() => place('SELL')}
          disabled={!baseEnabled}
        >
          Sell {shares ?? FIXED_MARKET.minOrderSize} {outcome}
        </Button>
      </div>

      {baseEnabled && !affordable && (
        <p className="text-xs text-amber-500">
          Buying {shares} {outcome} costs ≈ {formatUsd(estBuyCost ?? 0)}, more
          than your pUSD balance. Sell is still available.
        </p>
      )}

      {!baseEnabled && (
        <p className="text-xs text-zinc-600">
          {!account
            ? 'Connect a wallet to trade.'
            : !ready
              ? 'Complete the approvals in panel 3 first.'
              : !hasBalance
                ? 'Bridge some pUSD in panel 1 first — trading needs a positive pUSD balance.'
                : shares === undefined
                  ? 'Enter a valid number of shares.'
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
