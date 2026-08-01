# Product Brief: BioComm Copilot
**UC-Focused Commercialization Intelligence System — PoC v1**
*HumanAngle Capstone | 8-Week Build*

---

## Post-Demo Status Update (2026-08-01)

Demo Day happened and the system below shipped as spec'd. Everything below this note is the original pre-build brief, kept as written for historical record — see PRD.md's own Post-Demo Status Update for the full delta. Short version: the agent roster grew from 7 to 8 (Patent Landscape Agent added, informational-only), citations are now checked against real tool/search results before acceptance, SEC EDGAR became a real structured tool (not just an aspirational MCP integration), a Deep Research Mode and a batch queue shipped, and two items this brief lists as "out of scope for PoC" (PDF export, user accounts) are no longer out of scope — PDF export shipped, and user accounts (Google OAuth) is the next confirmed goal after security hardening.

---

## Problem Statement

Biotech BD and licensing professionals spend 1–3 working days manually producing a first-pass commercialization assessment when evaluating a therapy asset. This work spans five research domains — clinical landscape, competitive intelligence, commercial opportunity, deal comparables, and regulatory pathway — each requiring manual searches across PubMed, ClinicalTrials.gov, SEC filings, FDA labels, company websites, and press releases. The output is compiled into a structured memo shared up the chain to heads of BD, CEOs, and advisors.

The problem is not that the work is impossible. It is slow, inconsistent, and non-scalable at the pace early-stage biotech teams operate.

---

## Success Metric

**Goal:** Reduce the time required to produce a first-pass commercialization assessment from approximately 1–3 working days to less than 30 minutes of automated processing plus analyst review time.

This is the benchmark the system is built against. Demo Day success means a live run completes within that window with output a real BD professional would trust as a starting point.

---

## Target User (PoC Scope)

**Primary:** BD/licensing analysts and managers at early-stage biotech companies evaluating UC therapy assets for in-licensing, partnership, or acquisition.

**Secondary:** CEOs and heads of BD at lean biotech teams who run this research themselves.

**PoC proxy user:** The builder — a working biotech commercialization and patent strategy analyst intern who validated this pain through direct experience.

---

## Positioning

**BioComm Copilot is not a report generator. It is a commercialization intelligence copilot.**

The user is not buying a document. They are buying faster, higher-quality decisions on assets that are worth tens to hundreds of millions of dollars. The system compresses days of research into a structured, source-cited assessment that a BD professional can trust, annotate, and act on — without replacing their judgment.

---

## Input Schema

| Field | Example |
|---|---|
| Target | IL-23 / p19 subunit |
| Modality | Monoclonal antibody |
| Stage | Phase 2 |
| Indication | Ulcerative colitis |
| Optional context | Company name, mechanism notes |

---

## Agent Architecture

### Orchestrator Agent *(top-level coordinator)*
Validates the user input, plans which agents need to run, sequences execution, retries failed tool calls, passes outputs to the Critic Agent, and triggers the Synthesis Agent. Makes the multi-agent coordination explicit and observable. Every agent invocation and handoff is traceable in Langfuse.

### Agent 1 — Clinical Research Agent
Researches active and completed trials, trial outcomes, mechanism of action, safety signals, and whether similar drugs have failed.
*Sources: ClinicalTrials.gov, PubMed, FDA labels, conference abstracts, company pipeline pages.*

### Agent 2 — Competitive Intelligence Agent
Maps approved therapies, late-stage pipeline, mechanism overlap, and positioning gaps in UC.
*Sources: ClinicalTrials.gov, company websites, SEC filings, press releases, FDA approvals.*

### Agent 3 — Commercial Opportunity Agent
Evaluates market size, patient population, unmet need, market crowding, and differentiation potential.
*Sources: Published literature, market reports, analyst coverage, FDA labels.*

### Agent 4 — Deal Comparables Agent
Identifies comparable licensing and acquisition deals by asset type, stage, deal structure, and disclosed financials.
*Sources: SEC 8-K/10-K, press releases, licensing announcements, biotech news.*
*When no clean comparable exists, the agent states this explicitly — it does not fabricate one.*

### Agent 5 — Regulatory Agent
Maps the regulatory pathway, endpoint precedent from approved UC therapies, FDA guidance, and likely development timeline.
*Sources: FDA guidance documents, approval letters, prior UC labels.*

### Agent 6 — Patent Landscape Agent *(added post-Demo Day)*
Finds patents relevant to the therapy asset — composition-of-matter, method-of-use, and formulation patents on the asset itself, plus blocking/competing patents held by others. Informational only: does not feed the Confidence Score.
*Sources: EPO Open Patent Services (structured), web search as fallback.*

