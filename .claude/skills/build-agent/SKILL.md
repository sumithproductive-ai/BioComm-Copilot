---
name: build-agent
description: Scaffold one of BioComm Copilot's 8 backend agents (lib/agents/*.ts) consistently — system prompt, MCP tool bindings, forced structured output, single-attempt execution, real-API verification. Use when implementing the Orchestrator, any of the 5 research agents, Critic, or Synthesis.
---

# Build a BioComm Copilot agent

Each of the 8 agents in `AGENT_PLAN.md` §4 is a plain TypeScript function in
`lib/agents/` that calls the Anthropic Messages API directly — not a Claude
Code skill, not something that runs in this CLI. This skill is instructions
for *me*, so all 8 get built to the same standard instead of drifting.

## Before writing any agent code

1. Read the agent's spec in `AGENT_PLAN.md` §4.N — input, output schema,
   sources, guardrails, prompting approach. That section is the contract;
   don't invent behavior it doesn't call for.
2. Confirm the matching Zod schema already exists in `lib/agents/schemas.ts`.
   If the agent's output shape isn't there, stop — the schema is the
   source of truth and must be added/reviewed before the agent that
   produces it.
3. Check whether the agent needs `lib/config/uc-competitors.ts` (Competitive
   Intelligence and Critic both do).

## The pattern every agent follows

**File:** `lib/agents/<name>.ts` (e.g. `clinical-research.ts`), one file per
agent, no shared "research agent base class" — AGENT_PLAN.md §2 is explicit
that collapsing agents into shared abstractions is what causes the
guardrail-blur the Critic Agent exists to catch. Some duplication between
agents is correct here, not a smell.

**Structured output — forced tool use, not "please respond in JSON":**
Derive the tool's `input_schema` from the Zod schema with `z.toJSONSchema()`
(built into Zod v4, already installed), define a single `submit_findings`
tool with that schema, and force the final call with
`tool_choice: { type: "tool", name: "submit_findings" }`. Parse the tool call's
input through the Zod schema (`schema.parse(...)`) before returning — this is
belt-and-suspenders: the tool schema constrains what the model can emit, the
Zod `.parse()` catches anything that slips through (including the
`.refine()` guardrails like Deal Comparables' no-fabrication rule, which a
JSON Schema alone can't express).

**System prompt:** encode every guardrail from the agent's `AGENT_PLAN.md`
subsection as an explicit, direct instruction — not a paraphrase. E.g. Deal
Comparables' prompt should contain almost verbatim: *"If you cannot find a
deal with verifiable, disclosed source information, set noCompFound: true
and explain why. Do not estimate or infer a deal that was not publicly
reported."* Vague guardrail language is how fabrication guardrails fail in
practice.

**Tools:** wire the MCP connector for the sources named in the agent's
`AGENT_PLAN.md` subsection (Web Search, Web Fetch, ClinicalTrials.gov,
PubMed). No public MCP server → thin custom fetch-based tool instead (this
is the SEC EDGAR case). Follow the source-priority order the spec states
where it states one (Clinical: registry/PubMed before general web search,
to minimize hallucination risk).

**Retries are NOT the agent's job.** An agent module makes one attempt and
throws (or returns a typed failure) on an invalid/failed result. The
2-retry policy belongs to the Orchestrator (`AGENT_PLAN.md` §3) — building
retry logic into each agent individually duplicates that policy 5+ times
and risks them drifting out of sync.

**No direct Prisma access from inside an agent module.** An agent returns
validated, typed data; a separate persistence step (built once, shared by
all agents) maps that onto `schema.prisma` tables. Keeps agents testable in
isolation without a database.

## Lessons from Clinical Research Agent — apply these up front, don't rediscover them

Building the first agent took 4 real API runs to get right. All 4 failure
modes are generic to every agent built this way, not Clinical-specific —
build these in from the start instead of hitting them again per agent:

1. **The model will send a nested object field as a flattened string**
   (e.g. `mechanismOfAction` as a string instead of `{ summary, label,
   citations }`), even though the tool's JSON Schema says otherwise. Fix:
   put one concrete example of a correctly-shaped `submit_findings` call in
   the system prompt. A JSON Schema alone under-specifies nested shape
   compliance; a worked example fixes it reliably.
2. **The model omits top-level array fields it found nothing for**, rather
   than sending `[]` — confirmed this doesn't get fixed by explicit prompt
   instructions ("always include every field") or a worked example either.
   Fix at the parsing layer, not the prompt: backfill known-safe missing
   array fields to `[]` before `schema.parse()`. Only do this for fields
   where "omitted" and "explicitly empty" carry the same meaning (a missing
   list of findings) — never backfill a field where omission could hide a
   real gap (a missing `label`, a missing `citation`).
3. **`web_search` needs `allowed_callers: ["direct"]`.** Without it, the
   model can route the call through a code-execution path that requires
   `container_id` session management and fails with a 400 otherwise.
4. **Public APIs used as tools (ClinicalTrials.gov, PubMed, SEC EDGAR) need
   retry-with-backoff from the first version, not added after a failure.**
   Use the shared `lib/agents/tools/fetch-with-retry.ts` for every fetch in
   every tool wrapper — PubMed's E-utilities rate-limited the very first
   real run. Also normalize whatever date granularity the API actually
   returns (ClinicalTrials.gov gives month-only dates) against the schema's
   `z.iso.date()` expectation — confirm real field shapes against a live
   API response before writing the parser, don't guess from docs.

**Observability is not optional per-agent wiring — it's a parameter.**
Every agent function takes an optional `parentSpan?: LangfuseSpanClient`
(from `lib/agents/observability.ts`) as its second argument, wraps each
LLM call in `parentSpan?.generation({...})` / `.end({...})`, and each tool
execution in `parentSpan?.span({...})` / `.end({...})`. The Orchestrator
creates the actual trace and per-attempt span and passes it down — an
agent never creates its own root trace.

## Definition of done (AGENT_PLAN.md §8 — not a vibe check)

An agent isn't done until all four are true:
- Output validates against its Zod schema on every test input, including
  the no-data edge case (e.g. a target with zero published trials).
- Every claim in the output carries a `label`, and a `citation` where the
  schema requires one.
- **Verified with a real API call**, not just `tsc --noEmit`. Typechecking
  proves the code compiles; it proves nothing about whether the model
  actually returns real NCT IDs or actually refuses to fabricate a deal.
  Run it against a real, specific input (the Mirikizumab/IL-23p19 canary
  case from `AGENT_PLAN.md` §5.2 is the standing test case) and inspect
  the actual output.
- The next agent in the pipeline (usually Critic) can consume this agent's
  output without a special-case parser.

## Build order

Follow `AGENT_PLAN.md` §7, not cheapest-first: Orchestrator + Clinical
Research together and verified end-to-end before anything else; then
Competitive Intelligence, Commercial Opportunity, Regulatory; then Deal
Comparables (test its no-fabrication path early); then Critic last among
the six research/review agents (it needs all 5 schemas stable); then
Synthesis last of all.
