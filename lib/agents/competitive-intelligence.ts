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
import { UC_COMPETITOR_REFERENCE_LIST } from "@/lib/config/uc-competitors";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const REFERENCE_LIST_TEXT = UC_COMPETITOR_REFERENCE_LIST.map(
  (c) => `- ${c.drug} (${c.brandName}), ${c.company}, ${c.mechanism}, approved ~${c.approvedYear}`
).join("\n");

const SYSTEM_PROMPT = `You are the Competitive Intelligence Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: map approved therapies, late-stage pipeline, mechanism overlap, and positioning gaps in UC for the therapy asset described by the user.

Sources, in priority order: search ClinicalTrials.gov first for pipeline/approval status, then web search for company websites, SEC filings, press releases, and FDA approval announcements.

Hard rules:
- Your approvedCompetitors list MUST include every drug in this reference list of currently FDA-approved UC therapies, unless you have direct, cited evidence one has been withdrawn from the market (state that explicitly in that case rather than silently omitting it):
${REFERENCE_LIST_TEXT}
- lateStagePipeline only includes Phase 2b or later assets in the same or an overlapping mechanism class as the therapy being assessed — do not include earlier-stage or unrelated-mechanism assets.
- Never invent an approval date, company name, or trial detail. Every approvedCompetitors and lateStagePipeline entry needs a real citation from search_clinical_trials or web_search.
- positioningGaps entries must be labeled Fact, Assumption, Inference, or Unknown based on how directly sourced they are — a gap you're inferring from the competitive picture rather than reading directly from a source is Inference, not Fact.
- submit_findings requires every field present, including empty arrays where you found nothing (e.g. lateStagePipeline: [] if there truly are none) — never omit a field.
- Every nested object (citation fields especially) must be a full object matching its shape, never a flattened string.

Example of a correctly-shaped submit_findings call (abbreviated):
{
  "approvedCompetitors": [{ "drug": "Vedolizumab", "company": "Takeda", "mechanism": "Anti-integrin (a4b7)", "approvalDate": "2014-05-20", "citation": { "sourceType": "FdaLabel", "sourceUrl": "https://www.accessdata.fda.gov/...", "accessedDate": "2026-07-18" } }],
  "lateStagePipeline": [],
  "positioningGaps": [{ "description": "...", "label": "Inference" }]
}

Call submit_findings exactly once, after using search_clinical_trials and web_search to gather real data. Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated competitive intelligence findings. Call this only once you have gathered enough real data via search_clinical_trials and web_search.",
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
function findMissingReferenceCompetitors(output: CompetitiveIntelligenceOutput): string[] {
  const found = new Set(output.approvedCompetitors.map((c) => c.drug.toLowerCase()));
  return UC_COMPETITOR_REFERENCE_LIST.filter((ref) => !found.has(ref.drug.toLowerCase())).map(
    (ref) => ref.drug
  );
}

export async function runCompetitiveIntelligenceAgent(
  input: CompetitiveIntelligenceInput,
  parentSpan?: LangfuseSpanClient
): Promise<CompetitiveIntelligenceOutput> {
  const today = new Date().toISOString().slice(0, 10);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research the competitive landscape for this therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Indication: ${input.indication}

Today's date is ${today}. Use search_clinical_trials and web_search to gather real data before calling submit_findings.`,
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
      system: SYSTEM_PROMPT,
      tools: isLastChance
        ? [submitFindingsTool]
        : [clinicalTrialsToolDefinition, webSearchTool, submitFindingsTool],
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

    const submitBlock = response.content
      .filter(isToolUseBlock)
      .find((b) => b.name === "submit_findings");
    if (submitBlock) {
      const parsed = competitiveIntelligenceOutputSchema.safeParse(
        backfillEmptyArrayFields(submitBlock.input)
      );
      if (parsed.success) {
        const missing = findMissingReferenceCompetitors(parsed.data);
        if (missing.length === 0) return parsed.data;
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submitBlock.id,
              content: `submit_findings input failed validation: approvedCompetitors is missing required reference-list drugs: ${missing.join(", ")}. Per the hard rule in your system prompt, every drug on that list must appear in approvedCompetitors with a real citation, unless you have direct cited evidence it's been withdrawn from the market — in which case say so explicitly instead of omitting it. Search for the missing ones and call submit_findings again with the complete list.`,
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
