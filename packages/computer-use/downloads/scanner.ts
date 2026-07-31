import type { VirusScannerPort } from "../ports";

/**
 * HeuristicScanner — default download scanner (no external dependencies).
 *
 * Production deployments can inject a real AV bridge (ClamAV/sandbox API)
 * through the same VirusScannerPort; nothing else in the engine changes.
 *
 * Policy here is deliberately conservative-but-documented:
 *  • known-dangerous executable types → HELD
 *  • scriptable document types (html/svg/xml with script markers) → HELD
 *  • everything else → CLEAN, with the verdict detail stored for audit.
 */
const DANGEROUS_MIME = new Set([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-dosexec",
  "application/vnd.microsoft.portable-executable",
  "application/x-executable",
  "application/x-elf",
  "application/x-mach-binary",
  "application/x-sh",
  "application/x-bat",
]);

const DANGEROUS_EXTENSIONS = new Set([
  ".exe", ".dll", ".scr", ".com", ".bat", ".cmd", ".ps1", ".vbs", ".vbe",
  ".js", ".jse", ".wsf", ".wsh", ".msi", ".msp", ".jar", ".apk", ".app",
  ".deb", ".rpm", ".elf", ".mach-o", ".sys", ".drv",
]);

const SCRIPTABLE_MIME = new Set([
  "text/html", "application/xhtml+xml", "image/svg+xml", "text/xml", "application/xml",
]);

export class HeuristicScanner implements VirusScannerPort {
  readonly name = "heuristic:v1";

  async scan(input: { filename: string; mime: string; data: Buffer }) {
    const ext = extensionOf(input.filename);
    if (DANGEROUS_MIME.has(input.mime) || DANGEROUS_EXTENSIONS.has(ext)) {
      return { status: "HELD" as const, detail: `heuristic: dangerous executable type (${ext || input.mime})` };
    }
    if (SCRIPTABLE_MIME.has(input.mime) && containsActiveMarkup(input.data)) {
      return { status: "HELD" as const, detail: "heuristic: scriptable document with active content markers" };
    }
    return { status: "CLEAN" as const, detail: "heuristic: no risk markers" };
  }
}

function extensionOf(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx === -1 ? "" : filename.slice(idx).toLowerCase();
}

function containsActiveMarkup(data: Buffer): boolean {
  const head = data.subarray(0, Math.min(data.length, 262_144)).toString("utf8").toLowerCase();
  return /<script[\s>]/.test(head) || /javascript:/.test(head) || /data:text\/html/.test(head) || /<iframe[\s>]/.test(head);
}
