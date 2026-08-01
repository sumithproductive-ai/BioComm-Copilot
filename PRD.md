# Product Requirements Document: BioComm Copilot
**UC-Focused Commercialization Intelligence System — PoC v1**
*HumanAngle Capstone | Version 1.0 | June 2026*

---

## Post-Demo Status Update (2026-08-01)

Demo Day happened; the original 5-week/8-agent plan below shipped as spec'd. Everything in this section is a delta from what follows — the original problem statement, goals, and requirements are still accurate for what was built and are kept as the historical record.

**Shipped since Demo Day:**
- **Citation source-provenance checking** — every citation across all research agents is now checked against real tool/web_search results from that run before being accepted, not just schema-validated (closes a real hallucination gap: a well-formed but fabricated URL used to pass cleanly).
- **Patent Landscape Agent** — a 6th research agent (EPO Open Patent Services), covering competitor patent exposure. Kept informational-only, deliberately not part of the Confidence Score formula (§5.1 below) so past/future scores stay comparable. *(Code-complete; live verification pending EPO credentials at time of writing.)*
- **SEC EDGAR full-text search** — a real structured tool (no API key needed) giving Deal Comparables and Competitive Intelligence primary-source citations (the actual 8-K/10-K filing) instead of only secondary news coverage.
- **Deep Research Mode** — opt-in: after the first Critic pass, any research agent Critic actually flagged gets a second, targeted research round before Critic re-reviews and Synthesis runs. Off by default.
- **Batch queue** — submit several therapy profiles at once (`/batch`); they run automatically in the background through a shared, concurrency-limited queue instead of one at a time by hand.
- **PDF export** — contradicts the original Non-Goal #5 and PRODUCT_BRIEF.md's "out of scope" list below; shipped anyway once the memo UI stabilized. Those non-goals are superseded.

**New goals, in confirmed order, not yet started:**
1. **Security hardening** — rate limiting on `runAssessment`/`deleteAssessment`, bearer-token auth on the MCP endpoint, `z.url()` → `z.httpUrl()` on citation schemas, per-request session checks once auth exists.
2. **Google OAuth** — this directly reverses original Non-Goal #4 ("no user accounts... in v1"). Driven by access control, not attribution: the system now handles competitor analysis and patent value, so the whole app gets gated to a small allowlist of real logins, not a shared passcode. `next-auth` + JWT sessions, whole-app gate via `proxy.ts`, `/login` page.

Everything below this section is the original, pre-Demo-Day spec and is intentionally left as written.

---

## Problem Statement

Biotech BD and licensing professionals at early-stage companies spend 1–3 working days manually assembling a first-pass commercialization assessment for a single therapy asset — searching PubMed, ClinicalTrials.gov, SEC filings, FDA labels, company websites, and press releases across five distinct research domains before compiling the output into a structured memo. This pace is unsustainable for lean BD teams evaluating multiple assets simultaneously, leads to inconsistent memo quality and depth, and delays decisions on assets that can be worth tens to hundreds of millions of dollars. Without a faster, more consistent process, teams either slow down evaluation cycles or sacrifice rigor — both of which put them at a competitive disadvantage in deal-making.

---

## Goals

1. **Speed:** Reduce first-pass commercialization assessment time from 1–3 working days to less than 30 minutes of automated processing plus analyst review.
2. **Trust:** Produce output that a real BD professional would keep reading — every material claim sourced, dated, and labeled as fact, assumption, inference, or unknown.
3. **Coverage:** Ensure no major approved UC competitor is missing from the competitive landscape output in any generated memo.
4. **Transparency:** Surface what the system does not know through a Critic Agent that flags unsupported claims, missing data, and assumption-as-fact errors before the memo is delivered.
5. **Demo Day:** Deliver a live, deployed prototype that clearly demonstrates a true multi-agent agentic workflow with observable Langfuse traces to HumanAngle mentors, Sidley professionals, and industry judges.

---

## Non-Goals

*Items 4 and 5 were true for the original v1/Demo Day scope below but are superseded post-Demo Day — see the Post-Demo Status Update at the top of this document.*

1. **Other indications (v1):** The system will not support Crohn's disease, rheumatoid arthritis, or any indication outside ulcerative colitis. Expanding to other indications requires validating the UC workflow first. *(Still true.)*
2. **Proprietary databases:** No integration with paid platforms such as Evaluate Pharma, GlobalData, Citeline, or BioPharma PEG. PoC relies entirely on public data sources. *(Still true.)*
3. **Final decision-making:** The system does not recommend whether to pursue a deal. It produces a structured starting point for human judgment — not a replacement for it. *(Still true.)*
4. ~~**User accounts and collaboration:** No authentication, saved history, team workspaces, or memo versioning in v1. Single-session, single-user workflow only.~~ **Superseded**: Google OAuth + a small allowlist is now a confirmed near-term goal, driven by access control given the sensitivity of competitor/patent data — not the original scope.
5. ~~**Automated export:** No PDF or PowerPoint generation. The memo is delivered as a rendered web page in v1.~~ **Superseded**: PDF export shipped post-Demo Day.

