'use client';

import { BalancePanel } from '@/components/BalancePanel';
import { BridgePanel } from '@/components/BridgePanel';
import { ConnectBar } from '@/components/ConnectBar';
import { ReadinessPanel } from '@/components/ReadinessPanel';
import { TradePanel } from '@/components/TradePanel';
import { useWallet } from '@/hooks/useWallet';

export default function Home() {
  const { address } = useWallet();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <ConnectBar />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <BridgePanel account={address} />
        <BalancePanel account={address} />
        <ReadinessPanel account={address} />
        <TradePanel account={address} />
      </div>
      <footer className="text-xs text-zinc-600">
        Take-home assessment build — not production software. Bridge executes
        real transactions; trade submission stops at a documented execution
        boundary.
      </footer>
    </main>
  );
}
