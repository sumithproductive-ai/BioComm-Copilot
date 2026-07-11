# BioComm Copilot

UC-focused commercialization intelligence system — a first-pass BD assessment memo generator. See `PRD.md`, `PRODUCT_BRIEF.md`, `PERSONAS.md`, `USER_STORIES.md`, `AGENT_PLAN.md`, and `ERD.md` for the product and data model spec.

Stack: Next.js (App Router) + TypeScript + Postgres via Prisma. Full-stack TypeScript — the agents (`AGENT_PLAN.md` §4) run as Next.js Server Actions/Route Handlers, no separate backend service.

## Local development

Install a local Postgres (Homebrew):

```bash
brew install postgresql@16
brew services start postgresql@16
createdb biocomm_copilot
```

Copy `.env` and point `DATABASE_URL` at your local database, then:

```bash
npm install          # also runs `prisma generate` via postinstall
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Data model

`prisma/schema.prisma` is a direct translation of `ERD.md` — see that file for the rationale behind every table. Run `npx prisma studio` to browse the database.

## Deployment

Azure (per `PRD.md`) — Azure Database for PostgreSQL Flexible Server + Azure App Service. Not yet configured; requires `az login`.
