import { createHash } from "node:crypto";
import type { PrismaClient, KnowledgeDocument } from "@prisma/client";
import type { EmbedRequest, EmbedResponse } from "../types";
import { chunkText, estimateTokens } from "./chunker";
import { extractHtml, extractText, sniffMime, SUPPORTED_MIMES, ExtractionError } from "./extract";

/**
 * Knowledge base service: upload → extract → dedupe → chunk → embed
 * (cache-aware) → store vectors → semantic retrieval.
 *
 * The embedder is a Port — production injects the ModelRouter; tests inject
 * fakes. Vector queries use raw SQL (pgvector `<=>`); rows via typed client.
 */

export interface Embedder {
  embed(request: EmbedRequest): Promise<EmbedResponse>;
}

export interface KnowledgeLimits {
  maxDocuments: number;
  maxFileBytes: number;
  maxChunksPerDoc: number;
}

export interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  index: number;
  content: string;
  similarity: number;
}

const fft = (h: string | Buffer) => createHash("sha256").update(h).digest("hex");

export class KnowledgeService {
  constructor(
    private readonly db: PrismaClient,
    /** Factory keeps usage attribution per workspace (router is ctx-bound). */
    private readonly embedderFor: (workspaceId: string) => Embedder | null
  ) {}

  private embedder(workspaceId: string): Embedder | null {
    return this.embedderFor(workspaceId);
  }

  /** Ingest from an uploaded file buffer. */
  async ingestFile(input: {
    workspaceId: string;
    filename: string;
    mime?: string;
    buffer: Buffer;
    limits: KnowledgeLimits;
    createdById?: string | null;
  }): Promise<KnowledgeDocument> {
    const mime = sniffMime(input.filename, input.mime);
    if (input.buffer.byteLength > input.limits.maxFileBytes) {
      throw new ExtractionError(
        `File exceeds the ${Math.round(input.limits.maxFileBytes / 1024 / 1024)}MB limit.`
      );
    }
    const checksum = fft(input.buffer);
    return this.ingestPrepared({
      workspaceId: input.workspaceId,
      title: input.filename.replace(/\.[a-z0-9]+$/i, ""),
      filename: input.filename,
      mime,
      sizeBytes: input.buffer.byteLength,
      checksum,
      source: "FILE",
      sourceUrl: null,
      extract: () => extractText(input.buffer, mime),
      limits: input.limits,
      createdById: input.createdById ?? null,
    });
  }

  /** Ingest a public web page (fetched by the caller's HTTP tool wrapper). */
  async ingestWebPage(input: {
    workspaceId: string;
    url: string;
    html: string;
    limits: KnowledgeLimits;
    createdById?: string | null;
  }): Promise<KnowledgeDocument> {
    const text = extractHtml(input.html);
    const checksum = fft(text);
    return this.ingestPrepared({
      workspaceId: input.workspaceId,
      title: new URL(input.url).hostname + new URL(input.url).pathname,
      filename: new URL(input.url).hostname,
      mime: "text/html",
      sizeBytes: Buffer.byteLength(input.html),
      checksum,
      source: "URL",
      sourceUrl: input.url,
      extract: async () => text,
      limits: input.limits,
      createdById: input.createdById ?? null,
    });
  }

  private async ingestPrepared(args: {
    workspaceId: string;
    title: string;
    filename: string;
    mime: string;
    sizeBytes: number;
    checksum: string;
    source: "FILE" | "URL";
    sourceUrl: string | null;
    extract: () => Promise<string>;
    limits: KnowledgeLimits;
    createdById: string | null;
  }): Promise<KnowledgeDocument> {
    // Duplicate detection: identical content already ingested → return it.
    const duplicate = await this.db.knowledgeDocument.findUnique({
      where: { workspaceId_checksum: { workspaceId: args.workspaceId, checksum: args.checksum } },
    });
    if (duplicate && !duplicate.deletedAt) return duplicate;

    // Document quota.
    const count = await this.db.knowledgeDocument.count({
      where: { workspaceId: args.workspaceId, deletedAt: null },
    });
    if (count >= args.limits.maxDocuments) {
      throw new ExtractionError(
        `Knowledge base is full (${args.limits.maxDocuments} documents). Raise the limit in AI settings.`
      );
    }

    const document = await this.db.knowledgeDocument.create({
      data: {
        workspaceId: args.workspaceId,
        title: args.title.slice(0, 200),
        filename: args.filename.slice(0, 300),
        mime: args.mime,
        sizeBytes: args.sizeBytes,
        checksum: args.checksum,
        source: args.source,
        sourceUrl: args.sourceUrl,
        status: "PROCESSING",
        createdById: args.createdById,
      },
    });

    try {
      const text = await args.extract();
      if (!text.trim()) throw new ExtractionError("Nothing to index after extraction.");
      const chunks = chunkText(text, { maxChunks: args.limits.maxChunksPerDoc });
      if (!chunks.length) throw new ExtractionError("Nothing to index after chunking.");

      const embeddings = await this.embedAll(
        chunks.map((c) => c.content),
        args.workspaceId
      );

      // Chunk rows + vectors (raw insert keeps vector type in one round-trip).
      for (const [i, chunk] of chunks.entries()) {
        const row = await this.db.knowledgeChunk.create({
          data: {
            documentId: document.id,
            workspaceId: args.workspaceId,
            index: i,
            content: chunk.content,
            tokenCount: chunk.tokenCount,
          },
        });
        const vector = embeddings[i] ?? null;
        if (vector?.length) {
          await this.db.$executeRaw`
            UPDATE knowledge_chunks SET embedding = ${`[${vector.join(",")}]`}::vector WHERE id = ${row.id}
          `;
        }
      }

      return await this.db.knowledgeDocument.update({
        where: { id: document.id },
        data: { status: "READY", chunkCount: chunks.length, error: null },
      });
    } catch (error) {
      await this.db.knowledgeDocument.update({
        where: { id: document.id },
        data: {
          status: "FAILED",
          error: (error as Error).message.slice(0, 500),
        },
      });
      throw error;
    }
  }

