import type { SiftLightInput } from "./service.js";
import type { OperationDetails, SiftLightDetails, SiftLightResult } from "./types.js";
import type { OperationSnapshot, OperationWaitResult } from "./operation-lifecycle.js";

export function operationRequest(operationId: string): SiftLightInput {
  return { mode: "await", operationId };
}

export function operationDetails<T>(
  operation: OperationSnapshot<T>,
  nextRequest?: SiftLightInput,
): OperationDetails {
  return {
    id: operation.id,
    mode: operation.metadata.mode,
    state: operation.state,
    startedAt: operation.startedAt,
    deadlineAt: operation.deadlineAt,
    leaseExpiresAt: operation.leaseExpiresAt,
    ...(operation.progress ? { progress: operation.progress } : {}),
    ...(nextRequest ? { nextRequest } : {}),
    ...(operation.error instanceof Error ? { error: operation.error.message } : {}),
  };
}

export function waitingResult(
  operation: OperationSnapshot<SiftLightResult>,
  mode: "concept" | "hybrid",
): SiftLightResult {
  const nextRequest = operationRequest(operation.id);
  const progress = operation.progress ? ` Progress: ${JSON.stringify(operation.progress)}.` : "";
  const details: SiftLightDetails = {
    version: 1,
    mode,
    status: "waiting",
    totalMatches: 0,
    storedMatches: 0,
    totalFiles: 0,
    returnedMatches: 0,
    snapshotComplete: false,
    nextRequest,
    ...(operation.metadata.redact ? { redactionRequested: true } : {}),
    operation: operationDetails(operation, nextRequest),
  };
  return {
    text: `Operation ${operation.id} is still running; no evidence page is available yet.${progress}\n\nNext request: ${JSON.stringify(nextRequest)}. Copy it exactly to continue waiting; the original query will not be started again.`,
    details,
  };
}

export function operationStateResult(
  operation: OperationSnapshot<SiftLightResult>,
  mode: "concept" | "hybrid",
): SiftLightResult {
  if (operation.state === "complete" && operation.result !== undefined)
    return completeOperationResult(operation.result, operation);
  const details: SiftLightDetails = {
    version: 1,
    mode,
    status: operation.state,
    totalMatches: 0,
    storedMatches: 0,
    totalFiles: 0,
    returnedMatches: 0,
    snapshotComplete: false,
    ...(operation.metadata.redact ? { redactionRequested: true } : {}),
    operation: operationDetails(operation),
  };
  const message = operation.error instanceof Error ? ` ${operation.error.message}.` : "";
  return {
    text: `Operation ${operation.id} ${operation.state}.${message}`,
    details,
  };
}

export function completeOperationResult(
  result: SiftLightResult,
  operation: OperationSnapshot<SiftLightResult>,
): SiftLightResult {
  const stable = structuredClone(result);
  return {
    ...stable,
    text: `${stable.text}\n\nOperation ${operation.id} complete; final result is retained for stable await re-fetch.`,
    details: {
      ...stable.details,
      ...(operation.metadata.redact ? { redactionRequested: true } : {}),
      operation: operationDetails(operation),
    },
  };
}

export function operationOutcome(
  outcome: OperationWaitResult<SiftLightResult>,
  mode: "concept" | "hybrid",
): SiftLightResult {
  if (outcome.state === "running") return waitingResult(outcome.operation, mode);
  if (outcome.state === "complete")
    return completeOperationResult(outcome.result, outcome.operation);
  throw outcome.error;
}
