# Product Requirements Document: BioComm Copilot
**UC-Focused Commercialization Intelligence System — PoC v1**
*HumanAngle Capstone | Version 1.0 | June 2026*

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

1. **Other indications (v1):** The system will not support Crohn's disease, rheumatoid arthritis, or any indication outside ulcerative colitis. Expanding to other indications requires validating the UC workflow first.
2. **Proprietary databases:** No integration with paid platforms such as Evaluate Pharma, GlobalData, Citeline, or BioPharma PEG. PoC relies entirely on public data sources.
3. **Final decision-making:** The system does not recommend whether to pursue a deal. It produces a structured starting point for human judgment — not a replacement for it.
4. **User accounts and collaboration:** No authentication, saved history, team workspaces, or memo versioning in v1. Single-session, single-user workflow only.
5. **Automated export:** No PDF or PowerPoint generation. The memo is delivered as a rendered web page in v1.

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

### Must-Have — P0

**Input Form**
- [ ] User can submit a therapy profile with four required fields: target, modality, stage, indication
- [ ] System validates input before initiating agent workflow
- [ ] Optional free-text context field (company name, mechanism notes) accepted

**Orchestrator Agent**
- [ ] Orchestrator validates input, plans agent execution sequence, and coordinates all downstream agents
- [ ] Orchestrator retries failed tool calls before propagating errors
- [ ] Orchestrator passes structured outputs to Critic Agent before triggering Synthesis Agent
- [ ] All orchestrator actions are traced in Langfuse

**Research Agents (Clinical, Competitive, Commercial, Deal Comparables, Regulatory)**
- [ ] Each agent runs independently and returns a typed, validated output schema
- [ ] Each agent cites specific sources with URLs, trial IDs, filing references, or paper citations
- [ ] Each agent includes access dates for all retrieved information
- [ ] Each claim is labeled: `Fact | Assumption | Inference | Unknown`
- [ ] Deal Comparables Agent explicitly states when no clean comparable is found — never fabricates
- [ ] Clinical Research Agent includes ClinicalTrials.gov trial IDs for all referenced trials

**Critic Agent**
- [ ] Reviews all research agent outputs before synthesis
- [ ] Flags: unsupported clinical claims, missing major UC competitors, assumptions presented as facts, deals with no disclosed terms, outdated trial status, overconfident regulatory assertions
- [ ] Produces a structured flag list that appears verbatim in the memo's Reviewer Notes section

**Synthesis Agent**
- [ ] Compiles all validated outputs into the full memo structure
- [ ] Inserts human review required disclaimer prominently
- [ ] Adds as-of date to all sections

**Decision Summary**
- [ ] Commercial Opportunity rating: High / Medium / Low
- [ ] Confidence Score: X.X / 10
- [ ] Key Risks count
- [ ] Comparable Deals Found count
- [ ] Recommended Next Step: Continue diligence / Gather more data / Do not pursue

**Full Memo Output**
- [ ] Sections: Therapy Profile, Clinical Landscape, Competitive Landscape, Commercial Opportunity, Deal Comparables, Regulatory Pathway, Key Risks, Preliminary Route Recommendations, Reviewer Notes, Source Index
- [ ] All recommendations labeled as assumptions
- [ ] Source Index lists every citation with access date

**Observability**
- [ ] Every agent call, tool use, retry, and output traced in Langfuse
- [ ] Traces linked by session so a complete run is inspectable end-to-end

**Deployment**
- [ ] Application deployed and accessible on Azure
- [ ] Full-stack Next.js application (TypeScript) — Server Actions/Route Handlers run the agents directly, no separate backend service
- [ ] Postgres database (Azure Database for PostgreSQL) accessed via Prisma

### Nice-to-Have — P1

- [ ] Progress indicator showing which agent is currently running during memo generation
- [ ] Collapsible memo sections in the UI for easier navigation
- [ ] Copy-to-clipboard button for individual memo sections
- [ ] Display of total run time on completion
- [ ] Source Index rendered as clickable hyperlinks

### Future Considerations — P2

- Support for additional indications (Crohn's, RA, other autoimmune)
- User authentication and saved memo history
- Team collaboration and memo annotation
- Proprietary database integrations (Evaluate Pharma, GlobalData)
- Automated PDF/PowerPoint export
- Comparative mode: evaluate two assets side-by-side
- Alert system for trial status changes on tracked assets

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
