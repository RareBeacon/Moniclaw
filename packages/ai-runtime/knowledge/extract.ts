/**
 * Text extraction for knowledge uploads. Each format maps to a plain-text
 * representation suitable for chunking; extractors are defensive (malformed
 * input → clear ExtractionError, never a crash).
 */

export class ExtractionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractionError";
  }
}

export type SupportedMime =
  | "application/pdf"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "application/json"
  | "text/html";

export const SUPPORTED_MIMES: ReadonlySet<string> = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "text/html",
]);

export function sniffMime(filename: string, declared?: string): SupportedMime {
  if (declared && SUPPORTED_MIMES.has(declared)) return declared as SupportedMime;
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const byExt: Record<string, SupportedMime> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    txt: "text/plain",
    md: "text/markdown",
    markdown: "text/markdown",
    csv: "text/csv",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
  };
  const mime = byExt[ext];
  if (!mime) {
    throw new ExtractionError(
      `Unsupported file type (.${ext}). Accepted: PDF, DOCX, TXT, MD, CSV, JSON, HTML, web pages.`
    );
  }
  return mime;
}

export async function extractText(buffer: Buffer, mime: SupportedMime): Promise<string> {
  switch (mime) {
    case "application/pdf":
      return extractPdf(buffer);
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return extractDocx(buffer);
    case "text/html":
      return extractHtml(buffer.toString("utf8"));
    case "application/json": {
      const raw = buffer.toString("utf8");
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        throw new ExtractionError("Invalid JSON file.");
      }
    }
    case "text/csv":
    case "text/plain":
    case "text/markdown":
      return buffer.toString("utf8");
  }
}

async function extractPdf(buffer: Buffer): Promise<string> {
  try {
    // pdf-parse: import the library entry directly (its index has a debug
    // branch that reads a test fixture under some bundlers).
    const mod = await import("pdf-parse/lib/pdf-parse.js" as string);
    const pdfParse = (mod as { default?: unknown }).default ?? mod;
    const result = await (pdfParse as (b: Buffer) => Promise<{ text: string }>)(buffer);
    const text = result.text.trim();
    if (!text) throw new ExtractionError("PDF contains no extractable text (may be scanned).");
    return text;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(`Could not parse PDF: ${(error as Error).message}`);
  }
}

async function extractDocx(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (!text) throw new ExtractionError("DOCX contains no extractable text.");
    return text;
  } catch (error) {
    if (error instanceof ExtractionError) throw error;
    throw new ExtractionError(`Could not parse DOCX: ${(error as Error).message}`);
  }
}

/** HTML → readable text (drops scripts/styles/nav boilerplate). */
export function extractHtml(html: string): string {
  // Cheerio import is deferred so non-HTML paths never pay for it.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const cheerio = require("cheerio") as typeof import("cheerio");
  const $ = cheerio.load(html);
  $("script, style, noscript, svg, form").remove();
  const title = $("title").first().text().trim();
  const body = $("body").text();
  const text = [title, body]
    .filter(Boolean)
    .join("\n\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!text) throw new ExtractionError("Page contains no readable text.");
  return text;
}
