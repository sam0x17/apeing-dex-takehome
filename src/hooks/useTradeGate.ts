'use client';

import type { Address } from 'viem';
import { usePusdBalance } from './useTokenBalances';

/** Trade gating on pUSD funds: defined only once the balance has loaded. */
export function useTokenBalanceGate(account?: Address) {
  const balance = usePusdBalance(account);
  return {
    balance: balance.data,
    hasPusd: balance.data === undefined ? undefined : balance.data > 0n,
  };
}
