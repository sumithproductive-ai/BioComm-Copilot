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
