// Competitive Intelligence Agent — AGENT_PLAN.md §4.3. Second research
// agent, per the build-agent skill's build order.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import {
  competitiveIntelligenceOutputSchema,
  type CompetitiveIntelligenceOutput,
} from "./schemas";
import { clinicalTrialsToolDefinition, searchClinicalTrials } from "./tools/clinicaltrials";
import { secEdgarSearchToolDefinition, searchSecFilings } from "./tools/sec-edgar";
import {
  UC_COMPETITOR_REFERENCE_LIST,
  findMissingReferenceCompetitors as findMissingReferenceCompetitorsByName,
} from "@/lib/config/uc-competitors";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";
import { formatReviewerFeedback } from "./reviewer-feedback";
import { formatSupplementaryDocuments } from "./supplementary-documents";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const REFERENCE_LIST_TEXT = UC_COMPETITOR_REFERENCE_LIST.map(
  (c) => `- ${c.drug} (${c.brandName}), ${c.company}, ${c.mechanism}, approved ~${c.approvedYear}`
).join("\n");

const SYSTEM_PROMPT = `You are the Competitive Intelligence Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: map approved therapies, late-stage pipeline, mechanism overlap, and positioning gaps in UC for the therapy asset described by the user.

Sources, in priority order: search ClinicalTrials.gov first for pipeline/approval status, then search_sec_filings for competitor 10-K/10-Q pipeline and risk-factor disclosures (a company's own SEC filing is stronger evidence of its pipeline stage than a news article about it), then web search for company websites, press releases, and FDA approval announcements to fill in anything the structured sources missed.

Hard rules:
- Your approvedCompetitors list MUST include every drug in this reference list of currently FDA-approved UC therapies, unless you have direct, cited evidence one has been withdrawn from the market (state that explicitly in that case rather than silently omitting it):
${REFERENCE_LIST_TEXT}
- lateStagePipeline only includes Phase 2b or later assets in the same or an overlapping mechanism class as the therapy being assessed — do not include earlier-stage or unrelated-mechanism assets.
- Never invent an approval date, company name, or trial detail. Every approvedCompetitors and lateStagePipeline entry needs a real citation from search_clinical_trials, search_sec_filings, or web_search.
- positioningGaps entries must be labeled Fact, Assumption, Inference, or Unknown based on how directly sourced they are — a gap you're inferring from the competitive picture rather than reading directly from a source is Inference, not Fact.
- submit_findings requires every field present, including empty arrays where you found nothing (e.g. lateStagePipeline: [] if there truly are none) — never omit a field.
- Every nested object (citation fields especially) must be a full object matching its shape, never a flattened string.

Example of a correctly-shaped submit_findings call (abbreviated):
{
  "approvedCompetitors": [{ "drug": "Vedolizumab", "company": "Takeda", "mechanism": "Anti-integrin (a4b7)", "approvalDate": "2014-05-20", "citation": { "sourceType": "FdaLabel", "sourceUrl": "https://www.accessdata.fda.gov/...", "accessedDate": "2026-07-18" } }],
  "lateStagePipeline": [],
  "positioningGaps": [{ "description": "...", "label": "Inference" }]
}

Call submit_findings exactly once, after using search_clinical_trials, search_sec_filings, and web_search to gather real data. Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated competitive intelligence findings. Call this only once you have gathered enough real data via search_clinical_trials, search_sec_filings, and web_search.",
  input_schema: z.toJSONSchema(competitiveIntelligenceOutputSchema) as Anthropic.Tool.InputSchema,
};

const webSearchTool: Anthropic.WebSearchTool20260318 = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 5,
  allowed_callers: ["direct"],
};

export type CompetitiveIntelligenceInput = {
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

function isToolUseBlock(
  block: Anthropic.ContentBlock
): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

// Same lesson as Clinical Research Agent: the model reliably omits
// top-level array fields it found nothing for rather than sending [].
const TOP_LEVEL_ARRAY_FIELDS = ["approvedCompetitors", "lateStagePipeline", "positioningGaps"] as const;

function backfillEmptyArrayFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  for (const field of TOP_LEVEL_ARRAY_FIELDS) {
    if (!(field in record)) record[field] = [];
  }
  return record;
}

// The system prompt's "MUST include every drug in the reference list" rule
// was previously prose-only — the schema accepts an empty array as valid,
// so a model that under-researched (or just skipped the instruction) got a
// clean safeParse success with nothing to catch it. Confirmed as a real,
// recurring failure mode across multiple live runs (empty on some, fully
// populated on others, same target) — this closes the gap the same way
// Deal Comparables' no-fabrication rule is enforced: check it in code, not
// just prompt text, and feed a miss back for self-correction like the
// malformed-JSON path already does.
//
// Matching itself is delegated to the shared, substring-based
// findMissingReferenceCompetitors in lib/config/uc-competitors.ts — an
// earlier exact-match version of this check lived here and duplicated (with
// the same bug) in synthesis.ts's confidence-score calculation; see that
// file's comment for the concrete evidence of what exact matching broke.
function findMissingReferenceCompetitors(output: CompetitiveIntelligenceOutput): string[] {
  const reportedNames = output.approvedCompetitors.map((c) => c.drug);
  return findMissingReferenceCompetitorsByName(reportedNames).map((ref) => ref.drug);
}

export async function runCompetitiveIntelligenceAgent(
  input: CompetitiveIntelligenceInput,
  parentSpan?: LangfuseSpanClient
): Promise<CompetitiveIntelligenceOutput> {
  const today = new Date().toISOString().slice(0, 10);

  // Provenance tracking for approvedCompetitors/lateStagePipeline citations
  // — same idea as Clinical Research's realNctIds, hostname-level since
  // these are arbitrary URLs, not compact exact IDs. Seeded with
  // clinicaltrials.gov or www.sec.gov whenever that structured tool actually
  // returns results, plus every real web_search result hostname.
  const knownHostnames = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      // cache_control — same reasoning as clinical-research.ts: this exact
      // content is resent unchanged on every iteration and every
      // Orchestrator retry, so caching it turns repeat sends of a large
      // supplementaryDocuments block into ~10%-cost cache reads instead of
      // full-price resends (comprehensive review, 2026-08-02).
      content: [
        {
          type: "text",
          text: `Research the competitive landscape for this therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Indication: ${input.indication}

