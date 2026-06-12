import type { ExecutionAction, RouteExtended } from '@lifi/sdk';

/**
 * UI-facing bridge lifecycle. A route is only `done` once the destination
 * side has settled (RECEIVING_CHAIN action DONE) — a confirmed source
 * transaction is reported as `awaitingDestination`, never `done`.
 */
export type BridgePhase =
  | 'idle'
  | 'quoting'
  | 'signing'
  | 'sourceSubmitted'
  | 'awaitingDestination'
  | 'done'
  | 'failed';

export interface BridgeProgress {
  phase: BridgePhase;
  /** Hash of the transaction submitted on the source chain, once known. */
  sourceTxHash?: string;
  sourceTxLink?: string;
  /** Hash of the settlement transaction on the destination chain, once known. */
  destinationTxHash?: string;
  destinationTxLink?: string;
  /** Human-readable detail (Li.Fi substatus message or error). */
  message?: string;
}

const SOURCE_ACTION_TYPES = new Set(['SWAP', 'CROSS_CHAIN']);
const WALLET_INTERACTION_STATUSES = new Set([
  'ACTION_REQUIRED',
  'MESSAGE_REQUIRED',
  'RESET_REQUIRED',
]);

function allActions(route: RouteExtended): ExecutionAction[] {
  return route.steps.flatMap((step) => step.execution?.actions ?? []);
}

/**
 * Derive the UI phase from a Li.Fi route execution snapshot.
 *
 * Pure function over the route object so the mapping is unit-testable
 * independently of the SDK's execution engine.
 */
export function deriveBridgeProgress(route: RouteExtended): BridgeProgress {
  const actions = allActions(route);

  const failed =
    route.steps.some((s) => s.execution?.status === 'FAILED') ||
    actions.some((a) => a.status === 'FAILED' || a.status === 'CANCELLED');

  const sourceAction = actions.find(
    (a) => SOURCE_ACTION_TYPES.has(a.type) && a.txHash,
  );
  const receivingAction = actions.find((a) => a.type === 'RECEIVING_CHAIN');

  const base: Omit<BridgeProgress, 'phase'> = {
    sourceTxHash: sourceAction?.txHash,
    sourceTxLink: sourceAction?.txLink,
    destinationTxHash:
      receivingAction?.status === 'DONE' ? receivingAction.txHash : undefined,
    destinationTxLink:
      receivingAction?.status === 'DONE' ? receivingAction.txLink : undefined,
  };

  if (failed) {
    const failedAction = actions.find((a) => a.status === 'FAILED');
    const error =
      failedAction?.error ??
      route.steps.find((s) => s.execution?.error)?.execution?.error;
    return { ...base, phase: 'failed', message: error?.message };
  }

  // Destination settlement is the ONLY thing that marks the bridge done:
  // every step finished AND the receiving-chain action itself reports DONE.
  const allStepsDone =
    route.steps.length > 0 &&
    route.steps.every((s) => s.execution?.status === 'DONE');
  if (allStepsDone && receivingAction?.status === 'DONE') {
    return { ...base, phase: 'done', message: receivingAction.substatusMessage };
  }

  // Source tx exists → we are past signing. Distinguish "source still
  // confirming" from "confirmed, waiting for the destination side".
  if (sourceAction) {
    const sourceConfirmed = sourceAction.status === 'DONE';
    return {
      ...base,
      phase: sourceConfirmed ? 'awaitingDestination' : 'sourceSubmitted',
      message:
        receivingAction?.substatusMessage ?? sourceAction.substatusMessage,
    };
  }

  // No source tx yet: wallet prompts (allowance, permit, send) or pre-flight.
  const interactive = actions.find((a) =>
    WALLET_INTERACTION_STATUSES.has(a.status),
  );
  return { ...base, phase: 'signing', message: interactive?.message };
}