---

## User Stories

### BD Analyst

- As a BD analyst, I want to enter a therapy's target, modality, stage, and indication so that I can initiate a full commercialization assessment without manually configuring each research domain.
- As a BD analyst, I want a Decision Summary at the top of every memo so that I can quickly determine whether an asset warrants further diligence before reading the full report.
- As a BD analyst, I want every clinical claim in the memo to include a trial ID, PubMed reference, or FDA label citation so that I can verify the information without repeating the search myself.
- As a BD analyst, I want assumptions and inferences clearly labeled as such so that I do not mistake the system's interpretation for confirmed fact.
- As a BD analyst, I want the Critic Agent's flags visible in a dedicated section so that I know exactly what gaps remain before I use the memo externally.
- As a BD analyst, I want the memo to include an as-of date for all data so that I know whether I need to refresh any section before presenting it.

### Head of BD / CEO

- As a head of BD, I want a structured Decision Summary with a commercial opportunity rating, confidence score, key risks count, and recommended next step so that I can assess an asset in under 60 seconds.
- As a CEO, I want the system to clearly state when no clean deal comparable was found so that I am not misled by fabricated or non-comparable transactions.
- As a head of BD, I want the full memo to follow the standard BD memo structure — clinical, competitive, commercial, deals, regulatory, risks, recommendations — so that it integrates directly into our existing review process.

### Demo Day Judge

- As a Demo Day judge, I want to observe live agent execution with visible tool calls and handoffs so that I can evaluate the depth of the multi-agent architecture.
- As a Demo Day judge, I want to view Langfuse traces for each agent run so that I can verify observability is implemented throughout the system.

---

## Requirements

*Checkboxes below reflect actual shipped status as of the Post-Demo Status Update above, not the original June 2026 draft.*

### Must-Have — P0

**Input Form**
- [x] User can submit a therapy profile with four required fields: target, modality, stage, indication
- [x] System validates input before initiating agent workflow
- [x] Optional free-text context field (company name, mechanism notes) accepted

**Orchestrator Agent**
- [x] Orchestrator validates input, plans agent execution sequence, and coordinates all downstream agents
- [x] Orchestrator retries failed tool calls before propagating errors
- [x] Orchestrator passes structured outputs to Critic Agent before triggering Synthesis Agent
- [x] All orchestrator actions are traced in Langfuse

**Research Agents (Clinical, Competitive, Commercial, Deal Comparables, Regulatory — plus Patent Landscape, added post-Demo Day)**
- [x] Each agent runs independently and returns a typed, validated output schema
- [x] Each agent cites specific sources with URLs, trial IDs, filing references, or paper citations — now checked against real tool/search results this run, not just schema-validated (post-Demo Day)
- [x] Each agent includes access dates for all retrieved information
- [x] Each claim is labeled: `Fact | Assumption | Inference | Unknown`
- [x] Deal Comparables Agent explicitly states when no clean comparable is found — never fabricates
- [x] Clinical Research Agent includes ClinicalTrials.gov trial IDs for all referenced trials

**Critic Agent**
- [x] Reviews all research agent outputs before synthesis
- [x] Flags: unsupported clinical claims, missing major UC competitors, assumptions presented as facts, deals with no disclosed terms, outdated trial status, overconfident regulatory assertions
- [x] Produces a structured flag list that appears verbatim in the memo's Reviewer Notes section
- [x] *(Post-Demo Day)* Deep Research Mode: flagged agents can get a real second pass and Critic re-reviews before Synthesis, opt-in

**Synthesis Agent**
- [x] Compiles all validated outputs into the full memo structure
- [x] Inserts human review required disclaimer prominently
- [x] Adds as-of date to all sections

**Decision Summary**
- [x] Commercial Opportunity rating: High / Medium / Low
- [x] Confidence Score: X.X / 10
- [x] Key Risks count
- [x] Comparable Deals Found count
- [x] Recommended Next Step: Continue diligence / Gather more data / Do not pursue

**Full Memo Output**
- [x] Sections: Therapy Profile, Clinical Landscape, Competitive Landscape, Commercial Opportunity, Deal Comparables, Regulatory Pathway, Key Risks, Preliminary Route Recommendations, Reviewer Notes, Source Index — plus Patent Landscape (post-Demo Day)
- [x] All recommendations labeled as assumptions
- [x] Source Index lists every citation with access date

**Observability**
- [x] Every agent call, tool use, retry, and output traced in Langfuse
- [x] Traces linked by session so a complete run is inspectable end-to-end