Today's date is ${today}. Use search_clinical_trials, search_sec_filings, and web_search to gather real data before calling submit_findings.${formatReviewerFeedback(input.reviewerFeedback)}${formatSupplementaryDocuments(input.supplementaryDocuments)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastChance = i === MAX_ITERATIONS - 1;

    const generation = parentSpan?.generation({
      name: `competitive-intelligence-llm-call-${i}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      // Observed 4096 truncating mid-"thinking" on a real run (stop_reason:
      // max_tokens, cut off before it could act on research already
      // gathered) — a plausible cause of the empty-output runs seen before
      // this fix.
      max_tokens: 8192,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: isLastChance
        ? [submitFindingsTool]
        : [clinicalTrialsToolDefinition, secEdgarSearchToolDefinition, webSearchTool, submitFindingsTool],
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
      const parsed = competitiveIntelligenceOutputSchema.safeParse(
        backfillEmptyArrayFields(submitBlock.input)
      );
      if (parsed.success) {
        const missing = findMissingReferenceCompetitors(parsed.data);
        const citationUrls = [
          ...parsed.data.approvedCompetitors.map((c) => c.citation.sourceUrl),
          ...parsed.data.lateStagePipeline.map((a) => a.citation.sourceUrl),
        ];
        const unverifiedUrls = findUnverifiedUrls(citationUrls, knownHostnames);
        if (missing.length === 0 && unverifiedUrls.length === 0) return parsed.data;

        const problems: string[] = [];
        if (missing.length > 0) {
          problems.push(
            `approvedCompetitors is missing required reference-list drugs: ${missing.join(", ")} — every drug on that list must appear with a real citation, unless you have direct cited evidence it's been withdrawn (state that explicitly instead of omitting it)`
          );
        }
        if (unverifiedUrls.length > 0) {
          problems.push(
            `these citation URLs were not seen in any real search_clinical_trials, search_sec_filings, or web_search result this conversation: ${unverifiedUrls.join(", ")} — never invent a source URL, search to confirm them or remove the unverifiable entries`
          );
        }
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submitBlock.id,
              content: `submit_findings input failed validation: ${problems.join("; ")}. Then call submit_findings again.`,
              is_error: true,
            },
          ],
        });
        continue;
      }
      // Malformed structured output — confirmed in testing: with a larger
      // schema (11+ competitors, each a full object), the model can garble
      // a field into a string instead of the real JSON shape. Feed the
      // validation error back so it can self-correct in this conversation
      // instead of throwing and forcing a full restart on the next retry.
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
        content:
          "Continue researching, or call submit_findings once you have enough data.",
      });
      continue;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of toolUseBlocks) {
      if (block.name === "search_clinical_trials") {
        const toolSpan = parentSpan?.span({ name: block.name, input: block.input });
        const result = await searchClinicalTrials(
          block.input as { query: string; condition?: string; pageSize?: number }
        );
        if (result.length > 0) knownHostnames.add("clinicaltrials.gov");
        toolSpan?.end({ output: result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      if (block.name === "search_sec_filings") {
        const toolSpan = parentSpan?.span({ name: block.name, input: block.input });
        const result = await searchSecFilings(
          block.input as { query: string; entityName?: string; forms?: string; maxResults?: number }
        );
        if (result.length > 0) knownHostnames.add("www.sec.gov");
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

  throw new Error(
    "Competitive Intelligence Agent failed to produce findings within max iterations"
  );
}
