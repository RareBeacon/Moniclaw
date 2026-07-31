// MoniClaw Browser Worker — remote Chromium over websocket for MCUE.
//
// Runs a playwright BrowserServer bound to loopback, fronted by a tiny
// token-gated HTTP(S) reverse proxy (zero dependencies beyond playwright-core).
//
//   GET  /healthz            → { ok, browser, version, uptimeSec }
//   GET  /                   → { wsPath, browser } (for clients that discover)
//   WS   <launchServer path> → proxied to the browser (requires x-mcue-token)
//
// Env:
//   BROWSER_WORKER_TOKEN   required — clients send it as x-mcue-token
//   PORT                   default 4310
//   WORKER_BROWSER         chromium | firefox  (default chromium)
//   WORKER_HEADLESS        "1" headed=false (default "1")
//   PLAYWRIGHT_BROWSERS_PATH  browser cache (image default /ms-playwright)

import http from "node:http";
import net from "node:net";
import { chromium, firefox } from "playwright-core";

const TOKEN = process.env.BROWSER_WORKER_TOKEN;
if (!TOKEN) {
  console.error("[browser-worker] BROWSER_WORKER_TOKEN is required.");
  process.exit(1);
}
const PORT = Number(process.env.PORT ?? 4310);
const BROWSER = (process.env.WORKER_BROWSER ?? "chromium").toLowerCase();
const HEADLESS = process.env.WORKER_HEADLESS !== "0";
const started = Date.now();

const CONTAINER_SAFE_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--disable-gpu",
  "--disable-features=TranslateUI",
  "--no-first-run",
  "--no-default-browser-check",
];

function tokenOk(headerValue) {
  if (!headerValue || headerValue.length !== TOKEN.length) return false;
  // constant-time comparison
  let diff = 0;
  for (let i = 0; i < TOKEN.length; i++) diff |= headerValue.charCodeAt(i) ^ TOKEN.charCodeAt(i);
  return diff === 0;
}

async function main() {
  const type = BROWSER === "firefox" ? firefox : chromium;
  const server = await type.launchServer({
    headless: HEADLESS,
    args: CONTAINER_SAFE_ARGS,
    host: "127.0.0.1",
    port: 0,
  });
  const wsEndpoint = server.wsEndpoint();
  const upstreamUrl = new URL(wsEndpoint);
  const upstreamPort = Number(upstreamUrl.port);
  const upstreamHost = upstreamUrl.hostname;
  const wsPath = upstreamUrl.pathname;
  console.log(`[browser-worker] ${BROWSER} server live at loopback ${upstreamHost}:${upstreamPort}${wsPath}`);

  const httpServer = http.createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, browser: BROWSER, headless: HEADLESS, uptimeSec: Math.round((Date.now() - started) / 1000), version: process.env.npm_package_version ?? "4.0.0" }));
      return;
    }
    if (req.url === "/" || req.url === "/endpoint") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ browser: BROWSER, wsPath }));
      return;
    }
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  // Token-gated ws proxy to the loopback browser server.
  httpServer.on("upgrade", (req, socket, head) => {
    if (!tokenOk(req.headers["x-mcue-token"])) {
      socket.write("HTTP/1.1 403 Forbidden\r\nconnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    const upstream = net.connect(upstreamPort, upstreamHost, () => {
      upstream.write(`${req.method} ${req.url} HTTP/1.1\r\n`);
      for (const [key, value] of Object.entries(req.headers)) {
        if (key.toLowerCase() === "host") {
          upstream.write(`host: ${upstreamHost}:${upstreamPort}\r\n`);
        } else {
          upstream.write(`${key}: ${value}\r\n`);
        }
      }
      upstream.write("\r\n");
      if (head && head.length > 0) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  httpServer.listen(PORT, () => {
    console.log(`[browser-worker] gateway listening on :${PORT} (ws path ${wsPath}, token required)`);
  });

  const shutdown = async () => {
    console.log("[browser-worker] shutting down…");
    httpServer.close();
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[browser-worker] fatal:", err);
  process.exit(1);
});
