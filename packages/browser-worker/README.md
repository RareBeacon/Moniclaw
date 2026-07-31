# @moniclaw/browser-worker

Remote Chromium worker for the MoniClaw Computer Use Engine (MCUE).

Vercel/serverless instances cannot launch local browsers. Deploy this worker
anywhere containers run (Railway, Render, Fly.io, ECS, a VPS) and point the
platform at it:

```
BROWSER_WS_ENDPOINT=wss://your-worker.example.com/<wsPath>
BROWSER_WORKER_TOKEN=<shared secret>
```

The `wsPath` is printed at startup and exposed via `GET /` (`{ "wsPath": "/…" }`).

## Run locally

```bash
cd packages/browser-worker
npm install
BROWSER_WORKER_TOKEN=dev-token npm start
# gateway on :4310 — GET /healthz { ok: true, browser: "chromium" }
```

## Docker

```bash
docker build -t moniclaw-browser-worker packages/browser-worker
docker run -e BROWSER_WORKER_TOKEN=secret -p 4310:4310 moniclaw-browser-worker
```

## Security

- Every websocket upgrade requires the `x-mcue-token` header (constant-time compare).
- The browser server binds to loopback; only the token-gated gateway is public.
- Tokens are never logged; the platform stores only a sanitized endpoint in
  `browser_sessions.endpoint` (credentials stripped).
