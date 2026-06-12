'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import {
  computeApprovalPlan,
  CONDITIONAL_TOKENS,
  CTF_OPERATORS,
  isReady,
  PUSD_SPENDERS,
  type ApprovalAction,
  type ReadinessState,
} from '@/lib/approvals';
import { POLYGON_CHAIN_ID, PUSD } from '@/lib/chains';
import { CONDITIONAL_TOKENS_ABI, ERC20_ABI } from '@/lib/erc20';
import { getPolygonPublicClient, switchChain } from '@/lib/wallet';

const READINESS_QUERY_KEY = 'trade-readiness';

/** One multicall round-trip for all allowances + operator approvals. */
async function fetchReadinessState(owner: Address): Promise<ReadinessState> {
  const client = getPolygonPublicClient();

  const results = await client.multicall({
    allowFailure: false,
    contracts: [
      ...PUSD_SPENDERS.map((spender) => ({
        address: PUSD,
        abi: ERC20_ABI,
        functionName: 'allowance' as const,
        args: [owner, spender.address] as const,
      })),
      ...CTF_OPERATORS.map((operator) => ({
        address: CONDITIONAL_TOKENS,
        abi: CONDITIONAL_TOKENS_ABI,
        functionName: 'isApprovedForAll' as const,
        args: [owner, operator.address] as const,
      })),
    ],
  });

  return {
    allowances: PUSD_SPENDERS.map((spender, i) => ({
      spender,
      allowance: results[i] as bigint,
    })),
    operators: CTF_OPERATORS.map((operator, i) => ({
      operator,
      approved: results[PUSD_SPENDERS.length + i] as boolean,
    })),
  };
}

export function useReadiness(owner?: Address) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [READINESS_QUERY_KEY, owner],
    enabled: !!owner,
    queryFn: () => fetchReadinessState(owner!),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!owner) throw new Error('Wallet is not connected.');

      // Recompute from fresh chain state so we never re-submit an approval
      // that landed in the meantime (idempotence across tabs/sessions).
      const state = await fetchReadinessState(owner);
      const plan = computeApprovalPlan(state);
      if (plan.length === 0) return;

      const walletClient = await switchChain(POLYGON_CHAIN_ID);
      const publicClient = getPolygonPublicClient();

      // Sequential on purpose: one wallet prompt at a time, and a receipt
      // wait between txs avoids nonce races in MetaMask.
      for (const action of plan) {
        const hash = await submitApproval(walletClient, owner, action);
        await publicClient.waitForTransactionReceipt({ hash });
      }
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

type PolygonWalletClient = Awaited<ReturnType<typeof switchChain>>;

function submitApproval(
  walletClient: PolygonWalletClient,
  owner: Address,
  action: ApprovalAction,
): Promise<`0x${string}`> {
  if (action.kind === 'erc20-approve') {
    return walletClient.writeContract({
      chain: null,
      account: owner,
      address: action.token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [action.spender.address, action.amount],
    });
  }
  return walletClient.writeContract({
    chain: null,
    account: owner,
    address: action.conditionalTokens,
    abi: CONDITIONAL_TOKENS_ABI,
    functionName: 'setApprovalForAll',
    args: [action.operator.address, true],
  });
}
