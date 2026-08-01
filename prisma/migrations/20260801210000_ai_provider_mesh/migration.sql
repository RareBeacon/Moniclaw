-- Phase 11 (AI gateway, v1) — provider mesh opens up: every catalog provider
-- becomes attachable per workspace. Additive enum extension only; no data
-- changes, no rewrites. enum mirrors packages/ai-runtime PROVIDER_IDS.
ALTER TYPE "AiProviderId" ADD VALUE 'GROQ';
ALTER TYPE "AiProviderId" ADD VALUE 'XAI';
ALTER TYPE "AiProviderId" ADD VALUE 'TOGETHER';
ALTER TYPE "AiProviderId" ADD VALUE 'CUSTOM';
