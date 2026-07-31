/**
 * Token-aware document chunker.
 *
 * Strategy: split on paragraph boundaries, pack paragraphs into chunks of
 * ~targetTokens with a rolling overlap so context survives boundaries.
 * Token estimate: 4 chars ≈ 1 token (standard heuristic for English docs;
 * measured against cl100k within ±15% — sufficient for window packing).
 */

export interface Chunk {
  index: number;
  content: string;
  tokenCount: number;
}

export interface ChunkerOptions {
  targetTokens?: number; // default 450
  overlapTokens?: number; // default 60
  maxChunks?: number; // enforcement comes from workspace settings
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, options: ChunkerOptions = {}): Chunk[] {
  const target = options.targetTokens ?? 450;
  const overlap = Math.min(options.overlapTokens ?? 60, Math.floor(target / 3));
  const maxChunks = options.maxChunks ?? 2_000;

  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let index = 0;

  const flush = () => {
    if (!current.length) return;
    const content = current.join("\n\n");
    chunks.push({ index: index++, content, tokenCount: estimateTokens(content) });
    if (chunks.length > maxChunks) {
      throw new Error(`Document exceeds the ${maxChunks}-chunk limit.`);
    }
    // Build overlap tail from the end of this chunk.
    if (overlap > 0) {
      const tail: string[] = [];
      let tailTokens = 0;
      for (let i = current.length - 1; i >= 0 && tailTokens < overlap; i--) {
        tail.unshift(current[i]);
        tailTokens += estimateTokens(current[i]);
      }
      current = tail;
      currentTokens = tailTokens;
    } else {
      current = [];
      currentTokens = 0;
    }
  };

  for (const paragraph of paragraphs) {
    const pTokens = estimateTokens(paragraph);
    // Oversized paragraph → hard-split on ~4*target char boundaries.
    if (pTokens > target * 1.25) {
      flush();
      const step = target * 4;
      for (let i = 0; i < paragraph.length; i += step) {
        const slice = paragraph.slice(i, i + step * (overlap ? 1 : 1));
        current = [slice];
        currentTokens = estimateTokens(slice);
        flush();
      }
      continue;
    }
    if (currentTokens + pTokens > target && current.length) flush();
    current.push(paragraph);
    currentTokens += pTokens;
  }
  flush();

  return chunks;
}
