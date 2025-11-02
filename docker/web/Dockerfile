# syntax=docker/dockerfile:1.6

FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
# Install build dependencies for native modules like better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

FROM base AS builder
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Set a temporary database path for build
ENV DATABASE_PATH=/tmp/build.db
ENV DATABASE_URL=file:/tmp/build.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npx prisma db push --skip-generate
RUN npm run build && rm -f /tmp/build.db

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app

RUN groupadd -g 1001 nodejs && useradd -r -u 1001 -g nodejs nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/package.json ./package.json

# Copy Prisma client
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/prisma ./prisma

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
