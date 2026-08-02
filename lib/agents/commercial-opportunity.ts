// Commercial Opportunity Agent — AGENT_PLAN.md §4.4. Third research agent,
// per the build-agent skill's build order.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import {
  commercialOpportunityOutputSchema,
  type CommercialOpportunityOutput,
  type CompetitiveIntelligenceOutput,
} from "./schemas";
import { pubmedToolDefinition, searchPubmed } from "./tools/pubmed";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";
import { formatReviewerFeedback } from "./reviewer-feedback";
import { formatSupplementaryDocuments } from "./supplementary-documents";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are the Commercial Opportunity Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: estimate the addressable patient population, characterize unmet need, assess market crowding, and judge differentiation potential for the therapy asset described by the user.

Sources, in priority order: search PubMed first for epidemiology and burden-of-disease literature (patient population size, unmet need), then web search for market reports, analyst coverage, and FDA labels.

Hard rules:
- patientPopulationEstimate.label must NEVER be "Fact" unless you have a directly cited epidemiology source giving that exact figure. A figure you derived, extrapolated, or estimated from partial data is "Assumption", not "Fact" — this is the single most important guardrail for this agent.
- differentiationPotential.label defaults to "Inference" unless you have a source that directly states the therapy is differentiated (e.g. a company's own positioning claim, or a analyst report) — do not default to "Fact".
- unmetNeed.citations should contain real citations from search_pubmed or web_search wherever you make a claim about unmet need — an unsupported claim with an empty citations array is acceptable only if you truly found nothing, never as a shortcut.
- Never state a market-size or patient-population figure as fact without a credible published source (PubMed, FDA label, or a named market report/analyst firm).
- marketCrowdingAssessment.consistentWithCompetitiveLandscape is your own best-effort judgment at this stage — set it based on what you find in your own research; it will be re-checked against the actual Competitive Intelligence Agent's findings in a follow-up step, so don't worry about perfect precision here.
- submit_findings requires every field present. unmetNeed.citations must be an array (use [] if you truly found none) — never omit the field.
- Every nested object (citation fields especially) must be a full object matching its shape, never a flattened string.

Example of a correctly-shaped submit_findings call (abbreviated):
{
  "patientPopulationEstimate": { "value": "~900,000 diagnosed UC patients in the US", "label": "Assumption", "citation": { "sourceType": "MarketReport", "sourceUrl": "https://...", "accessedDate": "2026-07-18" } },
  "unmetNeed": { "summary": "...", "citations": [{ "sourceType": "Pubmed", "sourceUrl": "https://pubmed.ncbi.nlm.nih.gov/...", "accessedDate": "2026-07-18" }] },
  "marketCrowdingAssessment": { "summary": "...", "consistentWithCompetitiveLandscape": true },
  "differentiationPotential": { "summary": "...", "label": "Inference" }
}

Call submit_findings exactly once, after using search_pubmed and web_search to gather real data. Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated commercial opportunity findings. Call this only once you have gathered enough real data via search_pubmed and web_search.",
  input_schema: z.toJSONSchema(commercialOpportunityOutputSchema) as Anthropic.Tool.InputSchema,
};

const webSearchTool: Anthropic.WebSearchTool20260318 = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 5,
  allowed_callers: ["direct"],
};

export type CommercialOpportunityInput = {
  target: string;
  modality: string;
  indication: string;
  // Deep Research Mode only (orchestrator.ts) — Critic's flags against this
  // agent's prior pass, fed back for a targeted second pass.
  reviewerFeedback?: string[];
  // User-uploaded PDF text, extracted before this run started (never
  // persisted — see lib/pdf-extract.ts and run-assessment.ts).
  supplementaryDocuments?: string;
};

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

// Same lesson as the other research agents: the model reliably omits a
// nested array field it found nothing for rather than sending [].
function backfillEmptyArrayFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  const unmetNeed = record.unmetNeed;
  if (typeof unmetNeed === "object" && unmetNeed !== null) {
    const unmetNeedRecord = unmetNeed as Record<string, unknown>;
    if (!("citations" in unmetNeedRecord)) unmetNeedRecord.citations = [];
  }
  return record;
}

