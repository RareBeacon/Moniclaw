import type {
  ChatRequest,
  ChatResponse,
  EmbedRequest,
  EmbedResponse,
  ProviderHealth,
  StreamEvent,
} from "../types";

/**
 * The contract every vendor adapter implements. Anything beyond this
 * interface belongs behind provider-specific code and never leaks upward.
 */
export interface ChatProvider {
  readonly id: string; // "gemini" | "openrouter" | "ollama" | ...
  readonly label: string;
  readonly defaultModel: string;
  readonly supportsTools: boolean;
  readonly supportsJsonMode: boolean;
  readonly supportsStreaming: boolean;

  /** Buffered completion. */
  chat(request: ChatRequest): Promise<ChatResponse>;

  /**
   * Streaming completion. The returned iterable yields normalized events;
   * the FIRST emitted "usage" event finalizes token counts (before "done").
   * Cancellation: pass request.signal — adapters must stop promptly.
   */
  streamChat(request: ChatRequest): AsyncIterable<StreamEvent>;

  /** Cheap liveness probe (models list / tiny generation). */
  healthCheck(): Promise<ProviderHealth>;
}

export interface EmbeddingProvider {
  readonly id: string;
  readonly defaultModel: string;
  /** Vector dimension of defaultModel — the schema's vector(768) contract. */
  readonly dim: number;

  embed(request: EmbedRequest): Promise<EmbedResponse>;
}

export interface ProviderCredentials {
  apiKey?: string;
  baseUrl?: string;
}

/** Factory signature used by the registry to build configured adapters. */
export type ChatProviderFactory = (
  creds: ProviderCredentials,
  defaults?: { model?: string }
) => ChatProvider;

export type EmbeddingProviderFactory = (
  creds: ProviderCredentials,
  defaults?: { model?: string }
) => EmbeddingProvider;
