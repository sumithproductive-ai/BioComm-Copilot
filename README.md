# BioComm Copilot

UC-focused commercialization intelligence system — a first-pass BD assessment memo generator. See `PRD.md`, `PRODUCT_BRIEF.md`, `PERSONAS.md`, `USER_STORIES.md`, `AGENT_PLAN.md`, and `ERD.md` for the product and data model spec — each has a "Post-Demo Status Update" note near the top covering what's shipped since Demo Day and the current roadmap.

Stack: Next.js (App Router) + TypeScript + Postgres via Prisma. Full-stack TypeScript — the agents (`AGENT_PLAN.md` §4, built in `lib/agents/`) run as Next.js Server Actions, no separate backend service.

**Build status:** live and deployed. All 8 agents are built and wired end-to-end: Clinical Research, Competitive Intelligence, Commercial Opportunity, Regulatory, Deal Comparables, Patent Landscape *(informational only, live verification pending EPO credentials)*, Critic, and Synthesis. Since Demo Day: citation source-provenance checking (every citation is checked against a real tool/search result, not just schema-validated), SEC EDGAR as a real structured tool for Deal Comparables/Competitive Intelligence, an opt-in Deep Research Mode (Critic-flagged agents get a real second pass before Synthesis), and a batch queue (`/batch`) for submitting multiple assessments at once. Next up: security hardening, then Google OAuth (`next-auth`, whole-app gate, small allowlist).

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
- `EPO_OPS_CLIENT_ID` / `EPO_OPS_CLIENT_SECRET` — required only for the Patent Landscape Agent. Free registration at developers.epo.org. Without these, every other agent still works fine — only Patent Landscape fails.
- `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_SECRET_KEY` / `LANGFUSE_BASEURL` — optional, agents run fine without them, you just won't get traces. Note it's `LANGFUSE_BASEURL`, not the more intuitive `LANGFUSE_HOST` — get the name wrong and the SDK silently falls back to its default host instead of erroring, which looks identical to a bad key.

Then:

```bash
npm install          # also runs `prisma generate` via postinstall
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), submit a therapy profile (e.g. Target: `IL-23 / p19 subunit`, Modality: `Monoclonal antibody`, Stage: `Phase 2`, Indication: `Ulcerative colitis`), then click **Run Assessment** on the resulting page. A real run against live ClinicalTrials.gov/PubMed/SEC EDGAR/web_search data takes roughly 2–4 minutes (longer with Deep Research Mode). To queue several at once instead of one at a time, use `/batch`.

## Data model

`prisma/schema.prisma` is a direct translation of `ERD.md`, plus real additions since Demo Day noted in that file's own status update (the `Patent` table, `MemoRun.deepResearch`). Run `npx prisma studio` to browse the database.

## Deployment

Live on Azure Container Apps (`rg-students-platform`, shared HumanAngle cohort environment) — not Azure App Service as originally planned in `PRD.md`. Deploys automatically on every push to `main` via `.github/workflows/deploy.yml` (builds the image in ACR, updates the Container App). See that file's header comment for the required GitHub repo Variables/Secrets.
