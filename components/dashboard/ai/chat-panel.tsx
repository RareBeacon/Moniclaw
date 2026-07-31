"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bot,
  CornerDownLeft,
  Loader2,
  Plus,
  Square,
  Trash2,
  User as UserIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Playground chat panel — consumes /api/ai/chat with stream:true (SSE) and
 * renders deltas live. Conversations persist server-side; selecting a thread
 * reloads the page with ?c=<id> (server component re-reads history).
 */

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  model?: string | null;
  provider?: string | null;
};

type Conversation = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

type StreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_call"; toolCall: { id: string; name: string } }
  | { type: "usage"; usage: { totalTokens: number; latencyMs: number }; model: string; provider: string }
  | { type: "done"; finishReason: string }
  | { type: "error"; error: { kind: string; message: string } };

export function ChatPanel({
  hasProviders,
  conversations,
  selectedId,
  initialMessages,
}: {
  hasProviders: boolean;
  conversations: Conversation[];
  selectedId: string | null;
  initialMessages: Message[];
}) {
  const router = useRouter();
  const [messages, setMessages] = React.useState<Message[]>(initialMessages);
  const [input, setInput] = React.useState("");
  const [conversationId, setConversationId] = React.useState<string | null>(selectedId);
  const [streaming, setStreaming] = React.useState(false);
  const [meta, setMeta] = React.useState<{ model: string; provider: string; tokens: number; ms: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setMessages(initialMessages);
    setConversationId(selectedId);
    setMeta(null);
    setError(null);
  }, [selectedId, initialMessages]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const ensureConversation = async (): Promise<string> => {
    if (conversationId) return conversationId;
    const res = await fetch("/api/ai/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const json = await res.json();
    const id = json.data.conversation.id as string;
    setConversationId(id);
    return id;
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    setError(null);
    setMeta(null);

    const userMessage: Message = { id: `u_${Date.now()}`, role: "user", content: text };
    const assistantId = `a_${Date.now()}`;
    setMessages((prev) => [...prev, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const id = await ensureConversation();
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: id,
          message: text,
          stream: true,
          title: text.slice(0, 60),
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Request failed (${res.status}).`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data:")) continue;
            let event: StreamEvent;
            try {
              event = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }
            if (event.type === "text_delta") {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: m.content + event.text } : m))
              );
            } else if (event.type === "usage") {
              setMeta({
                model: event.model,
                provider: event.provider,
                tokens: event.usage.totalTokens,
                ms: event.usage.latencyMs,
              });
            } else if (event.type === "error") {
              setError(event.error.message);
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId || m.content));
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      router.refresh(); // refresh conversation list (updated timestamps/titles)
    }
  };

  const stop = () => abortRef.current?.abort();

  const removeConversation = async (id: string) => {
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (id === conversationId) {
      router.push("/dashboard/playground");
    }
    router.refresh();
  };

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[260px_1fr]">
      {/* Thread list */}
      <aside className="rounded-2xl border bg-card p-3">
        <Button
          variant="outline"
          size="sm"
          className="w-full justify-start gap-2"
          onClick={() => router.push("/dashboard/playground")}
        >
          <Plus className="h-4 w-4" /> New conversation
        </Button>
        <ul className="mt-3 space-y-1">
          {conversations.length === 0 && (
            <li className="px-2 py-6 text-center text-xs text-muted-foreground">
              Threads you start will appear here.
            </li>
          )}
          {conversations.map((c) => (
            <li key={c.id} className="group">
              <Link
                href={`/dashboard/playground?c=${c.id}`}
                className={cn(
                  "flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-sm hover:bg-accent",
                  c.id === selectedId && "bg-accent font-medium"
                )}
              >
                <span className="truncate">{c.title}</span>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  className="opacity-0 transition group-hover:opacity-100"
                  onClick={(e) => {
                    e.preventDefault();
                    void removeConversation(c.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </button>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      {/* Chat surface */}
      <section className="flex min-h-[560px] flex-col rounded-2xl border bg-card">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-6 w-6 text-primary" />
              </span>
              <div>
                <p className="font-medium">Ask anything</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {hasProviders
                    ? "The runtime picks your highest-priority healthy provider and fails over automatically if it stalls."
                    : "No providers configured yet — add a free Gemini, OpenRouter, or Ollama connection to start chatting."}
                </p>
                {!hasProviders && (
                  <Link href="/dashboard/ai-providers" className="mt-3 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline">
                    Configure AI providers →
                  </Link>
                )}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={cn("flex gap-3", m.role === "user" && "justify-end")}>
              {m.role === "assistant" && (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Bot className="h-4 w-4 text-primary" />
                </span>
              )}
              <div
                className={cn(
                  "max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-6",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60",
                  m.role === "assistant" && !m.content && streaming && "text-muted-foreground"
                )}
              >
                {m.content || (streaming && m.role === "assistant" ? "Thinking…" : "")}
                {m.provider && (
                  <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
                    {m.provider} · {m.model}
                  </span>
                )}
              </div>
              {m.role === "user" && (
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <UserIcon className="h-4 w-4 text-muted-foreground" />
                </span>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}

        <div className="border-t p-4">
          {meta && (
            <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
              {meta.provider} · {meta.model} · {meta.tokens.toLocaleString()} tokens · {meta.ms}ms
            </p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={hasProviders ? "Ask the runtime… (Enter to send, Shift+Enter for newline)" : "Configure a provider first…"}
              disabled={!hasProviders || streaming}
              rows={1}
              className="max-h-40 min-h-[42px] flex-1 resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {streaming ? (
              <Button type="button" variant="outline" size="icon" onClick={stop} aria-label="Stop generating">
                <Square className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" size="icon" disabled={!hasProviders || !input.trim()} aria-label="Send">
                <CornerDownLeft className="h-4 w-4" />
              </Button>
            )}
          </form>
        </div>
      </section>
    </div>
  );
}