  /** Embed texts with the content-hash cache (skips re-embedding duplicates). */
  private async embedAll(texts: string[], workspaceId: string): Promise<(number[] | null)[]> {
    const embedder = this.embedder(workspaceId);
    if (!embedder || !texts.length) return texts.map(() => null);

    const model = "text-embedding-004";
    const hashes = texts.map((t) => fft(`${model}:${t}`));
    const cachedRows = await this.db.$queryRaw<
      Array<{ hash: string; vector: string }>
    >`SELECT hash, vector::text AS vector FROM embedding_cache WHERE hash = ANY(${hashes})`;
    const cache = new Map(
      cachedRows.map((r) => [r.hash, JSON.parse(r.vector) as number[]])
    );

    const out: (number[] | null)[] = new Array(texts.length).fill(null);
    const missingIdx: number[] = [];
    texts.forEach((text, i) => {
      const hit = cache.get(hashes[i]);
      if (hit) out[i] = hit;
      else missingIdx.push(i);
    });

    if (missingIdx.length) {
      const response = await embedder.embed({
        texts: missingIdx.map((i) => texts[i]),
        taskType: "RETRIEVAL_DOCUMENT",
      });
      const inserts: Array<{ hash: string; model: string; dim: number; lit: string }> = [];
      missingIdx.forEach((textIdx, j) => {
        const vector = response.vectors[j];
        if (!vector?.length) return;
        out[textIdx] = vector;
        inserts.push({
          hash: hashes[textIdx],
          model,
          dim: vector.length,
          lit: `[${vector.join(",")}]`,
        });
      });
      for (const row of inserts) {
        await this.db.$executeRaw`
          INSERT INTO embedding_cache (hash, model, dim, vector, "hitCount", "createdAt")
          VALUES (${row.hash}, ${row.model}, ${row.dim}, ${row.lit}::vector, 0, NOW())
          ON CONFLICT (hash) DO UPDATE SET "hitCount" = embedding_cache."hitCount" + 1
        `;
      }
    }
    return out; // cache is content-keyed, tenant-agnostic by design
  }

  /** Semantic search over READY documents in one workspace. */
  async search(input: {
    workspaceId: string;
    query: string;
    limit?: number;
  }): Promise<SearchHit[]> {
    const limit = input.limit ?? 6;
    const embedder = this.embedder(input.workspaceId);
    if (!embedder) return [];
    // Contract: search degrades to an HONEST EMPTY result when embeddings
    // are unavailable (chat-only provider, e.g. OpenRouter free tier),
    // instead of failing the caller's whole operation (research runs,
    // campaign drafts, chat tool calls).
    let response: Awaited<ReturnType<typeof embedder.embed>>;
    try {
      response = await embedder.embed({
        texts: [input.query],
        taskType: "RETRIEVAL_QUERY",
      });
    } catch (err) {
      console.warn(
        `[knowledge] search degraded: embeddings unavailable — ${(err as Error).message.slice(0, 120)}`
      );
      return [];
    }
    const vector = response.vectors[0];
    if (!vector?.length) return [];

    const rows = await this.db.$queryRaw<Array<{
      chunk_id: string;
      document_id: string;
      title: string;
      index: number;
      content: string;
      similarity: number;
    }>>`
      SELECT c.id AS chunk_id, c."documentId" AS document_id, d.title, c.index, c.content,
             1 - (c.embedding <=> ${`[${vector.join(",")}]`}::vector) AS similarity
      FROM knowledge_chunks c
      JOIN knowledge_documents d ON d.id = c."documentId"
      WHERE c."workspaceId" = ${input.workspaceId}
        AND c.embedding IS NOT NULL
        AND d.status = 'READY' AND d."deletedAt" IS NULL
      ORDER BY c.embedding <=> ${`[${vector.join(",")}]`}::vector
      LIMIT ${limit}
    `;
    return rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      documentTitle: r.title,
      index: r.index,
      content: r.content,
      similarity: r.similarity,
    }));
  }

  async listDocuments(workspaceId: string) {
    return this.db.knowledgeDocument.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, title: true, filename: true, mime: true, sizeBytes: true,
        status: true, error: true, chunkCount: true, source: true, sourceUrl: true,
        createdAt: true, checksum: true,
      },
    });
  }

  async getChunks(documentId: string, workspaceId: string) {
    return this.db.knowledgeChunk.findMany({
      where: { documentId, workspaceId },
      orderBy: { index: "asc" },
      select: { id: true, index: true, content: true, tokenCount: true },
    });
  }

  async deleteDocument(documentId: string, workspaceId: string): Promise<void> {
    await this.db.knowledgeDocument.updateMany({
      where: { id: documentId, workspaceId },
      data: { deletedAt: new Date() },
    });
  }

  /** Token estimate for a document without loading chunks. */
  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}

export { SUPPORTED_MIMES };
