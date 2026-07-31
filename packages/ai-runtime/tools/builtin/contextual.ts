import { z } from "zod";
import type { Tool } from "../tool";
import type { KnowledgeService, SearchHit } from "../../knowledge/service";
import type { MemoryService, MemoryRecallItem } from "../../memory/service";

/**
 * Context tools — give models grounded access to workspace knowledge and
 * memory. Services arrive via constructor injection (ports stay testable).
 */

export function createKnowledgeSearchTool(knowledge: KnowledgeService): Tool {
  return {
    name: "knowledge_search",
    description:
      "Search the workspace knowledge base (uploaded PDFs, docs, pages) by meaning. Returns the most relevant passages with citations (document + chunk).",
    schema: z.object({
      query: z.string().min(2).max(1000).describe("What to look for, in natural language."),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    metadata: {
      category: "knowledge",
      mutating: false,
      requiredAction: "knowledge.read",
      version: "1.0.0",
      defaultTimeoutMs: 20_000,
    },
    async execute({ query, limit }, ctx) {
      const hits: SearchHit[] = await knowledge.search({
        workspaceId: ctx.workspaceId,
        query,
        limit,
      });
      return {
        query,
        results: hits.map((h) => ({
          citation: `${h.documentTitle} · chunk ${h.index + 1}`,
          similarity: Number(h.similarity.toFixed(4)),
          content: h.content.slice(0, 2_000),
        })),
        empty: hits.length === 0,
      };
    },
  };
}

export function createMemoryRecallTool(memory: MemoryService): Tool {
  return {
    name: "memory_recall",
    description:
      "Recall facts from workspace/agent/long-term memory by meaning. Use before answering questions about preferences, decisions, or prior work.",
    schema: z.object({
      query: z.string().min(2).max(1000),
      scopes: z
        .array(z.enum(["WORKSPACE", "AGENT", "LONG_TERM", "CONVERSATION"]))
        .optional(),
      limit: z.number().int().min(1).max(10).default(5),
    }),
    metadata: {
      category: "memory",
      mutating: false,
      version: "1.0.0",
      defaultTimeoutMs: 15_000,
    },
    async execute({ query, scopes, limit }, ctx) {
      const items: MemoryRecallItem[] = await memory.recall({
        workspaceId: ctx.workspaceId,
        scopes,
        limit,
      });
      return {
        query,
        memories: items.map((m) => ({
          scope: m.scope,
          score: Number(m.score.toFixed(4)),
          content: m.content.slice(0, 1_500),
          tags: m.tags,
        })),
        empty: items.length === 0,
      };
    },
  };
}
