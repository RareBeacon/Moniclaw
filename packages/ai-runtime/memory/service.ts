import { Prisma, type MemoryScope, type PrismaClient } from "@prisma/client";

/**
 * Memory engine.
 *
 * Layers: conversation (short-term, per thread) · workspace (shared facts) ·
 * agent (durable per-agent) · long-term (compressed/promoted). Retrieval is
 * semantic (pgvector cosine) re-ranked with importance + recency; expiration
 * policies apply at read time AND via an explicit sweep.
 *
 * Vector ops go through raw SQL (Prisma can't express `<=>`); everything
 * else uses the typed client. All queries are workspace-scoped.
 */

const EMBEDDING_MODEL = "text-embedding-004";
const RECALL_LIMIT = 8;

/** Cosine similarity → final score weights (tuned for support-chat facts). */
const W_SIMILARITY = 0.65;
const W_IMPORTANCE = 0.2;
const W_RECENCY = 0.15;
const RECENCY_HALF_LIFE_DAYS = 30;

export interface MemoryRecallItem {
  id: string;
  content: string;
  scope: MemoryScope;
  score: number;
  similarity: number;
  importance: number;
  tags: string[];
  createdAt: Date;
}

export class MemoryService {
  constructor(private readonly db: PrismaClient) {}

  /** Store a memory record (with optional precomputed embedding). */
  async remember(input: {
    workspaceId: string;
    scope: MemoryScope;
    content: string;
    agentId?: string | null;
    conversationKey?: string | null;
    importance?: number;
    tags?: string[];
    expiresAt?: Date | null;
    createdById?: string | null;
    embedding?: number[];
    embeddingModel?: string;
  }) {
    const record = await this.db.memoryRecord.create({
      data: {
        workspaceId: input.workspaceId,
        scope: input.scope,
        content: input.content,
        agentId: input.agentId ?? null,
        conversationKey: input.conversationKey ?? null,
        importance: input.importance ?? 50,
        tags: input.tags ?? [],
        expiresAt: input.expiresAt ?? null,
        createdById: input.createdById ?? null,
        embeddingModel: input.embedding ? (input.embeddingModel ?? EMBEDDING_MODEL) : null,
      },
    });
    if (input.embedding?.length) {
      await this.setEmbedding(record.id, input.embedding);
    }
    return record;
  }

  async setEmbedding(recordId: string, vector: number[]): Promise<void> {
    const literal = `[${vector.join(",")}]`;
    await this.db.$executeRaw`
      UPDATE memory_records SET embedding = ${literal}::vector WHERE id = ${recordId}
    `;
  }

