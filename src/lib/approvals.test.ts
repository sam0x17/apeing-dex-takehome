import { maxUint256 } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  computeApprovalPlan,
  CTF_OPERATORS,
  isReady,
  MIN_USABLE_ALLOWANCE,
  PUSD_SPENDERS,
  type ReadinessState,
} from './approvals';

function state(overrides?: {
  allowances?: bigint[];
  operators?: boolean[];
}): ReadinessState {
  return {
    allowances: PUSD_SPENDERS.map((spender, i) => ({
      spender,
      allowance: overrides?.allowances?.[i] ?? 0n,
    })),
    operators: CTF_OPERATORS.map((operator, i) => ({
      operator,
      approved: overrides?.operators?.[i] ?? false,
    })),
  };
}

const ALL_SET = {
  allowances: PUSD_SPENDERS.map(() => maxUint256),
  operators: CTF_OPERATORS.map(() => true),
};

describe('computeApprovalPlan', () => {
  it('plans every approval for a fresh wallet', () => {
    const plan = computeApprovalPlan(state());
    expect(plan).toHaveLength(PUSD_SPENDERS.length + CTF_OPERATORS.length);
  });

  it('plans nothing when everything is approved (idempotent)', () => {
    expect(computeApprovalPlan(state(ALL_SET))).toHaveLength(0);
    expect(isReady(state(ALL_SET))).toBe(true);
  });

  it('skips only the approvals that are already set', () => {
    const plan = computeApprovalPlan(
      state({
        allowances: [maxUint256, 0n, maxUint256],
        operators: [true, true, false],
      }),
    );
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({
      kind: 'erc20-approve',
      spender: PUSD_SPENDERS[1],
    });
    expect(plan[1]).toMatchObject({
      kind: 'ctf-set-approval-for-all',
      operator: CTF_OPERATORS[2],
    });
  });

  it('re-approves a dust allowance that would fail mid-trade', () => {
    const dust = MIN_USABLE_ALLOWANCE - 1n;
    const plan = computeApprovalPlan(
      state({
        allowances: [dust, maxUint256, maxUint256],
        operators: [true, true, true],
      }),
    );
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe('erc20-approve');
  });

  it('accepts a healthy finite allowance', () => {
    const plan = computeApprovalPlan(
      state({
        allowances: [MIN_USABLE_ALLOWANCE, maxUint256, maxUint256],
        operators: [true, true, true],
      }),
    );
    expect(plan).toHaveLength(0);
  });

  it('requests unlimited ERC-20 approvals', () => {
    const plan = computeApprovalPlan(state());
    for (const action of plan) {
      if (action.kind === 'erc20-approve') {
        expect(action.amount).toBe(maxUint256);
      }
    }
  });

  it('is a pure function: same input, same plan', () => {
    const s = state({ allowances: [0n, maxUint256, 0n] });
    expect(computeApprovalPlan(s)).toEqual(computeApprovalPlan(s));
  });
});
