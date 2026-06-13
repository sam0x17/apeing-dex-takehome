'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import {
  approvalToCall,
  computeApprovalPlan,
  CONDITIONAL_TOKENS,
  isReady,
  requiredApprovals,
  type ReadinessState,
} from '@/lib/approvals';
import { POLYGON_CHAIN_ID, PUSD } from '@/lib/chains';
import { CONDITIONAL_TOKENS_ABI, ERC20_ABI } from '@/lib/erc20';
import { getPolygonPublicClient, switchChain } from '@/lib/wallet';

const READINESS_QUERY_KEY = 'trade-readiness';

interface Market {
  negRisk: boolean;
}

/** One multicall round-trip for the market's allowances + operator approvals. */
async function fetchReadinessState(
  owner: Address,
  market: Market,
): Promise<ReadinessState> {
  const { pusdSpenders, ctfOperators } = requiredApprovals(market);
  const client = getPolygonPublicClient();

  const results = await client.multicall({
    allowFailure: false,
    contracts: [
      ...pusdSpenders.map((spender) => ({
        address: PUSD,
        abi: ERC20_ABI,
        functionName: 'allowance' as const,
        args: [owner, spender.address] as const,
      })),
      ...ctfOperators.map((operator) => ({
        address: CONDITIONAL_TOKENS,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: 'isApprovedForAll' as const,
        args: [owner, operator.address] as const,
      })),
    ],
  });

  return {
    allowances: pusdSpenders.map((spender, i) => ({
      spender,
      allowance: results[i] as bigint,
    })),
    operators: ctfOperators.map((operator, i) => ({
      operator,
      approved: results[pusdSpenders.length + i] as boolean,
    })),
  };
}

export function useReadiness(owner: Address | undefined, market: Market) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [READINESS_QUERY_KEY, owner, market.negRisk],
    enabled: !!owner,
    queryFn: () => fetchReadinessState(owner!, market),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!owner) throw new Error('Wallet is not connected.');

      // Recompute from fresh chain state so we never re-submit an approval
      // that landed in the meantime (idempotence across tabs/sessions).
      const state = await fetchReadinessState(owner, market);
      const plan = computeApprovalPlan(state);
      if (plan.length === 0) return;

      const walletClient = await switchChain(POLYGON_CHAIN_ID);

      // Submit every missing approval as one EIP-5792 batch — a single
      // wallet confirmation when supported. experimental_fallback degrades
      // to sequential eth_sendTransaction on wallets without EIP-5792.
      const { id } = await walletClient.sendCalls({
        account: owner,
        calls: plan.map(approvalToCall),
        experimental_fallback: true,
        experimental_fallbackDelay: 100,
      });
      await walletClient.waitForCallsStatus({
        id,
        timeout: 120_000,
        throwOnFailure: true,
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: [READINESS_QUERY_KEY] });
    },
  });

  const state = query.data;
  return {
    state,
    plan: state ? computeApprovalPlan(state) : undefined,
    ready: state ? isReady(state) : undefined,
    isLoading: query.isLoading,
    error: query.error ?? approveMutation.error,
    approve: approveMutation.mutate,
    approving: approveMutation.isPending,
  };
}
