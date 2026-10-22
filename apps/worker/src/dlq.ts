// The dead-letter queue writer (NFR-13/14 "terminal failures go to the DLQ
// with the reason recorded — observable, not lost").

import type { Queue } from "bullmq";
import { QUEUES, type QueueName } from "./config.js";

export interface DeadLetterEntry {
  /** The source queue the failed job came from. */
  queue: QueueName;
  /** The BullMQ job id (correlation). */
  jobId: string;
  /** The stable machine reason (e.g. duplicate_in_flight, terminal_failure). */
  reason: string;
  /** The original payload pointer (re-runnable once the condition clears). */
  payload: Record<string, unknown> | null;
  /** The error text (sanitized — no secrets, ERROR_HANDLING.md §7). */
  error?: string;
}

export async function enqueueDeadLetter(
  dlq: Queue,
  entry: DeadLetterEntry
): Promise<void> {
  await dlq.add(
    `${entry.queue}:${entry.jobId}:${entry.reason}`,
    { ...entry, enqueuedAt: new Date().toISOString() },
    { jobId: `dlq:${entry.queue}:${entry.jobId}:${entry.reason}` }
  );
}

export { QUEUES };
