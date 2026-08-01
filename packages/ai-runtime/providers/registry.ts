import { ProviderError } from "../errors";
import { GeminiProvider, GeminiEmbeddings } from "./gemini";
import { OllamaProvider, OllamaEmbeddings } from "./ollama";
import { OpenAiCompatibleProvider } from "./openai-compatible";
import { AnthropicProvider } from "./anthropic";
import type {
  ChatProvider,
  EmbeddingProvider,
  ProviderCredentials,
} from "./provider";

/**
 * Provider registry — the single place that knows how to build adapters.
 *
 * Phase 11 (AI gateway, v1): an OPEN mesh. Every catalog entry ships a real
 * adapter; workspaces can attach any provider — or any OpenAI-compatible
 * gateway (`custom`) — by adding a key/endpoint under
 * Dashboard → Settings → API Keys. FREE-FIRST default order for platform
 * env fallbacks: Gemini → Groq → OpenRouter (free models) → Ollama, then
 * paid providers if their env keys exist.
 */

export const PROVIDER_IDS = [
  "gemini",
  "openrouter",
  "ollama",
  "openai",
  "anthropic",
  "deepseek",
  "mistral",
  "groq",
  "xai",
  "together",
  "custom",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Uppercase ids for DB-enum/zod mirroring — kept in literal sync with
 *  PROVIDER_IDS (the mesh test asserts the mapping so drift fails loudly). */
export const PROVIDER_IDS_UPPER = [
  "GEMINI",
  "OPENROUTER",
  "OLLAMA",
  "OPENAI",
  "ANTHROPIC",
  "DEEPSEEK",
  "MISTRAL",
  "GROQ",
  "XAI",
  "TOGETHER",
  "CUSTOM",
] as const;

export type ProviderIdUpper = (typeof PROVIDER_IDS_UPPER)[number];

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
  /** Exposes embeddings through this runtime (768-dim schema contract). */
  embeddings: boolean;
  /** `custom` endpoints must supply their own baseUrl and model id. */
  requiresBaseUrl?: boolean;
  requiresModel?: boolean;
  /** Human hint: where to obtain a key. */
  keyUrl?: string;
}

export const PROVIDER_CATALOG: readonly ProviderMeta[] = [
  {
    id: "gemini",
    label: "Google Gemini",
    requiresKey: true,
    defaultModel: "gemini-2.5-flash",
    freeTier: true,
    status: "shipped",
    embeddings: true,
    keyUrl: "aistudio.google.com",
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
    embeddings: false,
    keyUrl: "openrouter.ai/keys",
  },
  {
    id: "ollama",
    label: "Ollama (local/self-hosted)",
    requiresKey: false,
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.1",
    freeTier: true,
    status: "shipped",
    embeddings: true,
  },
  {
    id: "openai",
    label: "OpenAI",
    requiresKey: true,
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    freeTier: false,
    status: "shipped",
    embeddings: false, // 1536-dim default ≠ the schema's 768 contract
    keyUrl: "platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    requiresKey: true,
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-haiku-4-5",
    freeTier: false,
    status: "shipped",
    embeddings: false,
    keyUrl: "console.anthropic.com/settings/keys",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    requiresKey: true,
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    freeTier: false,
    status: "shipped",
    embeddings: false,
    keyUrl: "platform.deepseek.com/api_keys",
  },
  {
    id: "mistral",
    label: "Mistral",
    requiresKey: true,
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    freeTier: true, // La Plateforme free tier (rate-limited)
    status: "shipped",
    embeddings: false,
    keyUrl: "console.mistral.ai/api-keys",
  },
  {
    id: "groq",
    label: "Groq (free tier)",
    requiresKey: true,
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    freeTier: true,
    status: "shipped",
    embeddings: false,
    keyUrl: "console.groq.com/keys",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    requiresKey: true,
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-3-mini",
    freeTier: false,
    status: "shipped",
    embeddings: false,
    keyUrl: "console.x.ai",
  },
  {
    id: "together",
    label: "Together AI",
    requiresKey: true,
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    freeTier: false,
    status: "shipped",
    embeddings: false,
    keyUrl: "api.together.ai/settings/api-keys",
  },
  {
    id: "custom",
    label: "Custom endpoint (OpenAI-compatible)",
    requiresKey: false, // key optional — internal gateways may be keyless
    defaultModel: "",
    freeTier: false,
    status: "shipped",
    embeddings: false,
    requiresBaseUrl: true,
    requiresModel: true,
  },
] as const;

