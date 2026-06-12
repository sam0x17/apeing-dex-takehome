'use client';

import { useMutation } from '@tanstack/react-query';
import type { Address } from 'viem';
import {
  preparePolymarketOrder,
  signPolymarketOrder,
  submitPolymarketOrder,
  type OrderIntent,
  type SubmitResult,
} from '@/lib/polymarket';
import { POLYGON_CHAIN_ID } from '@/lib/chains';
import { switchChain } from '@/lib/wallet';

export interface TradeOutcome {
  result: SubmitResult;
  signature: `0x${string}`;
}

/**
 * Drive the order execution boundary: prepare the V2 order struct, collect
 * a real EIP-712 signature from the connected EOA, then hit the submit
 * boundary (which reports what production credentials are still missing).
 */
export function useTrade(account?: Address) {
  return useMutation<TradeOutcome, Error, OrderIntent>({
    mutationFn: async (intent) => {
      if (!account) throw new Error('Wallet is not connected.');
      const walletClient = await switchChain(POLYGON_CHAIN_ID);
      const order = preparePolymarketOrder(intent, account);
      const signature = await signPolymarketOrder(
        walletClient,
        order,
        intent.market,
      );
      const result = await submitPolymarketOrder(order, signature);
      return { result, signature };
    },
  });
}
