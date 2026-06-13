'use client';

import { useWallet } from '@/hooks/useWallet';
import { useWallets } from '@/hooks/useWallets';
import { ARBITRUM_CHAIN_ID, POLYGON_CHAIN_ID } from '@/lib/chains';
import { shortenAddress } from '@/lib/format';
import { Button, Dot, ErrorNote } from './ui';

const CHAIN_NAMES: Record<number, string> = {
  [POLYGON_CHAIN_ID]: 'Polygon',
  [ARBITRUM_CHAIN_ID]: 'Arbitrum',
};

export function ConnectBar() {
  const wallet = useWallet();
  const wallets = useWallets();
  const connecting = wallet.status === 'connecting';

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
        ) : wallets.length > 1 ? (
          // Multiple wallets installed: let the user pick, so a wallet like
          // Phantom can't shadow the MetaMask the user actually wants.
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-zinc-500">Connect with</span>
            <div className="flex flex-wrap justify-end gap-2">
              {wallets.map((detail) => (
                <Button
                  key={detail.info.rdns}
                  onClick={() => wallet.connect(detail)}
                  disabled={connecting}
                >
                  {detail.info.name}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <Button
            onClick={() => wallet.connect(wallets[0])}
            disabled={connecting}
          >
            {connecting ? 'Connecting…' : 'Connect wallet'}
          </Button>
        )}
      </div>
      {wallet.connectError && <ErrorNote>{wallet.connectError}</ErrorNote>}
    </div>
  );
}
