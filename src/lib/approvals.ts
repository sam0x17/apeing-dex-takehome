import { encodeFunctionData, maxUint256, type Address, type Hex } from 'viem';
import { PUSD } from './chains';
import { CONDITIONAL_TOKENS_ABI, ERC20_ABI } from './erc20';
import { POLYMARKET_V2_ADDRESSES } from './polymarket';

/**
 * Polymarket V2 trade-readiness requirements on Polygon.
 *
 * Two kinds of approvals gate trading:
 *  1. ERC-20 allowance: the exchange pulls pUSD collateral via `transferFrom`,
 *     so it needs a pUSD allowance.
 *  2. ERC-1155 operator approval: the exchange moves outcome tokens held in
 *     the ConditionalTokens contract, so it needs `setApprovalForAll`.
 *
 * Crucially, *which* contracts are required depends on the market: a binary
 * (non neg-risk) market trades on the CTF Exchange alone, while a neg-risk
 * market trades on the Neg Risk Exchange + Adapter. We therefore only ask the
 * user to approve what the selected market actually needs — a fresh wallet
 * on the fixed binary market needs 2 approvals, not the full 6. Addresses are
 * the V2 (post April 2026 pUSD upgrade) deployments and live in this file as
 * config.
 */

export interface SpenderRequirement {
  /** Display name, e.g. "CTF Exchange V2". */
  name: string;
  address: Address;
}

/** Gnosis ConditionalTokens contract holding outcome tokens (unchanged in V2). */
export const CONDITIONAL_TOKENS: Address =
  POLYMARKET_V2_ADDRESSES.conditionalTokens;

export const CTF_EXCHANGE_V2: SpenderRequirement = {
  name: 'CTF Exchange V2',
  address: POLYMARKET_V2_ADDRESSES.ctfExchange,
};
export const NEG_RISK_CTF_EXCHANGE_V2: SpenderRequirement = {
  name: 'Neg Risk CTF Exchange V2',
  address: POLYMARKET_V2_ADDRESSES.negRiskExchange,
};
export const NEG_RISK_ADAPTER: SpenderRequirement = {
  name: 'Neg Risk Adapter',
  address: POLYMARKET_V2_ADDRESSES.negRiskAdapter,
};

export interface ApprovalRequirements {
  /** Contracts that must hold a pUSD allowance from the trader. */
  pusdSpenders: SpenderRequirement[];
  /** Contracts that must be ERC-1155 operators on ConditionalTokens. */
  ctfOperators: SpenderRequirement[];
}

/**
 * The exact approval set a market needs. Binary markets settle on the CTF
 * Exchange; neg-risk markets settle on the Neg Risk Exchange and use the
 * Neg Risk Adapter for conversions. Both pUSD allowance and CTF operator
 * approval target the same venue(s).
 */
export function requiredApprovals(market: {
  negRisk: boolean;
}): ApprovalRequirements {
  const venues = market.negRisk
    ? [NEG_RISK_CTF_EXCHANGE_V2, NEG_RISK_ADAPTER]
    : [CTF_EXCHANGE_V2];
  return { pusdSpenders: venues, ctfOperators: venues };
}

/**
 * Allowance below this is treated as "needs approval". We approve unlimited
 * (maxUint256) like the official Polymarket UI, so any healthy allowance is
 * far above this line; a finite-but-low allowance would silently fail later
 * mid-trade, so we re-approve it too.
 */
export const MIN_USABLE_ALLOWANCE = 10n ** 12n; // 1,000,000 pUSD (6 decimals)

export interface AllowanceState {
  spender: SpenderRequirement;
  allowance: bigint;
}

export interface OperatorState {
  operator: SpenderRequirement;
  approved: boolean;
}

export interface ReadinessState {
  allowances: AllowanceState[];
  operators: OperatorState[];
}

export type ApprovalAction =
  | {
      kind: 'erc20-approve';
      token: Address;
      spender: SpenderRequirement;
      amount: bigint;
    }
  | {
      kind: 'ctf-set-approval-for-all';
      conditionalTokens: Address;
      operator: SpenderRequirement;
    };

/**
 * Compute the exact set of transactions needed to become trade-ready.
 *
 * Idempotent by construction: approvals that are already in place produce
 * no action, so re-running the flow never re-prompts the user (and wastes
 * no gas) for an approval that is already set.
 */
export function computeApprovalPlan(state: ReadinessState): ApprovalAction[] {
  const actions: ApprovalAction[] = [];

  for (const { spender, allowance } of state.allowances) {
    if (allowance < MIN_USABLE_ALLOWANCE) {
      actions.push({
        kind: 'erc20-approve',
        token: PUSD,
        spender,
        amount: maxUint256,
      });
    }
  }

  for (const { operator, approved } of state.operators) {
    if (!approved) {
      actions.push({
        kind: 'ctf-set-approval-for-all',
        conditionalTokens: CONDITIONAL_TOKENS,
        operator,
      });
    }
  }

  return actions;
}

export function isReady(state: ReadinessState): boolean {
  return computeApprovalPlan(state).length === 0;
}

/**
 * Encode an approval action as a raw `{ to, data }` call. Used to bundle the
 * whole plan into a single EIP-5792 `wallet_sendCalls` (one wallet prompt)
 * with a sequential fallback. Pure, so the encoding is unit-tested.
 */
export function approvalToCall(action: ApprovalAction): { to: Address; data: Hex } {
  if (action.kind === 'erc20-approve') {
    return {
      to: action.token,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [action.spender.address, action.amount],
      }),
    };
  }
  return {
    to: action.conditionalTokens,
    data: encodeFunctionData({
      abi: CONDITIONAL_TOKENS_ABI,
      functionName: 'setApprovalForAll',
      args: [action.operator.address, true],
    }),
  };
}
