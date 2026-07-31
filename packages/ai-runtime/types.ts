/**
 * Core normalized types for the AI runtime.
 *
 * These are the ONLY shapes business logic may depend on. Provider adapters
 * translate vendor payloads into these types; everything above the adapter
 * layer is vendor-agnostic.
 */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCallRequest {
  /** Provider-assigned call id (threaded back in ToolMessage). */
  id: string;
  name: string;
  /** JSON-serializable arguments produced by the model. */
  arguments: Record<string, unknown>;
}

export interface ToolCallResult {
  /** Matches ToolCallRequest.id. */
  id: string;
  name: string;
  /** Stringified result (JSON) fed back to the model. */
  content: string;
  isError?: boolean;
}

export interface ChatMessage {
  role: ChatRole;
  content: string;
  /** Present on assistant messages that request tools. */
  toolCalls?: ToolCallRequest[];
  /** Present on tool messages answering a call. */
  toolResults?: ToolCallResult[];
}

/** Portable tool descriptor handed to providers (JSON Schema flavored). */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema object describing the arguments. */
  parameters: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  /** Workspace default applies when undefined. */
  model?: string;
  /** Pin the request to one provider instead of routing. */
  provider?: string;
  tools?: ToolSpec[];
  /** Force a single named tool, or let the model decide. */
  toolChoice?: "auto" | "none" | { name: string };
  /** Ask for schema-validated JSON output (`true` = free-form JSON). */
  jsonMode?: boolean | Record<string, unknown>;
  temperature?: number;
  maxTokens?: number;
  stopSequences?: string[];
  /** Per-attempt timeout; router defaults apply when unset. */
  timeoutMs?: number;
  /** External cancellation token. */
  signal?: AbortSignal;
  /** Correlation id threaded into usage events. */
  requestId?: string;
}

export interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Milliseconds from attempt start to final chunk. */
  latencyMs: number;
  /** USD-millionths; 0 for providers without price metadata. */
  costMicros: number;
}

export interface ChatResponse {
  /** Assistant text (may be empty when only tool calls were returned). */
  content: string;
  toolCalls: ToolCallRequest[];
  model: string;
  provider: string;
  usage: UsageStats;
  /** Raw finish reason mapped: stop | length | tool_calls | content_filter */
  finishReason: "stop" | "length" | "tool_calls" | "content_filter" | "unknown";
  /** Which attempt delivered this response (1-based, after failover). */
  attempt: number;
}

/** Normalized streaming event — adapters yield these, never raw chunks. */
export type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolCall: ToolCallRequest }
  | { type: "usage"; usage: UsageStats; model: string; provider: string }
  | { type: "done"; finishReason: ChatResponse["finishReason"] }
  | { type: "error"; error: { kind: string; message: string } };

export interface EmbedRequest {
  texts: string[];
  model?: string;
  /** Task hint for providers that support it (gemini). */
  taskType?: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";
  signal?: AbortSignal;
}

export interface EmbedResponse {
  vectors: number[][];
  model: string;
  provider: string;
  dim: number;
  usage: UsageStats;
}

/** Health probe result stored on provider configs. */
export interface ProviderHealth {
  ok: boolean;
  latencyMs: number;
  error?: string;
}
