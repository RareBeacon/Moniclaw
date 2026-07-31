import { z } from "zod";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import type { Tool } from "../tool";

/**
 * SSRF-guarded HTTP tool.
 * Defenses: https-only by default, literal-private-IP blocklist, DNS
 * resolution check (all A/AAAA records must be public), redirect cap,
 * body size cap, hard timeout. No streaming of request bodies.
 */

const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // CGNAT
];
const PRIVATE_V6 = [/^::1$/, /^fc/i, /^fd/i, /^fe80/i];
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "169.254.169.254"]);

async function assertPublicHostname(hostname: string): Promise<void> {
  const lower = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.has(lower)) throw new Error(`Blocked host: ${hostname}`);
  if (isIP(lower)) {
    if (isIP(lower) === 4 && PRIVATE_V4.some((r) => r.test(lower))) {
      throw new Error(`Blocked private address: ${hostname}`);
    }
    if (isIP(lower) === 6 && PRIVATE_V6.some((r) => r.test(lower))) {
      throw new Error(`Blocked private address: ${hostname}`);
    }
    return; // public literal
  }
  const records = await lookup(lower, { all: true, verbatim: true });
  if (!records.length) throw new Error(`Host did not resolve: ${hostname}`);
  for (const { address, family } of records) {
    if (family === 4 && PRIVATE_V4.some((r) => r.test(address))) {
      throw new Error(`Host resolves to a private address: ${hostname}`);
    }
    if (family === 6 && PRIVATE_V6.some((r) => r.test(address))) {
      throw new Error(`Host resolves to a private address: ${hostname}`);
    }
  }
}

const MAX_BODY_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;

export const httpRequestTool: Tool = {
  name: "http_request",
  description:
    "Make an outbound HTTP request to a PUBLIC endpoint (GET/POST/PUT/PATCH/DELETE). HTTPS only; private/loopback/metadata hosts are blocked. Returns status + truncated body.",
  schema: z.object({
    url: z.string().url().max(2048),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    headers: z.record(z.string(), z.string()).optional(),
    body: z.string().max(64_000).optional().describe("Raw request body (JSON string typical)."),
    timeoutMs: z.number().int().min(1000).max(30_000).default(15_000),
  }),
  metadata: {
    category: "network",
    mutating: false, // read-oriented; POST kept but tool is non-destructive by contract
    version: "1.0.0",
    defaultTimeoutMs: 30_000,
  },
  async execute({ url, method, headers, body, timeoutMs }, ctx) {
    let current = new URL(url);
    if (current.protocol !== "https:") {
      throw new Error("Only https:// URLs are allowed.");
    }

    let redirectCount = 0;
    let response: Response | null = null;
    let finalUrl = current.toString();
    let status = 0;

    while (redirectCount <= MAX_REDIRECTS) {
      await assertPublicHostname(current.hostname);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error("timeout")), timeoutMs);
      const onAbort = () => controller.abort(ctx.signal?.reason);
      ctx.signal?.addEventListener("abort", onAbort, { once: true });
      try {
        response = await fetch(current.toString(), {
          method,
          headers: {
            "User-Agent": "MoniClaw-Runtime/1.0 (+https://moniclaw.vercel.app)",
            ...(headers ?? {}),
          },
          body: method === "GET" ? undefined : body,
          redirect: "manual",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
        ctx.signal?.removeEventListener("abort", onAbort);
      }
      status = response.status;
      finalUrl = current.toString();
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.get("location");
        if (!location) break;
        current = new URL(location, current);
        if (current.protocol !== "https:") throw new Error("Redirect to non-https blocked.");
        redirectCount++;
        continue;
      }
      break;
    }
    if (!response) throw new Error("No response received.");

    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.byteLength;
        if (received > MAX_BODY_BYTES) {
          chunks.push(value.slice(0, MAX_BODY_BYTES - (received - value.byteLength)));
          void reader.cancel();
          break;
        }
        chunks.push(value);
      }
    }
    const text = Buffer.concat(chunks).toString("utf8");
    return {
      url: finalUrl,
      status,
      redirected: redirectCount > 0,
      truncated: received > MAX_BODY_BYTES,
      contentType: response.headers.get("content-type") ?? "",
      body: text.slice(0, MAX_BODY_BYTES),
    };
  },
};
