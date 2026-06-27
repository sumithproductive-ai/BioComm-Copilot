# Product Brief: BioComm Copilot
**UC-Focused Commercialization Intelligence System — PoC v1**
*HumanAngle Capstone | 8-Week Build*

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

### Agent 6 — Critic Agent
Reviews all agent outputs before synthesis. Flags: unsupported clinical claims, missing obvious competitors, assumptions presented as facts, deals without disclosed terms, outdated trial status, overconfident regulatory assertions. Output appears in the memo as a "Reviewer Notes" section — making explicit what the system does not know.

### Agent 7 — Synthesis Agent
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
7. Key Risks
8. Preliminary Route Recommendations *(labeled as assumptions)*
9. Reviewer Notes *(from Critic Agent)*
10. Source Index *(all citations with access dates)*

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

| Layer | Technology |
|---|---|
| Agents / LLM | Claude (claude-sonnet-4-6 / claude-opus-4-8) |
| Orchestration | Claude API multi-agent with tool use |
| MCP Integrations | Web search, web fetch, ClinicalTrials.gov, PubMed, SEC EDGAR |
| Backend API | FastAPI |
| Frontend | Next.js |
| Observability | Langfuse — traces every agent call, tool use, retry, and output |
| Deployment | Azure |
| Structured Output | Typed schemas per agent, validated before synthesis |

---

## PoC Scope

**In scope:**
- UC indication only
- Public data sources only
- Single-threaded memo generation
- Decision Summary scorecard
- Structured memo as rendered web page with exportable format
- Critic Agent review pass
- Langfuse observability for all agent traces
- Deployed on Azure

**Out of scope for PoC:**
- User accounts, saved history, team collaboration
- Proprietary databases (Evaluate, GlobalData, Citeline)
- Real-time monitoring or alerts
- Other indications
- Automated PDF/PowerPoint export

---

## Demo Day Success Criteria

A judge watching a live run — entering a real UC therapy profile — sees a Decision Summary appear within 30 minutes, followed by a full source-cited memo with visible agent activity and critic flags, all traceable in Langfuse. The demo succeeds when the judge concludes: *"I know what each agent did, I can see where every claim came from, and I can see where the system admitted it didn't know something."*

---

## Future Vision

UC → Crohn's → broader autoimmune → any therapeutic indication. Add proprietary data integrations, team collaboration, memo versioning, and a review workflow. Long-term: a therapeutic asset commercialization intelligence platform — not a UC-specific tool.
