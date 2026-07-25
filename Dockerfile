# syntax=docker/dockerfile:1
#
# Multi-stage build for BioComm Copilot (Next.js App Router, standalone
# output — see next.config.ts). Node 22 chosen to match local dev
# (confirmed via `node --version` on the dev machine; no .nvmrc/.node-version
# or package.json#engines pinned one otherwise).
#
# Prisma note: this project uses @prisma/adapter-pg (driver adapters) — see
# lib/db.ts — so Prisma talks to Postgres through the plain-JS `pg` package,
# not a native query-engine binary. That means the classic Docker/Prisma
# "wrong binaryTarget" gotcha does not apply here; alpine is safe to use.

# ---------------------------------------------------------------------------
# deps — install dependencies only, cached separately from source changes.
# Needs prisma.config.ts + prisma/ present before `npm ci` so its
# `postinstall: "prisma generate"` script can find the schema.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci

# ---------------------------------------------------------------------------
# builder — full source + production build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# `prisma generate` only introspects prisma/schema.prisma — it never
# connects to a real database — so this placeholder just satisfies
# prisma.config.ts's `datasource.url` read at build time. The real
# DATABASE_URL is supplied to the runner container at deploy time, never
# baked into the image.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npx prisma generate
RUN npm run build

# ---------------------------------------------------------------------------
# runner — minimal production image: just the traced standalone output,
# not the full node_modules tree or source.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
EXPOSE 3000

CMD ["node", "server.js"]
