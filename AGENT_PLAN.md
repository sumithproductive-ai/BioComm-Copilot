# Agent Build Plan: BioComm Copilot

**Companion to PRODUCT_BRIEF.md, PRD.md, PERSONAS.md, USER_STORIES.md, ERD.md**
*Purpose: translate the product spec into a concrete, buildable multi-agent system. This is the plan an engineer starts building from.*

*Stack note: this document originally specified a FastAPI (Python) backend — Pydantic models, `asyncio.gather` dispatch — behind a Next.js frontend. The project migrated to a single full-stack TypeScript application (see ERD.md's "Scope decisions" and issue #1): agents run as Next.js Server Actions/Route Handlers, Pydantic → Zod, `asyncio.gather` → `Promise.allSettled`. The agent roster, execution model, schemas, and guardrails below are otherwise unchanged — only the implementation language changed.*

---

## 1. What this document answers

1. What agents are needed, and why each one exists as a separate agent instead of being folded into another.
2. What needs to be done, in what order, mapped to the 8-week timeline in PRD.md.
3. What each agent does — inputs, outputs, tools, prompting approach, and failure handling — specific enough to start writing code today.

It also resolves the four open questions PRD.md and USER_STORIES.md flagged as **blocking**, so the build doesn't stall waiting on product decisions.

---

## 2. Agent roster (8 agents, 3 tiers)

| Tier | Agent | Runs | Model tier | Depends on |
|---|---|---|---|---|
| Coordination | Orchestrator | Once, wraps whole run | Opus (planning/judgment) | Input form |
| Research (parallel) | Clinical Research | Parallel with other research agents | Sonnet (tool-heavy retrieval) | Orchestrator |
| Research (parallel) | Competitive Intelligence | Parallel | Sonnet | Orchestrator |
| Research (parallel) | Commercial Opportunity | Parallel | Sonnet | Orchestrator, reads Competitive output |
| Research (parallel) | Deal Comparables | Parallel | Sonnet | Orchestrator |
| Research (parallel) | Regulatory | Parallel | Sonnet | Orchestrator |
| Review | Critic | Once, after all 5 research agents complete | Opus (judgment-heavy) | All 5 research agents |
| Compilation | Synthesis | Once, after Critic | Sonnet (formatting/compilation) | All 5 research agents + Critic |

**Why 8 agents and not fewer:** each research agent hits a distinct set of sources and has a distinct failure mode (e.g., Deal Comparables must refuse to fabricate when no comp exists; Clinical must never state remission rates without a trial citation). Collapsing them into one "research agent" would mean one prompt trying to hold five different source strategies and five different guardrails at once — that's exactly the kind of blur that produces the fabrication/omission failures the Critic Agent exists to catch. Keeping them separate also means each one gets its own typed schema, its own Langfuse trace, and can be retried/re-run independently without re-running the whole memo.

**Why Critic and Synthesis are separate agents, not one:** Critic's job is adversarial — its only incentive is to find problems in the other five outputs. Synthesis's job is compositional — take validated inputs and produce a clean memo. Merging them risks the same model softening its own criticism while writing the final copy. PRD.md's "Reviewer Notes" section explicitly needs to show unfiltered Critic output, which only works cleanly if Critic runs as an independent pass before Synthesis ever touches the data.

---

## 3. Execution model

```
Input Form (target, modality, stage, indication, optional context)
        │
        ▼
  Orchestrator Agent  ── validates input, generates session_id, plans run
        │
        ├──────────────┬──────────────┬──────────────┬──────────────┐
        ▼              ▼              ▼              ▼              ▼
   Clinical       Competitive    Commercial      Deal Comp      Regulatory
   Research       Intelligence   Opportunity     Comparables    Agent
   Agent          Agent          Agent *         Agent
   (parallel)     (parallel)     (parallel)      (parallel)     (parallel)
        │              │              │              │              │
        └──────────────┴──────────────┴──────────────┴──────────────┘
                                    │
                                    ▼
                            Critic Agent
                     (reviews all 5 outputs together)
                                    │
                                    ▼
                          Synthesis Agent
                (compiles Decision Summary + full memo)
                                    │
                                    ▼
                         Rendered memo (Next.js)
```

\* Commercial Opportunity has a soft dependency on Competitive Intelligence's output (it needs the competitive landscape to assess crowding/differentiation — see Story 8's acceptance criteria: "market crowding assessment references the competitive landscape section — no contradictions"). Recommended handling: run all 5 in parallel as planned, but have Commercial Opportunity re-check its crowding claim against Competitive Intelligence's output as a fast validation step before returning — not a full sequential dependency, so the 30-minute budget survives.

**Why parallel research agents:** PRD.md's 30-minute budget doesn't survive 5 sequential agents each doing multi-source web/API research. Running them concurrently is the only way to hit the target, and it's also what makes the Langfuse trace genuinely show "multi-agent" behavior for Demo Day rather than a disguised sequential pipeline.

