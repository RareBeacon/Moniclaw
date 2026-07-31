import { z } from "zod";
import { getRuntime } from "@/lib/ai/runtime";
import { ok, fail, errorResponse, readJson } from "@/lib/ai/api";
import { requirePrincipal, resolveApiPrincipal } from "@/lib/api-auth";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { getAiSettings } from "@/lib/ai/settings";
import { db } from "@/lib/db";
import type { ChatMessage, StreamEvent, ToolCallRequest } from "@runtime/types";

/**
 * POST /api/ai/chat — normalized chat completions.
 * Body: { messages?, message?, conversationId?, model?, provider?, stream?,
 *         jsonMode?, temperature?, maxTokens?, title? }
 * When stream=true → text/event-stream of {type:...} events.
 * With conversationId → history is loaded & the exchange persisted.
 *
 * Auth: session cookie OR Bearer msk_ API key. Capability: ai.chat.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["system", "user", "assistant", "tool"]),
        content: z.string().max(32_000),
      })
    )
    .max(50)
    .optional(),
  message: z.string().max(32_000).optional(),
  conversationId: z.string().uuid().optional(),
  model: z.string().max(120).optional(),
  provider: z.string().max(40).optional(),
  stream: z.boolean().default(false),
  jsonMode: z.union([z.boolean(), z.record(z.string(), z.unknown())]).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(32_000).optional(),
  system: z.string().max(8_000).optional(),
  title: z.string().max(140).optional(),
});

export async function POST(request: Request) {
  try {
    const principal = await resolveApiPrincipal(request);
    const guard = requirePrincipal(principal, "ai.chat");
    if (guard) return guard;

    const gate = rateLimit(
      `aiChat:${principal!.userId ?? principal!.workspace.id}`,
      RATE_LIMITS.aiChat.limit,
      RATE_LIMITS.aiChat.windowMs
    );
    if (!gate.success) {
      return fail(429, "rate_limited", `Too many chat requests. Retry in ${gate.retryAfterSeconds}s.`, {
        retryAfterSeconds: gate.retryAfterSeconds,
      });
    }

    const parsed = bodySchema.parse(await readJson(request));
    const runtime = getRuntime();

    // ── Conversation history (when threaded) ──
    let history: ChatMessage[] = [];
    let conversationId = parsed.conversationId ?? null;
    if (conversationId) {
      const conversation = await db.aiConversation.findFirst({
        where: { id: conversationId, workspaceId: principal!.workspace.id },
      });
      if (!conversation) return fail(404, "not_found", "Conversation not found.");
      const rows = await db.aiMessage.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
        take: 40,
      });
      history = rows.map((r) => ({
        role: r.role.toLowerCase() as ChatMessage["role"],
        content: r.content,
      }));
    }

    // ── Assemble the message list ──
    const system = parsed.system;
    const base: ChatMessage[] = [
      ...(system ? [{ role: "system" as const, content: system }] : []),
      ...(parsed.messages?.length ? parsed.messages.map((m) => ({ role: m.role, content: m.content })) : history),
      ...(parsed.message ? [{ role: "user" as const, content: parsed.message }] : []),
    ];
    if (!base.length || base.every((m) => m.role === "system")) {
      return fail(400, "validation", "Provide `message`, `messages`, or a `conversationId` with history.");
    }

    const ctx = {
      workspaceId: principal!.workspace.id,
      userId: principal!.userId,
      requestId: crypto.randomUUID(),
    };

    // Persist the user message up-front (threaded mode).
    if (conversationId && parsed.message) {
      await db.aiMessage.create({
        data: {
          conversationId,
          workspaceId: principal!.workspace.id,
          role: "USER",
          content: parsed.message,
        },
      });
    }

    // ── Streaming branch (SSE) ──
    if (parsed.stream) {
      // Fail fast with a proper HTTP status (not a mid-stream error event)
      // when the workspace has no usable provider at all.
      await runtime.router.ensureConfigured(ctx, { provider: parsed.provider });
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          let assistantText = "";
          const toolCalls: ToolCallRequest[] = [];
          let usage: import("@runtime/types").UsageStats | null = null;
          let model = parsed.model ?? "unknown";
          let provider = "unknown";
          const send = (event: StreamEvent) => {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          };
          try {
            for await (const event of runtime.router.streamChat(ctx, {
              messages: base,
              model: parsed.model,
              provider: parsed.provider,
              jsonMode: parsed.jsonMode,
              temperature: parsed.temperature,
              maxTokens: parsed.maxTokens,
              signal: request.signal,
            })) {
              if (event.type === "text_delta") assistantText += event.text;
              if (event.type === "tool_call") toolCalls.push(event.toolCall);
              if (event.type === "usage") {
                usage = event.usage;
                model = event.model;
                provider = event.provider;
              }
              send(event);
            }
            await persistAssistant(
              conversationId,
              ctx.workspaceId,
              assistantText,
              toolCalls,
              model,
              provider,
              usage,
              parsed.message ? 2 : 1
            );
            controller.close();
          } catch (err) {
            send({
              type: "error",
              error: { kind: "runtime", message: (err as Error).message.slice(0, 300) },
            });
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ── Buffered branch ──
    const response = await runtime.router.chat(ctx, {
      messages: base,
      model: parsed.model,
      provider: parsed.provider,
      jsonMode: parsed.jsonMode,
      temperature: parsed.temperature,
      maxTokens: parsed.maxTokens,
      signal: request.signal,
    });

    await persistAssistant(
      conversationId,
      ctx.workspaceId,
      response.content,
      response.toolCalls,
      response.model,
      response.provider,
      response.usage,
      parsed.message ? 2 : 1
    );
    if (conversationId && parsed.title) {
      await db.aiConversation.updateMany({
        where: { id: conversationId, workspaceId: principal!.workspace.id, title: "New conversation" },
        data: { title: parsed.title },
      });
    }

    // Surface settings so clients know the effective defaults.
    const settings = await getAiSettings(principal!.workspace.id);
    return ok({
      conversationId,
      content: response.content,
      toolCalls: response.toolCalls,
      model: response.model,
      provider: response.provider,
      finishReason: response.finishReason,
      usage: response.usage,
      defaults: { model: settings.defaultModel, provider: settings.defaultProvider },
    });
  } catch (err) {
    return errorResponse(err);
  }
}

async function persistAssistant(
  conversationId: string | null,
  workspaceId: string,
  content: string,
  toolCalls: ToolCallRequest[],
  model: string,
  provider: string,
  usage: import("@runtime/types").UsageStats | null,
  incrementBy: number
) {
  if (!conversationId) return;
  try {
    await db.aiMessage.create({
      data: {
        conversationId,
        workspaceId,
        role: "ASSISTANT",
        content,
        toolCalls: toolCalls.length ? (toolCalls as unknown as object) : undefined,
        model,
        provider,
        promptTokens: usage?.promptTokens,
        completionTokens: usage?.completionTokens,
        latencyMs: usage?.latencyMs,
      },
    });
    await db.aiConversation
      .update({
        where: { id: conversationId },
        data: { messageCount: { increment: incrementBy } },
      })
      .catch(() => {});
  } catch (err) {
    console.warn("[api/ai/chat] failed to persist assistant message:", (err as Error).message);
  }
}
