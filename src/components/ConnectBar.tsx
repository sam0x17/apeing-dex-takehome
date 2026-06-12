'use client';

import { useWallet } from '@/hooks/useWallet';
import { ARBITRUM_CHAIN_ID, POLYGON_CHAIN_ID } from '@/lib/chains';
import { shortenAddress } from '@/lib/format';
import { Button, Dot, ErrorNote } from './ui';

const CHAIN_NAMES: Record<number, string> = {
  [POLYGON_CHAIN_ID]: 'Polygon',
  [ARBITRUM_CHAIN_ID]: 'Arbitrum',
};

export function ConnectBar() {
  const wallet = useWallet();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">
            Polymarket V2 cross-chain deposit & trade readiness
          </h1>
          <p className="text-sm text-zinc-500">
            Bridge → pUSD balance → approvals → fixed-market trade path
          </p>
        </div>
        {wallet.status === 'connected' && wallet.address ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-sm text-zinc-300">
              <Dot tone="ok" />
              {shortenAddress(wallet.address)}
              <span className="text-zinc-500">
                {(wallet.chainId !== undefined &&
                  CHAIN_NAMES[wallet.chainId]) ||
                  (wallet.chainId !== undefined
                    ? `chain ${wallet.chainId}`
                    : '')}
              </span>
            </span>
            <Button variant="secondary" onClick={wallet.disconnect}>
              Disconnect
            </Button>
          </div>
        ) : (
          <Button
            onClick={wallet.connect}
            disabled={wallet.status === 'connecting'}
          >
            {wallet.status === 'connecting' ? 'Connecting…' : 'Connect wallet'}
          </Button>
        )}
      </div>
      {wallet.connectError && <ErrorNote>{wallet.connectError}</ErrorNote>}
    </div>
  );
}