**Retry policy (Orchestrator's job per PRD.md P0):** each agent gets up to 2 retries on tool-call failure (timeout, rate limit, malformed response) before the Orchestrator marks that agent's output as `incomplete` and passes a partial/null section forward — it does not fail the whole run. The Critic Agent is responsible for flagging any section marked `incomplete` as a gap. This directly answers USER_STORIES.md's open question ("surface partial memo or fail the run?") — **recommendation: surface partial memo, never hard-fail**, because a partial source-cited memo is still more useful to a BD analyst than an error page, and "the system admitted it didn't know something" is literally the Demo Day success bar in PRODUCT_BRIEF.md.

---

## 4. Agent specifications

Each spec below is what one engineer needs to start implementing that agent's system prompt, tool bindings, and output schema.

### 4.1 Orchestrator Agent

**Role:** Top-level coordinator. Not a research agent — it never touches sources directly.

**Input:** `{ target, modality, stage, indication, context? }` from the input form (Story 1).

**Responsibilities:**
- Validate input server-side (all 4 required fields present, indication recognized as UC-related — reject/flag anything outside UC scope per PRD.md non-goals).
- Generate a `session_id` and open a Langfuse trace root — every downstream agent call is a child span of this trace (Story 14 requirement: "all traces for a single memo run linked by shared session ID").
- Dispatch the 5 research agents concurrently with the same input payload.
- Own retry logic (2 retries per agent, see §3).
- Collect all 5 outputs (or partials), validate each against its typed schema, and hand the full set to the Critic Agent.
- Trigger Synthesis Agent once Critic returns.
- Track total elapsed time from first dispatch to Synthesis completion (Story 13).

**Output:** Not a memo section — a run manifest: `{ session_id, agent_statuses: {agent_name: "complete"|"incomplete"|"failed"}, elapsed_ms, research_outputs[], critic_output, memo }`.

**Failure mode to guard against:** don't let one slow research agent (e.g., Deal Comparables searching SEC EDGAR) block the others — dispatch must be truly concurrent (`Promise.allSettled` or equivalent), not a loop that awaits sequentially.

---

### 4.2 Clinical Research Agent

**Sources:** ClinicalTrials.gov (MCP), PubMed (MCP), FDA labels, conference abstracts, company pipeline pages (web fetch/search).

**Input:** `{ target, modality, stage, indication, context? }`

**Output schema:**
```
{
  trials: [{ nct_id, title, phase, status, status_as_of_date, sponsor, enrollment, primary_endpoint, source_url }],
  mechanism_of_action: { summary, citations: [{ source_url, pubmed_id?, label }] },
  safety_signals: [{ description, source, label }],
  similar_drug_failures: [{ drug, reason_for_failure, source, label }],
  label: "Fact | Assumption | Inference | Unknown"  // applied per claim, not once per section
}
```

**Guardrails (from PRODUCT_BRIEF.md Trust Standards):**
- Every trial referenced must include a real NCT number — never invent one.
- Trial status must carry an access date; if the agent cannot confirm current status, it must set a `stale: true` flag rather than silently reporting old data as current (Story 4).
- No efficacy/safety numbers (remission rate, response rate) without a direct source.

**Prompting approach:** tool-use loop — search ClinicalTrials.gov first (structured, authoritative for trial status), then PubMed for mechanism/efficacy literature, then web search only as a fallback for company pipeline context not covered by the first two. This order matters: structured sources first minimizes hallucination risk before the model touches looser web text.

---

### 4.3 Competitive Intelligence Agent

**Sources:** ClinicalTrials.gov, company websites, SEC filings, press releases, FDA approvals.

**Input:** `{ target, modality, indication, mechanism_of_action (from Clinical Agent output if available, else infer) }`

**Output schema:**
```
{
  approved_competitors: [{ drug, company, mechanism, approval_date, source_url }],
  late_stage_pipeline: [{ drug, company, mechanism, phase, status, source_url }],
  positioning_gaps: [{ description, label }],
}
```

**Guardrail — this is the Critic Agent's primary check target (Story 5):** the output must include every currently FDA-approved UC therapy. See §5 below for the hardcoded reference list this agent (and the Critic) checks against.

---

### 4.4 Commercial Opportunity Agent

**Sources:** published literature, market reports, analyst coverage, FDA labels.

**Input:** `{ target, modality, indication, competitive_landscape_summary }` (light dependency described in §3)

**Output schema:**
```
{
  patient_population_estimate: { value, source, label: "Assumption" },  // never "Fact" unless directly sourced
  unmet_need: { summary, citations },
  market_crowding_assessment: { summary, consistent_with_competitive_landscape: bool },
  differentiation_potential: { summary, label: "Inference" }
}
```

**Guardrail (Story 8):** no market-size figure stated as fact without a credible published source; differentiation potential defaults to `Inference` unless directly sourced. The `consistent_with_competitive_landscape` boolean is what the Critic Agent checks to catch contradictions between this agent and Competitive Intelligence.

---

### 4.5 Deal Comparables Agent

**Sources:** SEC 8-K/10-K, press releases, licensing announcements, biotech news.

**Input:** `{ target, modality, stage, indication }`

**Output schema:**
```
{
  comparable_deals: [{ asset, company, stage_at_deal, deal_type: "license"|"acquisition", disclosed_terms: string|"not disclosed", comp_strength: "direct"|"approximate", source_url }],
  no_comp_found: bool,
  no_comp_explanation: string | null
}
```

**Guardrail — the single most important one for this agent (explicit in PRODUCT_BRIEF.md):** if `no_comp_found` is true, the agent must return a explanation, never a fabricated deal. This is a hard rule in the system prompt, not a soft preference: *"If you cannot find a deal with verifiable, disclosed source information, set no_comp_found: true and explain why. Do not estimate or infer a deal that was not publicly reported."*

---

### 4.6 Regulatory Agent

**Sources:** FDA guidance documents, approval letters, prior UC labels.

**Input:** `{ target, modality, stage, indication }`

**Output schema:**
```
{
  guidance_documents: [{ title, url, relevance }],
  endpoint_precedent: [{ endpoint, sourced_from_labels: [drug names], citations }],  // must cite ≥2 approved UC labels per Story 7
  prior_approvals_same_mechanism: [{ drug, approval_date, source }],
  development_timeline_estimate: { summary, label: "Assumption" }
}
```

**Guardrail:** `development_timeline_estimate` is always labeled `Assumption`, never `Fact` — regulatory timelines are inherently uncertain and PRODUCT_BRIEF.md explicitly bans "false certainty" on this section.

---

### 4.7 Critic Agent

**Role:** Reviews all 5 research outputs together, after they complete. Does not touch original sources — reasons only over the structured outputs it's given.

**Input:** all 5 research agent outputs + the hardcoded competitor reference list (§5).

**Checks it runs (from PRODUCT_BRIEF.md + Story 9):**
1. Unsupported clinical claims — any claim in Clinical output missing a citation.
2. Missing major competitors — diff `approved_competitors` against the hardcoded reference list.
3. Assumptions presented as facts — scan all sections for claims lacking a `label` field or mislabeled confidence.
4. Deals without disclosed terms not flagged as such by Deal Comparables Agent itself.
5. Outdated trial status — any trial in Clinical output without a `stale` check performed.
6. Overconfident regulatory assertions — any Regulatory claim not labeled `Assumption` where it should be.
7. Cross-section contradictions — e.g., Commercial Opportunity's `consistent_with_competitive_landscape: false`.

**Output schema:**
```
{
  flags: [{ type: "unsupported_claim"|"missing_competitor"|"assumption_as_fact"|"undisclosed_terms"|"stale_data"|"overconfident_regulatory"|"contradiction", section, description }],
  has_critical_flags: bool
}
```

**Hard rule:** flags are never filtered or softened before reaching Synthesis — Story 9 requires them to appear verbatim in Reviewer Notes. If `flags` is empty, output still includes the standard line: *"No critical flags identified — standard human review still required."*

---

### 4.8 Synthesis Agent

**Role:** Pure compilation — takes validated, Critic-reviewed inputs and produces the final memo. Should not introduce new claims or research.

**Input:** all 5 research outputs + Critic output + session metadata (elapsed time, as-of date).

**Responsibilities:**
- Compute the Decision Summary (see §6 for the Confidence Score formula).
- Assemble the 10 memo sections in the fixed order from PRODUCT_BRIEF.md.
- Insert the human-review-required disclaimer prominently.
- Stamp as-of dates on every section.
- Render Reviewer Notes verbatim from Critic output — no rewriting.

**Output:** the full memo object consumed directly by the memo page UI (Story 11) — this is the contract boundary between the agent layer and the UI, so its schema should be finalized before UI work starts (matches PRD.md Week 6/7 dependency note).

---

## 5. Resolving the open questions (so the build doesn't stall)

PRD.md and USER_STORIES.md flagged four items as blocking. Recommendations below so agent-building can start now; revisit after Demo Day if reality disagrees.

**1. Confidence Score (X.X/10) — rule-based, not LLM-generated.**
Recommendation: a transparent weighted formula computed by the Synthesis Agent (in code, not by prompting the LLM to "pick a number"), e.g.:
`confidence = (clinical_data_completeness * 0.25) + (competitive_coverage_completeness * 0.20) + (commercial_source_quality * 0.20) + (regulatory_precedent_strength * 0.20) + (inverse_critic_flag_severity * 0.15)`
Each sub-score is itself a simple rule (e.g., clinical_data_completeness = fraction of trials with confirmed current status; inverse_critic_flag_severity drops sharply if `has_critical_flags` is true). This is deliberately boring and explainable — PRODUCT_BRIEF.md's whole value proposition is trust, and a black-box LLM-generated confidence number undermines that. Document the exact formula in the memo's methodology footnote so a BD professional can sanity-check it.

**2. Hardcoded "major UC competitor" reference list — start with this list, owned by Product, revisited quarterly:**
Vedolizumab (Entyvio), Ustekinumab (Stelara), Infliximab (Remicade + biosimilars), Adalimumab (Humira + biosimilars), Golimumab (Simponi), Tofacitinib (Xeljanz), Upadacitinib (Rinvoq), Ozanimod (Zeposia), Etrasimod (Velsipity), Risankizumab (Skyrizi), Mirikizumab (Omvoh) — the last one is IL-23p19-targeted and directly relevant to the example input schema in PRODUCT_BRIEF.md, so it's a good canary case for testing the Critic Agent's competitor-completeness check. Store this as a versioned config file (not buried in a prompt) so it's easy to update as new UC approvals happen.

**3. Behavior when a target has no published trials at all — surface an "insufficient data" state, don't fail the run.**
Clinical Research Agent returns an explicit `trials: []` with a note; Critic Agent flags this as a gap rather than an error; Synthesis Agent still produces a memo but the Decision Summary's Recommended Next Step defaults toward "Gather more data" when core sections are empty. Consistent with the partial-memo-over-hard-fail principle in §3.

**4. Rate limit behavior for ClinicalTrials.gov/PubMed under concurrent agent load — build the retry/backoff assumption in from day one.**
Since Clinical Research and Competitive Intelligence both hit ClinicalTrials.gov concurrently, put a shared rate-limiter/queue in front of that MCP tool binding (not per-agent) so two agents don't independently double the request rate. Test this explicitly in Week 2 per PRD.md's own dependency note — don't discover it in Week 5 when all 5 agents are running together for the first time.

---

## 6. Shared infrastructure to build before any agent logic

1. **Typed schema contracts** for all 5 research agent outputs + Critic + Synthesis (Zod schemas in the Next.js app, backed by the Prisma models in `ERD.md`) — must be finalized before Critic Agent is built, since Critic reasons over these structures directly (PRD.md dependency note, Week 6).
2. **Langfuse wiring** — session_id generated at Orchestrator, passed to every child agent call and every tool call as a nested span. Build this in Week 1–2 alongside the Next.js skeleton, not bolted on later — retrofitting tracing is much more painful than building it in from the first agent call.
3. **MCP tool bindings** — Web Search, Web Fetch, ClinicalTrials.gov, PubMed, SEC EDGAR. Validate ClinicalTrials.gov and SEC EDGAR specifically before building any research agent that depends on them (PRD.md explicit Week 2 dependency).
4. **Shared "label" taxonomy** (`Fact | Assumption | Inference | Unknown`) — implement as a single shared enum/type used by every agent's output schema, not reinvented per agent.

---

## 7. Build sequence (maps to PRD.md's 8-week phasing, made agent-specific)

| Week | Build |
|---|---|
| 1–2 | Next.js + Prisma/Postgres skeleton, Langfuse wiring, MCP tool bindings validated (ClinicalTrials.gov + SEC EDGAR first), shared schema/label taxonomy defined |
| 3–4 | Orchestrator Agent (dispatch + retry + Langfuse tracing) built and tested against a single agent first: Clinical Research Agent, end-to-end including its guardrails |
| 5 | Competitive Intelligence, Commercial Opportunity, Regulatory Agents — build against the finalized schemas from Week 1–2; wire Commercial's soft dependency on Competitive |
| 6 | Deal Comparables Agent (with its no-fabrication guardrail as the first thing to test), then Critic Agent once all 5 research schemas are stable |
| 7 | Synthesis Agent, Confidence Score formula (§6.1), Decision Summary, full memo render, UI polish (Stories 2, 12, 13) |
| 8 | Azure deployment, full Langfuse trace verification against Story 14's acceptance criteria, Demo Day rehearsal with the Mirikizumab/IL-23p19 canary case from §5 |

---

## 8. Definition of done (per agent, before moving to the next)

An agent is "done" when:
- Its output validates against its typed schema on every test input, including the no-data edge case.
- Every claim in its output carries a `label` and, where not `Unknown`, a source.
- Its Langfuse trace shows tool calls as child spans with retry counts visible.
- The Critic Agent can successfully consume its output and produce flags without needing a special-case parser.

This is the practical test for "can I move on" — not a vibe check, an actual pass/fail per test input.
