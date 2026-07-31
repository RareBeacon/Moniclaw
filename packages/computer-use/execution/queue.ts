import type { ExecutionQueuePort } from "../ports";

/**
 * In-process execution queue — bounded-concurrency FIFO with per-key
 * serialization guarantees handled upstream (sessions are the isolation
 * unit; two executions CAN share a session sequentially, though the manager
 * rejects a second concurrent run on the same session).
 *
 * Shape mirrors what a BullMQ/SQS adapter needs (enqueue by id, runner does
 * the rest) so the swap is a constructor change in the DI container.
 */
export class InProcessExecutionQueue implements ExecutionQueuePort {
  private readonly pending: string[] = [];
  private readonly queued = new Set<string>();
  private running = 0;
  /** executionIds currently running (diagnostics + tests). */
  private readonly active = new Set<string>();

  constructor(
    private readonly runner: (executionId: string) => Promise<void>,
    private readonly concurrency = 2
  ) {}

  async enqueue(executionId: string): Promise<void> {
    if (this.queued.has(executionId) || this.active.has(executionId)) return; // idempotent
    this.queued.add(executionId);
    this.pending.push(executionId);
    this.pump();
  }

  private pump(): void {
    while (this.running < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      this.queued.delete(id);
      this.active.add(id);
      this.running += 1;
      void this.runner(id)
        .catch(() => { /* runner persists its own failure state */ })
        .finally(() => {
          this.active.delete(id);
          this.running -= 1;
          this.pump();
        });
    }
  }

  stats(): { queued: number; running: number; concurrency: number } {
    return { queued: this.pending.length, running: this.running, concurrency: this.concurrency };
  }

  /** Test hook: wait until the queue drains (bounded). */
  async drain(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while ((this.pending.length > 0 || this.running > 0) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  isActive(executionId: string): boolean {
    return this.active.has(executionId);
  }
}
