import { ProviderError } from "../errors";
import { GeminiProvider, GeminiEmbeddings } from "./gemini";
import { OllamaProvider, OllamaEmbeddings } from "./ollama";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import type {
  ChatProvider,
  EmbeddingProvider,
  ProviderCredentials,
} from "./provider";

/**
 * Provider registry — the single place that knows how to build adapters.
 *
 * FREE-FIRST default order: Gemini → OpenRouter (free models) → Ollama.
 * OpenAI / Anthropic-shapes / DeepSeek / Mistral share wire formats covered
 * by the OpenAI-compatible base; they are registry-ready and light up when
 * a workspace adds credentials — no business-logic changes required.
 */

export type ProviderId =
  | "gemini"
  | "openrouter"
  | "ollama"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "mistral";

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  requiresKey: boolean;
  defaultBaseUrl?: string;
  defaultModel: string;
  /** Free tier available without any payment method. */
  freeTier: boolean;
  /** Shipping adapter today vs. registry-ready future provider. */
  status: "shipped" | "reserved";
}

export const PROVIDER_CATALOG: readonly ProviderMeta[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    requiresKey: true,
    defaultModel: "gemini-2.5-flash",
    freeTier: true,
    status: "shipped",
  },
  {
    id: "openrouter",
    label: "OpenRouter (free models)",
    requiresKey: true,
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    // Supplier changes over time on the free tier — verified working with
    // JSON-mode planning + tool calling + 262k ctx (2026-08). Workspaces can
    // pin any model id via their provider config's defaultModel.
    defaultModel: "google/gemma-4-26b-a4b-it:free",
    freeTier: true,
    status: "shipped",
  },
  {
    id: "ollama",
    label: "Ollama (local/self-hosted)",
    requiresKey: false,
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.1",
    freeTier: true,
    status: "shipped",
  },
  {
    id: "openai",
    label: "OpenAI",
    requiresKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    freeTier: false,
    status: "reserved",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    requiresKey: true,
    defaultBaseUrl: "https://api.anthropic.com/v1",
    defaultModel: "claude-haiku-4-5",
    freeTier: false,
    status: "reserved",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    requiresKey: true,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    freeTier: false,
    status: "reserved",
  },
  {
    id: "mistral",
    label: "Mistral",
    requiresKey: true,
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    freeTier: false,
    status: "reserved",
  },
] as const;

export const FREE_FIRST_ORDER: readonly ProviderId[] = [
  "gemini",
  "openrouter",
  "ollama",
];

export function providerMeta(id: ProviderId): ProviderMeta {
  const meta = PROVIDER_CATALOG.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown provider: ${id}`);
  return meta;
}

/** Build a chat adapter for a provider id from user-supplied credentials. */
export function createChatProvider(
  id: ProviderId,
  creds: ProviderCredentials,
  defaults?: { model?: string }
): ChatProvider {
  switch (id) {
    case "gemini": {
      if (!creds.apiKey)
        throw new ProviderError("auth", id, "Gemini requires an API key (free at aistudio.google.com)");
      return new GeminiProvider(creds.apiKey, defaults?.model, creds.baseUrl);
    }
    case "ollama":
      return new OllamaProvider(
        creds.baseUrl ?? process.env.OLLAMA_BASE_URL,
        defaults?.model ?? providerMeta(id).defaultModel
      );
    case "openrouter": {
      if (!creds.apiKey)
        throw new ProviderError("auth", id, "OpenRouter requires an API key (free tier available)");
      return new OpenAiCompatibleProvider(
        "openrouter",
        providerMeta(id).label,
        creds.baseUrl ?? providerMeta(id).defaultBaseUrl!,
        creds.apiKey,
        defaults?.model ?? providerMeta(id).defaultModel,
        {
          "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL ?? "https://moniclaw.vercel.app",
          "X-Title": "MoniClaw",
        }
      );
    }
    // Registry-ready: same wire format as OpenAI; activation is config-only.
    case "openai":
    case "deepseek":
    case "mistral": {
      if (!creds.apiKey)
        throw new ProviderError("auth", id, `${providerMeta(id).label} requires an API key`);
      const meta = providerMeta(id);
      return new OpenAiCompatibleProvider(
        id,
        meta.label,
        creds.baseUrl ?? meta.defaultBaseUrl!,
        creds.apiKey,
        defaults?.model ?? meta.defaultModel
      );
    }
    case "anthropic":
      throw new ProviderError(
        "model",
        id,
        "Anthropic's adapter ships with the Phase 4 runtime hardening; configure Gemini/OpenRouter/Ollama meanwhile."
      );
    default: {
      const exhaustive: never = id;
      throw new Error(`Unhandled provider: ${exhaustive as string}`);
    }
  }
}

/** Build an embedding adapter. Gemini is the canonical 768-dim backbone. */
export function createEmbeddingProvider(
  id: ProviderId,
  creds: ProviderCredentials,
  defaults?: { model?: string }
): EmbeddingProvider {
  switch (id) {
    case "gemini": {
      if (!creds.apiKey)
        throw new ProviderError("auth", id, "Gemini embeddings require an API key");
      return new GeminiEmbeddings(creds.apiKey, defaults?.model, creds.baseUrl);
    }
    case "ollama":
      return new OllamaEmbeddings(
        creds.baseUrl ?? process.env.OLLAMA_BASE_URL,
        defaults?.model
      );
    default:
      throw new ProviderError(
        "model",
        id,
        `${providerMeta(id).label} does not expose embeddings through this runtime yet — use Gemini or Ollama embeddings.`
      );
  }
}

/** Optional platform-level fallbacks (env-configured). BYOK takes precedence. */
export function envFallbackProviders(): Array<{
  id: ProviderId;
  creds: ProviderCredentials;
}> {
  const out: Array<{ id: ProviderId; creds: ProviderCredentials }> = [];
  if (process.env.GEMINI_API_KEY) {
    out.push({ id: "gemini", creds: { apiKey: process.env.GEMINI_API_KEY } });
  }
  if (process.env.OPENROUTER_API_KEY) {
    out.push({ id: "openrouter", creds: { apiKey: process.env.OPENROUTER_API_KEY } });
  }
  if (process.env.OLLAMA_BASE_URL) {
    out.push({ id: "ollama", creds: { baseUrl: process.env.OLLAMA_BASE_URL } });
  }
  return out;
}
