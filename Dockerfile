# Capstone deployment image — Next.js standalone + Prisma migrate-on-start.
#
# Requires next.config.ts to include:  output: 'standalone'
# The entrypoint runs `prisma migrate deploy` BEFORE the server starts — the
# Day 4 rule ("always migrate before deploying new code") encoded in the image.
#
# Provided by the HumanAngle capstone platform template (2026-07-25) — do not
# diverge from this without a reason, since it's built for a specific
# constraint of the shared deploy environment: the container is the only
# thing that can reach the database (private VNET, no external access), so
# migrations have to run from inside the container at startup rather than as
# a separate step from a CI runner or a developer's machine. That's also why
# this copies the Prisma CLI into the runtime image (unlike a "minimal
# standalone" Dockerfile that would only ship the traced server output) —
# `prisma migrate deploy` needs it at container start, not just build time.
#
# Two fixes on top of the template as given, both confirmed via a real
# `docker compose up --build` run (2026-07-25), not assumed:
#
# 1. It originally ran `npm ci` right after copying only package*.json,
#    before prisma/schema.prisma existed in the build context — but this
#    project's package.json has `postinstall: "prisma generate"`, so `npm
#    ci` itself failed outright ("Could not find Prisma Schema"), never
#    even reaching the build. Fixed by moving prisma.config.ts + prisma/
#    ahead of `npm ci`.
#
# 2. The template's runtime stage cherry-picked node_modules/prisma,
#    node_modules/@prisma, and node_modules/.bin/prisma individually — but
#    the Prisma CLI's real dependency tree extends past that (confirmed by
#    fixing one missing-file error at a time and hitting another each time:
#    a symlink-relative wasm lookup broke first, then a missing transitive
#    dep — `@prisma/config` needs the `effect` package, which was never
#    copied). Cherry-picking node_modules subdirectories for something with
#    real transitive dependencies is inherently fragile. Fixed by copying
#    the build stage's full node_modules instead of hand-picking pieces —
#    this does give up some of `output: standalone`'s size benefit, but
#    correctness matters more than image size here, and the constraint
#    driving this whole file (only the container can reach the database, so
#    `prisma migrate deploy` has to run from inside it) already fights
#    against a minimal image to begin with.
FROM node:22-alpine AS build
WORKDIR /src
COPY package*.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate && npm run build

# ---- runtime stage ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0

# Next standalone output + static assets
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static
COPY --from=build /src/public ./public

# Prisma: schema + migrations + full node_modules (see fix #2 above) for
# `migrate deploy` at startup. prisma.config.ts (root-level, not inside
# prisma/) is what actually reads DATABASE_URL into datasource.url — without
# it, `migrate deploy` fails at runtime with "the datasource.url property is
# required" even though DATABASE_URL is correctly set in the environment,
# because the CLI has no config file telling it to read that var at all.
COPY --from=build /src/prisma ./prisma
COPY --from=build /src/prisma.config.ts ./prisma.config.ts
COPY --from=build /src/node_modules ./node_modules

EXPOSE 3000
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
