import { getAddress, maxUint256 } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  approvalToCall,
  computeApprovalPlan,
  CONDITIONAL_TOKENS,
  CTF_EXCHANGE_V2,
  isReady,
  MIN_USABLE_ALLOWANCE,
  NEG_RISK_ADAPTER,
  NEG_RISK_CTF_EXCHANGE_V2,
  requiredApprovals,
  type ReadinessState,
} from './approvals';
import { PUSD } from './chains';

const BINARY = { negRisk: false };
const NEG_RISK = { negRisk: true };

function freshState(market: { negRisk: boolean }): ReadinessState {
  const { pusdSpenders, ctfOperators } = requiredApprovals(market);
  return {
    allowances: pusdSpenders.map((spender) => ({ spender, allowance: 0n })),
    operators: ctfOperators.map((operator) => ({ operator, approved: false })),
  };
}

describe('requiredApprovals', () => {
  it('binary markets need only the CTF Exchange (2 approvals total)', () => {
    const req = requiredApprovals(BINARY);
    expect(req.pusdSpenders).toEqual([CTF_EXCHANGE_V2]);
    expect(req.ctfOperators).toEqual([CTF_EXCHANGE_V2]);
    expect(computeApprovalPlan(freshState(BINARY))).toHaveLength(2);
  });

  it('neg-risk markets need the Neg Risk Exchange + Adapter (4 approvals)', () => {
    const req = requiredApprovals(NEG_RISK);
    expect(req.pusdSpenders).toEqual([NEG_RISK_CTF_EXCHANGE_V2, NEG_RISK_ADAPTER]);
    expect(computeApprovalPlan(freshState(NEG_RISK))).toHaveLength(4);
  });
});

describe('computeApprovalPlan', () => {
  it('plans nothing when everything is approved (idempotent)', () => {
    const ready: ReadinessState = {
      allowances: [{ spender: CTF_EXCHANGE_V2, allowance: maxUint256 }],
      operators: [{ operator: CTF_EXCHANGE_V2, approved: true }],
    };
    expect(computeApprovalPlan(ready)).toHaveLength(0);
    expect(isReady(ready)).toBe(true);
  });

  it('skips only the approvals that are already set', () => {
    const plan = computeApprovalPlan({
      allowances: [
        { spender: NEG_RISK_CTF_EXCHANGE_V2, allowance: maxUint256 },
        { spender: NEG_RISK_ADAPTER, allowance: 0n },
      ],
      operators: [
        { operator: NEG_RISK_CTF_EXCHANGE_V2, approved: true },
        { operator: NEG_RISK_ADAPTER, approved: false },
      ],
    });
    expect(plan).toHaveLength(2);
    expect(plan[0]).toMatchObject({ kind: 'erc20-approve', spender: NEG_RISK_ADAPTER });
    expect(plan[1]).toMatchObject({
      kind: 'ctf-set-approval-for-all',
      operator: NEG_RISK_ADAPTER,
    });
  });

  it('re-approves a dust allowance that would fail mid-trade', () => {
    const plan = computeApprovalPlan({
      allowances: [{ spender: CTF_EXCHANGE_V2, allowance: MIN_USABLE_ALLOWANCE - 1n }],
      operators: [{ operator: CTF_EXCHANGE_V2, approved: true }],
    });
    expect(plan).toHaveLength(1);
    expect(plan[0].kind).toBe('erc20-approve');
  });

  it('requests unlimited ERC-20 approvals', () => {
    for (const action of computeApprovalPlan(freshState(BINARY))) {
      if (action.kind === 'erc20-approve') {
        expect(action.amount).toBe(maxUint256);
      }
    }
  });
});

describe('approvalToCall', () => {
  it('encodes an ERC-20 approve to the pUSD token (selector 0x095ea7b3)', () => {
    const [erc20] = computeApprovalPlan(freshState(BINARY));
    const call = approvalToCall(erc20);
    expect(getAddress(call.to)).toBe(getAddress(PUSD));
    expect(call.data.startsWith('0x095ea7b3')).toBe(true);
    // spender address is right-padded in the first arg word
    expect(call.data.toLowerCase()).toContain(
      CTF_EXCHANGE_V2.address.slice(2).toLowerCase(),
    );
  });

  it('encodes setApprovalForAll to ConditionalTokens (selector 0xa22cb465)', () => {
    const operatorAction = computeApprovalPlan(freshState(BINARY)).find(
      (a) => a.kind === 'ctf-set-approval-for-all',
    )!;
    const call = approvalToCall(operatorAction);
    expect(getAddress(call.to)).toBe(getAddress(CONDITIONAL_TOKENS));
    expect(call.data.startsWith('0xa22cb465')).toBe(true);
  });
});