  /**
   * Semantic recall: vector similarity, re-ranked by importance + recency.
   * Falls back to recent-by-importance when no embedding is available.
   */
  async recall(input: {
    workspaceId: string;
    queryEmbedding?: number[];
    scopes?: MemoryScope[];
    conversationKey?: string | null;
    limit?: number;
  }): Promise<MemoryRecallItem[]> {
    const limit = input.limit ?? RECALL_LIMIT;
    const scopes = input.scopes?.length ? input.scopes : null;
    const now = new Date();

    if (input.queryEmbedding?.length) {
      const literal = `[${input.queryEmbedding.join(",")}]`;
      const rows = await this.db.$queryRaw<Array<{
        id: string; content: string; scope: MemoryScope;
        importance: number; tags: string[]; created_at: Date; similarity: number;
      }>>`
        SELECT id, content, scope, importance, tags, "createdAt" AS created_at,
               1 - (embedding <=> ${literal}::vector) AS similarity
        FROM memory_records
        WHERE "workspaceId" = ${input.workspaceId}
          AND embedding IS NOT NULL
          AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
          ${scopes ? Prisma.sql`AND scope = ANY(${scopes}::"MemoryScope"[])` : Prisma.empty}
          ${input.conversationKey !== undefined
            ? Prisma.sql`AND "conversationKey" ${input.conversationKey === null
                ? Prisma.sql`IS NULL`
                : Prisma.sql`= ${input.conversationKey}`}`
            : Prisma.empty}
        ORDER BY embedding <=> ${literal}::vector
        LIMIT ${limit * 3}
      `;
      return rows
        .map((row) => {
          const ageDays = Math.max(0, (now.getTime() - row.created_at.getTime()) / 86_400_000);
          const recency = Math.exp((-Math.LN2 * ageDays) / RECENCY_HALF_LIFE_DAYS);
          const score =
            W_SIMILARITY * row.similarity +
            W_IMPORTANCE * (row.importance / 100) +
            W_RECENCY * recency;
          return { ...row, createdAt: row.created_at, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ created_at: _drop, ...rest }) => rest as unknown as MemoryRecallItem & { createdAt: Date });
    }

    // No embedding → deterministic fallback (importance + recency ordering).
    const rows = await this.db.memoryRecord.findMany({
      where: {
        workspaceId: input.workspaceId,
        ...(scopes ? { scope: { in: scopes } } : {}),
        ...(input.conversationKey !== undefined
          ? { conversationKey: input.conversationKey }
          : {}),
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
      take: limit,
    });
    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      scope: r.scope,
      score: r.importance / 100,
      similarity: 0,
      importance: r.importance,
      tags: r.tags,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Compression: when a conversation exceeds the policy, fold the oldest
   * half into a single LONG_TERM record (content supplied by the caller —
   * usually an LLM summary from the chat layer).
   */
  async compress(input: {
    workspaceId: string;
    conversationKey: string;
    summary: string;
    importance?: number;
    keepRecent?: number; // delete all but the N newest convo records
    createdById?: string | null;
  }) {
    const existing = await this.db.memoryRecord.findMany({
      where: { workspaceId: input.workspaceId, conversationKey: input.conversationKey, scope: "CONVERSATION" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    const keep = input.keepRecent ?? 0;
    const toDelete = existing.slice(keep).map((r) => r.id);
    const [promoted] = await this.db.$transaction([
      this.db.memoryRecord.create({
        data: {
          workspaceId: input.workspaceId,
          scope: "LONG_TERM",
          conversationKey: input.conversationKey,
          content: input.summary,
          importance: input.importance ?? 70,
          tags: ["compressed"],
          createdById: input.createdById ?? null,
        },
      }),
      ...(toDelete.length
        ? [this.db.memoryRecord.deleteMany({ where: { id: { in: toDelete } } })]
        : []),
    ]);
    return promoted;
  }

  /** Expiration policy sweep — safe to run from cron or lazily. */
  async sweepExpired(workspaceId?: string): Promise<number> {
    const result = await this.db.memoryRecord.deleteMany({
      where: {
        expiresAt: { lte: new Date() },
        ...(workspaceId ? { workspaceId } : {}),
      },
    });
    return result.count;
  }

  async purgeBeyondLimit(workspaceId: string, maxRecords: number): Promise<number> {
    const overflow = await this.db.memoryRecord.findMany({
      where: { workspaceId },
      orderBy: [{ importance: "asc" }, { createdAt: "asc" }],
      select: { id: true },
      skip: maxRecords,
    });
    if (!overflow.length) return 0;
    const result = await this.db.memoryRecord.deleteMany({
      where: { id: { in: overflow.map((r) => r.id) } },
    });
    return result.count;
  }

  async stats(workspaceId: string) {
    const grouped = await this.db.memoryRecord.groupBy({
      by: ["scope"],
      where: { workspaceId },
      _count: { _all: true },
    });
    const embedded = await this.db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*)::bigint AS n FROM memory_records
      WHERE "workspaceId" = ${workspaceId} AND embedding IS NOT NULL
    `;
    return {
      total: grouped.reduce((s, g) => s + g._count._all, 0),
      byScope: Object.fromEntries(grouped.map((g) => [g.scope, g._count._all])),
      withEmbeddings: Number(embedded[0]?.n ?? 0n),
    };
  }
}
