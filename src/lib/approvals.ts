import { maxUint256, type Address } from 'viem';
import { PUSD } from './chains';

/**
 * Polymarket V2 trade-readiness requirements on Polygon.
 *
 * Two kinds of approvals gate trading:
 *  1. ERC-20 allowance: exchange contracts pull pUSD collateral via
 *     `transferFrom`, so each needs a pUSD allowance.
 *  2. ERC-1155 operator approval: exchange contracts move outcome tokens
 *     held in the ConditionalTokens contract, so each needs
 *     `setApprovalForAll`.
 *
 * Addresses are the V2 (post April 2026 pUSD upgrade) deployments from
 * https://docs.polymarket.com/resources/contracts. The set below is the
 * trading trio — enough for binary and neg-risk CLOB markets. The official
 * ts-sdk additionally approves the collateral adapters (split/merge/redeem
 * flows), the Protocol V2 Router, and Exchange V3 (forward-compat); add them
 * to these lists to match it 1:1 — everything downstream is config-driven.
 */

export interface SpenderRequirement {
  /** Display name, e.g. "CTF Exchange". */
  name: string;
  address: Address;
}

/** Gnosis ConditionalTokens contract holding outcome tokens (unchanged in V2). */
export const CONDITIONAL_TOKENS: Address =
  '0x4D97DCd97eC945f40cF65F87097ACe5EA0476045';

/** Contracts that must hold a pUSD allowance from the trader. */
export const PUSD_SPENDERS: SpenderRequirement[] = [
  { name: 'CTF Exchange V2', address: '0xE111180000d2663C0091e4f400237545B87B996B' },
  { name: 'Neg Risk CTF Exchange V2', address: '0xe2222d279d744050d28e00520010520000310F59' },
  { name: 'Neg Risk Adapter', address: '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296' },
];

/** Contracts that must be ERC-1155 operators on ConditionalTokens. */
export const CTF_OPERATORS: SpenderRequirement[] = PUSD_SPENDERS;

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
