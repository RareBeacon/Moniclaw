import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

/**
 * Pixel-level screenshot comparison (pixelmatch) with a coarse change-heat
 * grid — used by the execution "validate" phase to confirm an action indeed
 * changed the page (or the recordings diff view).
 */

export interface DiffReport {
  width: number;
  height: number;
  totalPixels: number;
  diffPixels: number;
  /** 0..1 — 0 identical, 1 completely different. */
  ratio: number;
  /** Grid cells (10x10) with a change intensity 0..1. */
  heat: number[][];
  /** True when images could not be compared (dimension/decoder mismatch). */
  incomparable?: boolean;
}

function decodePng(data: Buffer): PNG | null {
  try {
    return PNG.sync.read(data);
  } catch {
    return null;
  }
}

export function diffScreenshots(before: Buffer, after: Buffer, threshold = 0.12): DiffReport {
  const a = decodePng(before);
  const b = decodePng(after);
  if (!a || !b) {
    return { width: 0, height: 0, totalPixels: 0, diffPixels: 0, ratio: 0, heat: [], incomparable: true };
  }
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  const diff = new PNG({ width, height });
  // Crop both to the shared area.
  const crop = (img: PNG): PNG => {
    const out = new PNG({ width, height });
    PNG.bitblt(img, out, 0, 0, width, height, 0, 0);
    return out;
  };
  const aC = width === a.width && height === a.height ? a : crop(a);
  const bC = width === b.width && height === b.height ? b : crop(b);

  const diffPixels = pixelmatch(aC.data, bC.data, diff.data, width, height, { threshold });
  const totalPixels = width * height;
  const ratio = totalPixels > 0 ? diffPixels / totalPixels : 0;

  // Coarse 10x10 heat grid from the diff mask.
  const cols = 10;
  const rows = 10;
  const heat: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  const counts: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // pixelmatch paints diffs red (255,0,0)
      const isDiff = diff.data[idx] === 255 && diff.data[idx + 1] === 0 && diff.data[idx + 2] === 0;
      const gy = Math.min(rows - 1, Math.floor((y / height) * rows));
      const gx = Math.min(cols - 1, Math.floor((x / width) * cols));
      counts[gy][gx] += 1;
      if (isDiff) heat[gy][gx] += 1;
    }
  }
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      heat[gy][gx] = counts[gy][gx] > 0 ? Math.round((heat[gy][gx] / counts[gy][gx]) * 1000) / 1000 : 0;
    }
  }

  return { width, height, totalPixels, diffPixels, ratio: Math.round(ratio * 10_000) / 10_000, heat };
}
