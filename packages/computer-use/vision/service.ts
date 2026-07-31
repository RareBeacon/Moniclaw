import type { Page } from "playwright-core";
import { CueError } from "../errors";
import type { VisionModelPort } from "../ports";
import { diffScreenshots, type DiffReport } from "./diff";
import { analyzePageLayout, type PageUnderstanding } from "./layout";
import type { OcrProviderPort, OcrResult } from "./ports";

/**
 * VisionService — the engine's eyes.
 *
 *   analyze()          baseline DOM/accessibility understanding (always on)
 *   diffScreenshots()  pixel-level change detection for validation/recovery
 *   readText()         OCR via the optional OcrProviderPort seam
 *   describeImage()    multimodal model via the optional VisionModelPort seam
 *
 * Both seams are constructor-injected and OPTIONAL — wiring a Tesseract
 * sidecar or a Gemini-level model is a deployment choice, not engine code.
 */
export class VisionService {
  constructor(
    private readonly ocr: OcrProviderPort | null = null,
    private readonly model: VisionModelPort | null = null
  ) {}

  /** Baseline page understanding from the DOM (no external services). */
  analyze(page: Page): Promise<PageUnderstanding> {
    return analyzePageLayout(page);
  }

  /** Pixel diff between two PNG screenshots. */
  compare(before: Buffer, after: Buffer): DiffReport {
    return diffScreenshots(before, after);
  }

  /** OCR — requires an injected provider; otherwise an honest unsupported. */
  async readText(image: Buffer, opts?: { language?: string }): Promise<OcrResult> {
    if (!this.ocr) {
      throw new CueError("unsupported", "OCR is not configured: inject an OcrProviderPort (e.g. a Tesseract sidecar) to enable image text extraction.");
    }
    return this.ocr.extract(image, opts);
  }

  /** Multimodal image description — requires an injected vision model. */
  async describeImage(image: Buffer, prompt: string): Promise<{ text: string; model: string }> {
    if (!this.model) {
      throw new CueError("unsupported", "No multimodal vision model is configured (VisionModelPort). The DOM-based analyze() baseline is always available.");
    }
    return { text: await this.model.describe({ image, prompt }), model: this.model.model };
  }

  capabilities(): { domAnalysis: true; diff: true; ocr: boolean; multimodal: boolean; ocrProvider: string | null; visionModel: string | null } {
    return {
      domAnalysis: true,
      diff: true,
      ocr: this.ocr != null,
      multimodal: this.model != null,
      ocrProvider: this.ocr?.name ?? null,
      visionModel: this.model?.model ?? null,
    };
  }
}
