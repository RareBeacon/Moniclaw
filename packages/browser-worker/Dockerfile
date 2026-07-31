# MoniClaw Browser Worker — remote Chromium for MCUE (serverless deploys).
# Build:  docker build -t moniclaw-browser-worker packages/browser-worker
# Run:    docker run -e BROWSER_WORKER_TOKEN=… -p 4310:4310 moniclaw-browser-worker
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

ENV NODE_ENV=production \
    PORT=4310 \
    WORKER_BROWSER=chromium \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

WORKDIR /worker
COPY package.json ./
# playwright-core library (browsers already baked into the base image at /ms-playwright)
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs ./

EXPOSE 4310
# Health check for orchestrators (Railway/Render/Fly/K8s)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT??4310)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
