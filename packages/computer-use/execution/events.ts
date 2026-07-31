import { EventEmitter } from "node:events";
import type { ExecutionEventEmitter } from "../ports";

/**
 * In-process execution event fan-out.
 *
 * DB action-event rows remain the canonical, durable log — this emitter is
 * the low-latency hint channel for same-process SSE subscribers and the
 * seam where a pub/sub adapter (Redis/NATS) plugs in for multi-instance
 * deployments without touching call sites.
 */
export class InProcessExecutionEmitter implements ExecutionEventEmitter {
  private readonly bus = new EventEmitter();
  /** Small ring buffer so late subscribers can catch up. */
  private readonly recent = new Map<string, Array<{ type: string; seq?: number; data?: unknown }>>();
  private readonly maxBuffer = 200;

  constructor() {
    this.bus.setMaxListeners(500);
  }

  emit(executionId: string, event: { type: string; seq?: number; data?: unknown }): void {
    const buffer = this.recent.get(executionId) ?? [];
    buffer.push(event);
    if (buffer.length > this.maxBuffer) buffer.shift();
    this.recent.set(executionId, buffer);
    this.bus.emit(executionId, event);
  }

  subscribe(executionId: string, listener: (event: { type: string; seq?: number; data?: unknown }) => void): () => void {
    // Replay buffered events first (best-effort backfill).
    for (const event of this.recent.get(executionId) ?? []) listener(event);
    this.bus.on(executionId, listener);
    return () => {
      this.bus.off(executionId, listener);
    };
  }

  clear(executionId: string): void {
    this.recent.delete(executionId);
    this.bus.removeAllListeners(executionId);
  }
}