**Deployment**
- [x] Application deployed and accessible — Azure Container Apps (`ca-<student>`, `rg-students-platform`), not Azure App Service as originally spec'd; changed during the actual build, see AGENT_PLAN.md's stack note
- [x] Full-stack Next.js application (TypeScript) — Server Actions/Route Handlers run the agents directly, no separate backend service
- [x] Postgres database accessed via Prisma

### Nice-to-Have — P1

- [x] Progress indicator showing which agent is currently running during memo generation
- [x] Collapsible memo sections in the UI for easier navigation
- [ ] Copy-to-clipboard button for individual memo sections
- [x] Display of total run time on completion
- [x] Source Index rendered as clickable hyperlinks

### Future Considerations — P2

*Post-Demo Status Update above supersedes this list where noted.*

- Support for additional indications (Crohn's, RA, other autoimmune) — still not started
- ~~User authentication and saved memo history~~ — **now a confirmed near-term goal**, driven by access control (competitor/patent data sensitivity), not the original "nice to have" framing. See Post-Demo Status Update.
- Team collaboration and memo annotation — still not started
- Proprietary database integrations (Evaluate Pharma, GlobalData) — still not started
- ~~Automated PDF/PowerPoint export~~ — **PDF export shipped.** PowerPoint still not started.
- Comparative mode: evaluate two assets side-by-side — **shipped** (`/compare`)
- Alert system for trial status changes on tracked assets — still not started
- *(New, not in original scope)* Scheduling/batch processing — **shipped** as the batch queue (`/batch`)
- *(New, not in original scope)* Deep research / higher-accuracy mode — **shipped** as Deep Research Mode
- *(New, not in original scope)* Additional primary-source data integrations for accuracy — **shipped**: SEC EDGAR, EPO patent search

---

## Success Metrics

### Leading Indicators (Demo Day / PoC validation)

| Metric | Target |
|---|---|
| End-to-end memo generation time | < 30 minutes |
| Source citation rate | 100% of material claims cited |
| Critic Agent flag accuracy | Flags are accurate and relevant (qualitative, judge-reviewed) |
| Major UC competitor coverage | All approved UC therapies present in competitive landscape |
| Langfuse trace completeness | 100% of agent calls visible in traces |
| Live demo completion rate | Completes without error on Demo Day |

### Lagging Indicators (post-capstone, if taken to market)

| Metric | Target |
|---|---|
| Time-to-first-memo for new users | < 5 minutes from input to output |
| Analyst trust rate | BD professional rates memo as "would use as starting point" > 80% of sessions |
| Return usage | User generates > 1 memo per session within first month of market use |

---

## MCP Integrations

| Integration | Purpose |
|---|---|
| Web Search | Broad competitive and commercial research |
| Web Fetch | Retrieve specific pages: company pipelines, press releases, SEC filings |
| ClinicalTrials.gov | Trial IDs, status, endpoints, enrollment |
| PubMed | Peer-reviewed clinical evidence, mechanism studies |
| SEC EDGAR | 8-K/10-K filings for deal comparables |

---

## Open Questions

| Question | Owner | Blocking? |
|---|---|---|
| What is the rate limit behavior for ClinicalTrials.gov and PubMed APIs under concurrent agent requests? | Engineering | Yes — affects agent architecture and retry logic |
| How should the Confidence Score (X.X / 10) be calculated? Rule-based formula or LLM-generated? | Engineering + Product | Yes — needed before Synthesis Agent is built |
| How should the system handle a therapy target with no published trials at all? Does the memo still generate or does the system surface a "insufficient data" state? | Engineering | Yes |
| What constitutes a "major" UC competitor for Critic Agent completeness checks? Should this be a hardcoded list or dynamically assessed? | Product | Yes |
| Should Langfuse traces be visible to the end user in the UI, or only accessible via the Langfuse dashboard? | Engineering | No |
| What export format is most useful for Demo Day judges — web render only, or a simple shareable link? | Product | No |

---

## Timeline Considerations

**Hard deadline:** HumanAngle Demo Day — end of 8-week capstone program.

**Suggested phasing:**

| Week | Focus |
|---|---|
| 1–2 | Architecture finalized, repo scaffolded, Next.js + Prisma/Postgres skeleton, Langfuse connected |
| 3–4 | Orchestrator Agent + Clinical Research Agent built and tested end-to-end |
| 5 | Competitive Intelligence, Commercial Opportunity, and Regulatory Agents |
| 6 | Deal Comparables Agent + Critic Agent |
| 7 | Synthesis Agent, Decision Summary, full memo output, UI polish |
| 8 | Azure deployment, Langfuse trace verification, Demo Day rehearsal |

**Dependencies:**
- MCP integrations for ClinicalTrials.gov and SEC EDGAR must be validated before research agents are built (Week 2)
- Critic Agent design depends on finalized output schemas from all research agents (Week 6)
- Deployment to Azure should be tested no later than Week 7 to leave buffer before Demo Day

---

*This document is a living spec. All P2 items and open questions should be revisited after Demo Day if the project moves toward a market-ready product.*