async function runFindingsLoop(
  messages: Anthropic.MessageParam[],
  parentSpan: LangfuseSpanClient | undefined,
  spanPrefix: string
): Promise<CommercialOpportunityOutput> {
  // Provenance tracking for patientPopulationEstimate/unmetNeed citations —
  // same idea as Clinical Research's realNctIds, hostname-level since these
  // are arbitrary URLs. Seeded with pubmed.ncbi.nlm.nih.gov whenever
  // search_pubmed actually returns results, plus every real web_search
  // result hostname. The reconciliation step afterward doesn't need this —
  // it can't introduce new citations (marketCrowdingAssessment has none).
  const knownHostnames = new Set<string>();

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastChance = i === MAX_ITERATIONS - 1;

    const generation = parentSpan?.generation({
      name: `${spanPrefix}-llm-call-${i}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      // 4096 has confirmed to truncate mid-"thinking" on other agents in
      // this codebase — 8192 is the default for every agent, not just the
      // ones that look complex up front (build-agent skill lesson #6).
      max_tokens: 8192,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: isLastChance
        ? [submitFindingsTool]
        : [pubmedToolDefinition, webSearchTool, submitFindingsTool],
      tool_choice: isLastChance
        ? { type: "tool", name: "submit_findings" }
        : { type: "auto" },
      messages,
    });

    generation?.end({
      output: response.content,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        unit: "TOKENS",
      },
    });

    messages.push({ role: "assistant", content: response.content });
    for (const host of extractWebSearchHostnames(response.content)) knownHostnames.add(host);

    const submitBlock = response.content
      .filter(isToolUseBlock)
      .find((b) => b.name === "submit_findings");
    if (submitBlock) {
      const parsed = commercialOpportunityOutputSchema.safeParse(
        backfillEmptyArrayFields(submitBlock.input)
      );
      if (parsed.success) {
        const citationUrls = [
          ...(parsed.data.patientPopulationEstimate.citation
            ? [parsed.data.patientPopulationEstimate.citation.sourceUrl]
            : []),
          ...parsed.data.unmetNeed.citations.map((c) => c.sourceUrl),
        ];
        const unverified = findUnverifiedUrls(citationUrls, knownHostnames);
        if (unverified.length === 0) return parsed.data;
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submitBlock.id,
              content: `submit_findings input failed validation: these citation URLs (in patientPopulationEstimate or unmetNeed) were not seen in any real search_pubmed or web_search result this conversation: ${unverified.join(", ")}. Never invent a source URL — search to confirm them or remove the unverifiable citations and call submit_findings again.`,
              is_error: true,
            },
          ],
        });
        continue;
      }
      // Malformed structured output is a confirmed failure mode at scale on
      // other agents in this codebase — safeParse and feed the error back
      // so the model can self-correct within this conversation instead of
      // throwing and forcing a full restart on the next Orchestrator retry.
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: submitBlock.id,
            content: `submit_findings input failed validation: ${parsed.error.message}. Re-read the schema and call submit_findings again with the corrected, complete JSON structure — every field must be the correct type (arrays are actual arrays, objects are actual objects, not strings).`,
            is_error: true,
          },
        ],
      });
      continue;
    }

    const toolUseBlocks = response.content.filter(isToolUseBlock);

    if (toolUseBlocks.length === 0) {
      messages.push({
        role: "user",
        content: "Continue researching, or call submit_findings once you have enough data.",
      });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name === "search_pubmed") {
        const toolSpan = parentSpan?.span({ name: block.name, input: block.input });
        const result = await searchPubmed(block.input as { query: string; maxResults?: number });
        if (result.length > 0) knownHostnames.add("pubmed.ncbi.nlm.nih.gov");
        toolSpan?.end({ output: result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      // web_search tool_use blocks are executed server-side by Anthropic —
      // their results are already in this same response, nothing to do here.
    }
    if (toolResults.length > 0) {
      messages.push({ role: "user", content: toolResults });
    }
  }

  throw new Error("Commercial Opportunity Agent failed to produce findings within max iterations");
}

function summarizeCompetitiveLandscape(competitive: CompetitiveIntelligenceOutput): string {
  const approved = competitive.approvedCompetitors
    .map((c) => `${c.drug} (${c.company}, ${c.mechanism})`)
    .join("; ") || "none";
  const pipeline = competitive.lateStagePipeline
    .map((a) => `${a.drug} (${a.company}, ${a.phase})`)
    .join("; ") || "none";
  const gaps = competitive.positioningGaps.map((g) => g.description).join("; ") || "none identified";
  return `Approved competitors: ${approved}\nLate-stage pipeline: ${pipeline}\nPositioning gaps: ${gaps}`;
}

// AGENT_PLAN.md §3's recommended handling for Commercial's soft dependency
// on Competitive Intelligence: run both concurrently (no full sequential
// dependency, so the 30-minute budget survives), then re-check Commercial's
// own crowding claim against Competitive's *actual* output as one fast,
// single-turn validation call before returning — not another full research
// loop. If Competitive never resolves (failed/incomplete), skip this step
// and return the draft as-is; a best-effort judgment is still useful.
async function reconcileWithCompetitiveLandscape(
  draft: CommercialOpportunityOutput,
  competitive: CompetitiveIntelligenceOutput,
  parentSpan?: LangfuseSpanClient
): Promise<CommercialOpportunityOutput> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Here is your draft market crowding assessment:
${JSON.stringify(draft.marketCrowdingAssessment)}

Here is the Competitive Intelligence Agent's actual findings for this same asset:
${summarizeCompetitiveLandscape(competitive)}

Re-check consistentWithCompetitiveLandscape and, if needed, revise the summary so it doesn't contradict the actual competitive landscape above (e.g. don't describe the market as uncrowded if there are several approved competitors and late-stage pipeline assets in an overlapping mechanism). Call submit_findings once with the full findings object — patientPopulationEstimate, unmetNeed, and differentiationPotential unchanged from your draft, only marketCrowdingAssessment potentially revised.

Full draft findings for reference:
${JSON.stringify(draft)}`,
    },
  ];

  const generation = parentSpan?.generation({
    name: "commercial-opportunity-reconciliation",
    model: MODEL,
    input: messages,
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    tools: [submitFindingsTool],
    tool_choice: { type: "tool", name: "submit_findings" },
    messages,
  });

  generation?.end({
    output: response.content,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      unit: "TOKENS",
    },
  });

  const submitBlock = response.content.filter(isToolUseBlock).find((b) => b.name === "submit_findings");
  if (!submitBlock) {
    // Shouldn't happen with tool_choice forced, but fall back to the draft
    // rather than fail the whole agent over a validation step — logged
    // because this silently ships marketCrowdingAssessment un-reconciled
    // against Competitive Intelligence's actual findings (the exact
    // contradiction this step exists to catch, per Story 8), which was
    // previously invisible when it happened (comprehensive review,
    // 2026-07-25).
    console.warn("[commercial-opportunity] Reconciliation call returned no submit_findings block — falling back to the pre-reconciliation draft.");
    return draft;
  }

  const parsed = commercialOpportunityOutputSchema.safeParse(backfillEmptyArrayFields(submitBlock.input));
  if (!parsed.success) {
    console.warn(
      `[commercial-opportunity] Reconciliation output failed validation — falling back to the pre-reconciliation draft: ${parsed.error.message}`
    );
    return draft;
  }
  return parsed.data;
}

export async function runCommercialOpportunityAgent(
  input: CommercialOpportunityInput,
  parentSpan?: LangfuseSpanClient,
  competitiveOutput?: Promise<CompetitiveIntelligenceOutput | null>
): Promise<CommercialOpportunityOutput> {
  const today = new Date().toISOString().slice(0, 10);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Research the commercial opportunity for this therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Indication: ${input.indication}

Today's date is ${today}. Use search_pubmed and web_search to gather real data before calling submit_findings.${formatReviewerFeedback(input.reviewerFeedback)}${formatSupplementaryDocuments(input.supplementaryDocuments)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];

  const draft = await runFindingsLoop(messages, parentSpan, "commercial-opportunity");

  if (!competitiveOutput) return draft;
  const competitive = await competitiveOutput;
  if (!competitive) return draft;

  return reconcileWithCompetitiveLandscape(draft, competitive, parentSpan);
}
