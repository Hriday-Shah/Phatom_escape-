# Phantom Escape game server (Colyseus). Build context: the repo root.
# Only the server and the few pure client modules it shares (lobby rules, nickname cleaning,
# walking speed) are copied; no client assets or media.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace server --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server/tsconfig.json server/
COPY server/src server/src
COPY client/src/lobby/lobby.ts client/src/lobby/lobby.ts
COPY client/src/home/settings.ts client/src/home/settings.ts
COPY client/src/config/physicsConfig.ts client/src/config/physicsConfig.ts
USER node
WORKDIR /app/server
# PORT comes from the host (Render sets it); 2567 locally.
ENV PORT=2567
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD wget -qO- "http://127.0.0.1:${PORT}/health" >/dev/null || exit 1
# exec form: node is PID 1 and gets SIGTERM directly (graceful shutdown in src/index.ts).
CMD ["node", "--import", "tsx", "src/index.ts"]
