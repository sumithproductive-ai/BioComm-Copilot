# BioComm Copilot

UC-focused commercialization intelligence system — a first-pass BD assessment memo generator. See `PRD.md`, `PRODUCT_BRIEF.md`, `PERSONAS.md`, `USER_STORIES.md`, `AGENT_PLAN.md`, and `ERD.md` for the product and data model spec.

Stack: Next.js (App Router) + TypeScript + Postgres via Prisma. Full-stack TypeScript — the agents (`AGENT_PLAN.md` §4, built incrementally in `lib/agents/`) run as Next.js Server Actions, no separate backend service.

**Build status:** Orchestrator and Clinical Research Agent are built, wired into the live app, and observable in Langfuse. The other 5 agents (Competitive Intelligence, Commercial Opportunity, Deal Comparables, Regulatory, Critic, Synthesis) aren't built yet — see `.claude/skills/build-agent/SKILL.md` for the build order and pattern.

## Local development

Install a local Postgres (Homebrew):

```bash
brew install postgresql@16
brew services start postgresql@16
createdb biocomm_copilot
```

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` — already points at the local Postgres above by default
- `ANTHROPIC_API_KEY` — required to run any agent (the app itself loads without it, but submitting an assessment will fail)
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASEURL` — optional, agents run fine without them, you just won't get traces. Note it's `LANGFUSE_BASEURL`, not the more intuitive `LANGFUSE_HOST` — get the name wrong and the SDK silently falls back to its default host instead of erroring, which looks identical to a bad key.

Then:

```bash
npm install          # also runs `prisma generate` via postinstall
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), submit a therapy profile (e.g. Target: `IL-23 / p19 subunit`, Modality: `Monoclonal antibody`, Stage: `Phase 3`), then click **Run Clinical Research** on the resulting page. A real agent run against live ClinicalTrials.gov/PubMed data takes roughly 60–180 seconds.

## Data model

`prisma/schema.prisma` is a direct translation of `ERD.md` — see that file for the rationale behind every table. Run `npx prisma studio` to browse the database.

## Deployment

Azure (per `PRD.md`) — Azure Database for PostgreSQL Flexible Server + Azure App Service. Not yet configured; requires `az login`.
