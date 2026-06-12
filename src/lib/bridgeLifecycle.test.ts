import type { ExecutionAction, RouteExtended } from '@lifi/sdk';
import { describe, expect, it } from 'vitest';
import { deriveBridgeProgress } from './bridgeLifecycle';

type StepStatus = NonNullable<
  RouteExtended['steps'][number]['execution']
>['status'];

function route(
  steps: { status: StepStatus; actions: Partial<ExecutionAction>[] }[],
): RouteExtended {
  return {
    steps: steps.map((s, i) => ({
      id: `step-${i}`,
      execution: {
        startedAt: 0,
        status: s.status,
        actions: s.actions as ExecutionAction[],
      },
    })),
  } as unknown as RouteExtended;
}

describe('deriveBridgeProgress', () => {
  it('reports signing before any transaction exists', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'ACTION_REQUIRED',
          actions: [{ type: 'CROSS_CHAIN', status: 'ACTION_REQUIRED' }],
        },
      ]),
    );
    expect(progress.phase).toBe('signing');
  });

  it('reports sourceSubmitted once the source tx has a hash but is unconfirmed', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'PENDING',
          actions: [
            { type: 'CROSS_CHAIN', status: 'PENDING', txHash: '0xabc', txLink: 'x' },
          ],
        },
      ]),
    );
    expect(progress.phase).toBe('sourceSubmitted');
    expect(progress.sourceTxHash).toBe('0xabc');
  });

  it('reports awaitingDestination after source confirms — NOT done', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'PENDING',
          actions: [
            { type: 'CROSS_CHAIN', status: 'DONE', txHash: '0xabc' },
            { type: 'RECEIVING_CHAIN', status: 'PENDING' },
          ],
        },
      ]),
    );
    expect(progress.phase).toBe('awaitingDestination');
  });

  it('never reports done while the receiving-chain action is pending, even if steps claim DONE', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'DONE',
          actions: [
            { type: 'CROSS_CHAIN', status: 'DONE', txHash: '0xabc' },
            { type: 'RECEIVING_CHAIN', status: 'PENDING' },
          ],
        },
      ]),
    );
    expect(progress.phase).not.toBe('done');
  });

  it('reports done only when destination settlement is confirmed', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'DONE',
          actions: [
            { type: 'CROSS_CHAIN', status: 'DONE', txHash: '0xabc' },
            { type: 'RECEIVING_CHAIN', status: 'DONE', txHash: '0xdef', txLink: 'y' },
          ],
        },
      ]),
    );
    expect(progress.phase).toBe('done');
    expect(progress.destinationTxHash).toBe('0xdef');
  });

  it('requires ALL steps done (multi-step routes stay pending)', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'DONE',
          actions: [
            { type: 'CROSS_CHAIN', status: 'DONE', txHash: '0xabc' },
            { type: 'RECEIVING_CHAIN', status: 'DONE', txHash: '0xdef' },
          ],
        },
        { status: 'PENDING', actions: [{ type: 'SWAP', status: 'PENDING' }] },
      ]),
    );
    expect(progress.phase).not.toBe('done');
  });

  it('reports failed with the action error message', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'FAILED',
          actions: [
            {
              type: 'CROSS_CHAIN',
              status: 'FAILED',
              error: { code: 1, message: 'Slippage exceeded' },
            },
          ],
        },
      ]),
    );
    expect(progress.phase).toBe('failed');
    expect(progress.message).toBe('Slippage exceeded');
  });

  it('treats a cancelled wallet prompt as failed', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'FAILED',
          actions: [{ type: 'CROSS_CHAIN', status: 'CANCELLED' }],
        },
      ]),
    );
    expect(progress.phase).toBe('failed');
  });

  it('ignores allowance actions when deriving the source tx', () => {
    const progress = deriveBridgeProgress(
      route([
        {
          status: 'PENDING',
          actions: [
            { type: 'SET_ALLOWANCE', status: 'DONE', txHash: '0xallow' },
            { type: 'CROSS_CHAIN', status: 'ACTION_REQUIRED' },
          ],
        },
      ]),
    );
    expect(progress.phase).toBe('signing');
    expect(progress.sourceTxHash).toBeUndefined();
  });
});