### Agent 7 — Critic Agent
Reviews all agent outputs before synthesis. Flags: unsupported clinical claims, missing obvious competitors, assumptions presented as facts, deals without disclosed terms, outdated trial status, overconfident regulatory assertions. Output appears in the memo as a "Reviewer Notes" section — making explicit what the system does not know. *(Post-Demo Day: in Deep Research Mode, a flagged agent gets one more targeted pass and Critic re-reviews before Synthesis runs.)*

### Agent 8 — Synthesis Agent
Compiles all reviewed outputs into the structured memo. Adds confidence labels, as-of dates, and human review disclaimer.

---

## Output Structure

### Decision Summary *(top of memo — executive scan layer)*

| Field | Output |
|---|---|
| Commercial Opportunity | High / Medium / Low |
| Confidence Score | X.X / 10 |
| Key Risks Identified | N |
| Comparable Deals Found | N |
| Recommended Next Step | Continue diligence / Gather more data / Do not pursue |

### Full Memo
1. Therapy Profile
2. Clinical Landscape
3. Competitive Landscape
4. Commercial Opportunity
5. Deal Comparables
6. Regulatory Pathway
7. Patent Landscape *(added post-Demo Day; informational only, not in the Confidence Score)*
8. Key Risks
9. Preliminary Route Recommendations *(labeled as assumptions)*
10. Reviewer Notes *(from Critic Agent)*
11. Source Index *(all citations with access dates)*

---

## Trust & Credibility Standards

Every material claim carries:
- **Source** — specific URL, trial ID, filing reference, or paper citation
- **Date** — published or accessed date
- **Label** — one of: `Fact | Assumption | Inference | Unknown`

The system never:
- Invents a trial ID or cites a paper without a verifiable reference
- States remission/response rates without a source
- Omits major approved UC competitors
- Uses outdated trial status without flagging it
- Provides a valuation without labeling it assumption-based
- Makes regulatory claims with false certainty

---

## Technical Architecture

*Originally spec'd as a FastAPI (Python) backend behind a Next.js frontend. Migrated to a single full-stack TypeScript application (see ERD.md, issue #1) — the agents run as Next.js Server Actions/Route Handlers rather than a separate Python service. The agent roster, guardrails, and trust standards below are unchanged; only the implementation language and deployment topology changed.*

| Layer | Technology |
|---|---|
| Agents / LLM | Claude (claude-sonnet-5 — model naming changed since this table was first written) |
| Orchestration | Claude API multi-agent with tool use, run as Next.js Server Actions/Route Handlers |
| MCP Integrations | Anthropic's hosted `web_search` tool; thin custom tool clients (not MCP servers) for ClinicalTrials.gov, PubMed, SEC EDGAR, and EPO patent search — same "real API, no separate service" shape originally planned for SEC EDGAR, just applied uniformly instead of only to that one integration |
| Application | Next.js (TypeScript, App Router) — full-stack, no separate backend service |
| Database | PostgreSQL via Prisma (schema: ERD.md) |
| Observability | Langfuse — traces every agent call, tool use, retry, and output |
| Deployment | Azure Container Apps (`rg-students-platform`, shared HumanAngle cohort environment) — not Azure App Service as originally planned in this row; changed during the actual build |
| Structured Output | Typed schemas per agent (Zod), validated before synthesis, plus a citation source-provenance check (post-Demo Day) against real tool/search results from that run |

---

## PoC Scope

*Updated post-Demo Day — see the status note at the top of this document.*

**In scope:**
- UC indication only
- Public data sources only
- Decision Summary scorecard
- Structured memo as a rendered web page, plus PDF export *(shipped post-Demo Day — was originally listed as out of scope below)*
- Critic Agent review pass, with an optional Deep Research Mode second pass for flagged sections *(post-Demo Day)*
- Batch queue for submitting multiple assessments at once *(post-Demo Day)*
- Langfuse observability for all agent traces
- Deployed on Azure (Container Apps)

**Out of scope for PoC:**
- User accounts, saved history, team collaboration — *the near-term goal after security hardening now reverses this for user accounts specifically; see PRD.md's Post-Demo Status Update*
- Proprietary databases (Evaluate, GlobalData, Citeline)
- Real-time monitoring or alerts
- Other indications
- Automated PowerPoint export *(PDF shipped; PowerPoint did not)*

---

## Demo Day Success Criteria

A judge watching a live run — entering a real UC therapy profile — sees a Decision Summary appear within 30 minutes, followed by a full source-cited memo with visible agent activity and critic flags, all traceable in Langfuse. The demo succeeds when the judge concludes: *"I know what each agent did, I can see where every claim came from, and I can see where the system admitted it didn't know something."*

---

## Future Vision

UC → Crohn's → broader autoimmune → any therapeutic indication. Add proprietary data integrations, team collaboration, memo versioning, and a review workflow. Long-term: a therapeutic asset commercialization intelligence platform — not a UC-specific tool.
