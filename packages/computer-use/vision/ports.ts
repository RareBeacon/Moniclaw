/**
 * Vision capability seams.
 *
 *  • OcrProviderPort   — pluggable OCR (Tesseract service, cloud OCR…).
 *                        No default implementation ships; VisionService
 *                        returns `unsupported` until one is registered.
 *  • VisionModelPort   — multimodal LLM seam (lives in ../ports.ts) for
 *                        future screenshot understanding.
 *
 * Both are deliberately empty-by-default: the always-on baseline is the
 * DOM/accessibility analyzer (layout.ts), which costs nothing and needs
 * no external services.
 */

export interface OcrResult {
  text: string;
  confidence: number;
  blocks?: Array<{ text: string; box: { x: number; y: number; width: number; height: number } }>;
}

export interface OcrProviderPort {
  readonly name: string;
  extract(image: Buffer, opts?: { language?: string }): Promise<OcrResult>;
}
