# ── Build ───────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY server/prisma server/prisma
COPY web/package.json web/
RUN npm ci
COPY . .
RUN npm run build -w server && npm run build -w web

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim
WORKDIR /app/server
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production SERVE_WEB=true PORT=4000
COPY --from=build /app/package.json /app/package-lock.json /app/
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/shared /app/shared
COPY --from=build /app/server/package.json /app/server/package.json
COPY --from=build /app/server/prisma /app/server/prisma
COPY --from=build /app/server/dist /app/server/dist
COPY --from=build /app/web/dist /app/web/dist
RUN mkdir -p /app/server/uploads && chown -R node:node /app/server/uploads
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Sync MongoDB indexes with the Prisma schema (data is never dropped), then start.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/index.js"]
