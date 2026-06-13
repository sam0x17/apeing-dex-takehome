'use client';

import { useState } from 'react';
import { formatUnits, type Address } from 'viem';
import { useBridge } from '@/hooks/useBridge';
import { useBridgeQuote } from '@/hooks/useBridgeQuote';
import { useArbitrumUsdcBalance } from '@/hooks/useTokenBalances';
import { parseUsdcAmount } from '@/lib/amount';
import {
  ARBITRUM_USDC_DECIMALS,
  PUSD_DECIMALS,
  PUSD_SYMBOL,
} from '@/lib/chains';
import { formatEta, formatTokenAmount, formatUsd } from '@/lib/format';
import { BridgeProgressSteps } from './BridgeProgressSteps';
import { Button, ErrorNote, KV, Panel } from './ui';

export function BridgePanel({ account }: { account?: Address }) {
  const [amountInput, setAmountInput] = useState('');
  const quote = useBridgeQuote(amountInput, account);
  const bridge = useBridge();
  const sourceBalance = useArbitrumUsdcBalance(account);

  const amount = parseUsdcAmount(amountInput);
  // Gas on Arbitrum is paid in ETH, not USDC, so the full USDC balance is
  // safe to bridge — no need to hold any back. Use full precision (no commas)
  // so the value parses cleanly.
  const hasFunds = sourceBalance.data !== undefined && sourceBalance.data > 0n;
  const setMax = () => {
    if (sourceBalance.data !== undefined) {
      setAmountInput(formatUnits(sourceBalance.data, ARBITRUM_USDC_DECIMALS));
    }
  };

  const summary = quote.data?.summary;
  const guardFailed = summary !== undefined && !summary.guard.ok;
  const insufficient =
    amount !== undefined &&
    sourceBalance.data !== undefined &&
    amount > sourceBalance.data;

  const canBridge =
    !!account &&
    amount !== undefined &&
    !insufficient &&
    !bridge.busy &&
    summary !== undefined &&
    summary.guard.ok;

  return (
    <Panel step={1} title="Bridge — Arbitrum USDC → Polygon pUSD">
      <div className="flex flex-col gap-1">
        <label htmlFor="bridge-amount" className="text-sm text-zinc-400">
          Amount (USDC on Arbitrum)
        </label>
        <div className="relative">
          <input
            id="bridge-amount"
            inputMode="decimal"
            placeholder="10.00"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            disabled={bridge.busy}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 pr-16 text-zinc-100 outline-none focus:border-emerald-500 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={setMax}
            disabled={bridge.busy || !hasFunds}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-zinc-700 px-2 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Max
          </button>
        </div>
        {sourceBalance.data !== undefined && (
          <p className="text-xs text-zinc-500">
            Balance:{' '}
            {formatTokenAmount(sourceBalance.data, ARBITRUM_USDC_DECIMALS)} USDC
          </p>
        )}
        {insufficient && (
          <ErrorNote>Amount exceeds your Arbitrum USDC balance.</ErrorNote>
        )}
      </div>

      {amount !== undefined && (
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 flex flex-col gap-1">
          {quote.isLoading && (
            <p className="text-sm text-zinc-500 animate-pulse">
              Fetching live quote…
            </p>
          )}
          {quote.error && (
            <ErrorNote>{quote.error.message}</ErrorNote>
          )}
          {summary && (
            <>
              <KV label="Expected receive">
                {formatTokenAmount(summary.toAmount, PUSD_DECIMALS)}{' '}
                {PUSD_SYMBOL}{' '}
                <span className="text-zinc-500">
                  (min {formatTokenAmount(summary.toAmountMin, PUSD_DECIMALS)})
                </span>
              </KV>
              <KV label="Fees + gas">
                {formatUsd(summary.feeUSD)} + {formatUsd(summary.gasUSD)} gas
              </KV>
              <KV label="ETA">{formatEta(summary.etaSeconds)}</KV>
              <KV label="Bridge">{summary.tools.join(' → ')}</KV>
              {guardFailed && !summary.guard.ok && (
                <ErrorNote>{summary.guard.reason}</ErrorNote>
              )}
            </>
          )}
        </div>
      )}

      <Button
        onClick={() => account && amount !== undefined && bridge.start(amount, account)}
        disabled={!canBridge}
      >
        {bridge.busy ? 'Bridging…' : 'Bridge'}
      </Button>
      <p className="text-xs text-zinc-600">
        A fresh route is fetched and re-checked against the pricing guard
        immediately before execution; the preview above is never executed
        as-is. Complete only after destination settlement.
      </p>

      <BridgeProgressSteps progress={bridge.progress} />
      {(bridge.progress.phase === 'done' ||
        bridge.progress.phase === 'failed') && (
        <Button variant="secondary" onClick={bridge.reset}>
          Start another bridge
        </Button>
      )}
    </Panel>
  );
}