/** Platform env fallbacks, FREE-FIRST, then paid env keys behind them. */
export const FREE_FIRST_ORDER: readonly ProviderId[] = [
  "gemini",
  "groq",
  "openrouter",
  "ollama",
  "openai",
  "anthropic",
  "deepseek",
  "mistral",
  "xai",
  "together",
];

export function providerMeta(id: ProviderId): ProviderMeta {
  const meta = PROVIDER_CATALOG.find((p) => p.id === id);
  if (!meta) throw new Error(`Unknown provider: ${id}`);
  return meta;
}

/** Meta lookup for the uppercase DB-enum representation. */
export function providerMetaUpper(idUpper: string): ProviderMeta {
  return providerMeta(idUpper.toLowerCase() as ProviderId);
}

/** Env var powering each provider's platform-level fallback, if any. */
const ENV_KEY_VARS: Partial<Record<ProviderId, string>> = {
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  groq: "GROQ_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  mistral: "MISTRAL_API_KEY",
  xai: "XAI_API_KEY",
  together: "TOGETHER_API_KEY",
};

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
    case "anthropic": {
      if (!creds.apiKey)
        throw new ProviderError("auth", id, "Anthropic requires an API key (console.anthropic.com)");
      return new AnthropicProvider(
        creds.apiKey,
        defaults?.model ?? providerMeta(id).defaultModel,
        creds.baseUrl ?? providerMeta(id).defaultBaseUrl!
      );
    }
    case "custom": {
      const meta = providerMeta(id);
      if (!creds.baseUrl)
        throw new ProviderError("model", id, "Custom endpoints need a Base URL (OpenAI-compatible, e.g. https://host/v1)");
      if (!defaults?.model)
        throw new ProviderError("model", id, "Custom endpoints need a Default model id — the runtime cannot guess one");
      return new OpenAiCompatibleProvider(
        id,
        meta.label,
        creds.baseUrl.replace(/\/+$/, ""),
        creds.apiKey ?? "",
        defaults.model
      );
    }
    // OpenAI-shaped wire format shared by these vendors.
    case "openai":
    case "deepseek":
    case "mistral":
    case "groq":
    case "xai":
    case "together": {
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
    default: {
      const exhaustive: never = id;
      throw new Error(`Unhandled provider: ${exhaustive as string}`);
    }
  }
}

/** Build an embedding adapter. Gemini/Ollama keep the 768-dim contract. */
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
        `${providerMeta(id).label} does not expose 768-dim embeddings through this runtime — use Gemini or Ollama embeddings.`
      );
  }
}

/** Optional platform-level fallbacks (env-configured). BYOK takes precedence. */
export function envFallbackProviders(): Array<{
  id: ProviderId;
  creds: ProviderCredentials;
}> {
  const out: Array<{ id: ProviderId; creds: ProviderCredentials }> = [];
  for (const id of FREE_FIRST_ORDER) {
    if (id === "ollama") {
      if (process.env.OLLAMA_BASE_URL) out.push({ id, creds: { baseUrl: process.env.OLLAMA_BASE_URL } });
      continue;
    }
    const envVar = ENV_KEY_VARS[id];
    const key = envVar ? process.env[envVar] : undefined;
    if (key) out.push({ id, creds: { apiKey: key } });
  }
  return out;
}
