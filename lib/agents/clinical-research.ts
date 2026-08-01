// Clinical Research Agent — AGENT_PLAN.md §4.2. First agent built, per the
// build-agent skill's ordering: verified end-to-end against a real API call
// before any other agent is written.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import { clinicalResearchOutputSchema, type ClinicalResearchOutput } from "./schemas";
import { clinicalTrialsToolDefinition, searchClinicalTrials } from "./tools/clinicaltrials";
import { pubmedToolDefinition, searchPubmed } from "./tools/pubmed";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are the Clinical Research Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: research active and completed trials, trial outcomes, mechanism of action, safety signals, and whether similar drugs have failed, for the therapy asset described by the user.

Sources, in priority order: search ClinicalTrials.gov first (structured, authoritative for trial status), then PubMed for mechanism/efficacy literature, then web search only as a fallback for company pipeline context not covered by the first two. This order matters: structured sources first minimizes hallucination risk before you touch looser web text.

Hard rules:
- Never invent an NCT number. Every trial you report must come from a real search_clinical_trials result.
- If you cannot confirm a trial's current status from search results, set isStale: true rather than silently reporting old data as current.
- Never state a remission rate, response rate, or other efficacy/safety number without a direct source from search_clinical_trials or search_pubmed.
- safetySignals and similarDrugFailures entries each require a real citation — if you cannot find a direct source for a specific safety signal or a specific similar-drug-failure reason, leave that entry out of the array entirely. Never submit one uncited, and never invent a citation just to satisfy the schema — an omitted claim is correct behavior here, not a failure.
- Label every claim as Fact, Assumption, Inference, or Unknown based on how directly it's sourced — a claim you inferred from indirect evidence is Inference, not Fact.
- If a target has no published trials at all, return an empty trials array with the rest of the schema filled out as best you can — do not fail silently or fabricate a trial to fill the gap.
- submit_findings requires every field in its schema to be present, including arrays where you found nothing — pass an empty array (e.g. similarDrugFailures: []) rather than omitting the field entirely.
- mechanismOfAction is an OBJECT, not a string: { summary: string, label: ClaimLabel, citations: Citation[] }. Every nested object field in the schema (trial.citation, mechanismOfAction, safetySignals[].citation, etc.) must be a full object matching its shape, never a flattened string.

Example of a correctly-shaped submit_findings call (abbreviated):
{
  "trials": [{ "nctId": "NCT01234567", "title": "...", "phase": "Phase 3", "status": "Completed", "statusAsOfDate": "2026-01-01", "sponsor": "...", "isStale": false, "citation": { "sourceType": "ClinicalTrialsGov", "sourceUrl": "https://clinicaltrials.gov/study/NCT01234567", "accessedDate": "2026-07-18" } }],
  "mechanismOfAction": { "summary": "...", "label": "Fact", "citations": [{ "sourceType": "Pubmed", "sourceUrl": "https://pubmed.ncbi.nlm.nih.gov/12345678/", "accessedDate": "2026-07-18" }] },
  "safetySignals": [],
  "similarDrugFailures": []
}

Call submit_findings exactly once, when you have gathered enough real data to fill out the schema. Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated clinical research findings. Call this only once you have gathered enough real data via search_clinical_trials and search_pubmed.",
  input_schema: z.toJSONSchema(clinicalResearchOutputSchema) as Anthropic.Tool.InputSchema,
};

const webSearchTool: Anthropic.WebSearchTool20260318 = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 3,
  // Without this, the model can route web_search through a code-execution
  // tool call that requires container_id session management we don't set
  // up — direct-only keeps this a simple, stateless fallback tool.
  allowed_callers: ["direct"],
};

export type ClinicalResearchInput = {
  target: string;
  modality: string;
  stage: string;
  indication: string;
  context?: string;
};

function isToolUseBlock(
  block: Anthropic.ContentBlock
): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

// The model reliably omits top-level array fields it found nothing for
// (confirmed across repeated real runs, not fixed by prompt instructions or
// a worked example) rather than sending []. An omitted "I found nothing"
// list carries the same meaning as an explicit empty one, so backfill it
// here instead of hard-failing — everything else (nested objects, NCT
// format, citations) stays strictly validated by the schema.
const TOP_LEVEL_ARRAY_FIELDS = ["trials", "safetySignals", "similarDrugFailures"] as const;

function backfillEmptyArrayFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  for (const field of TOP_LEVEL_ARRAY_FIELDS) {
    if (!(field in record)) record[field] = [];
  }
  return record;
}

export async function runClinicalResearchAgent(
  input: ClinicalResearchInput,
  parentSpan?: LangfuseSpanClient
): Promise<ClinicalResearchOutput> {
  const today = new Date().toISOString().slice(0, 10);

  // Provenance tracking for the "never invent an NCT number" hard rule —
  // previously prompt-only: the schema only validates NCT ID *format*
  // (^NCT\d{8}$), not that it actually came from a real
  // search_clinical_trials result this conversation, so a well-formatted
  // but fabricated ID would have passed cleanly (comprehensive review,
  // 2026-07-25 — the same class of unenforced guardrail found and fixed
  // elsewhere in this codebase). Every NCT ID that ever appears in a real
  // tool result is recorded here; the final submission is checked against
  // it before being accepted.
  const realNctIds = new Set<string>();

  // Same provenance idea, generalized to every other citation field this
  // agent has (mechanismOfAction, safetySignals, similarDrugFailures) — the
  // NCT check above is stricter (exact ID match) and stays as the check for
  // trials specifically; this is hostname-level for everything else,
  // seeded with clinicaltrials.gov/pubmed.ncbi.nlm.nih.gov whenever those
  // structured tools actually return results, plus every real web_search
  // result hostname.
  const knownHostnames = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research this therapy asset and produce clinical landscape findings.

Target: ${input.target}
Modality: ${input.modality}
Stage: ${input.stage}
Indication: ${input.indication}
${input.context ? `Additional context: ${input.context}` : ""}

Today's date is ${today}. Use search_clinical_trials and search_pubmed to gather real data before calling submit_findings.`,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastChance = i === MAX_ITERATIONS - 1;

    const generation = parentSpan?.generation({
      name: `clinical-research-llm-call-${i}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      // 4096 was observed truncating mid-"thinking" on a real Competitive
      // Intelligence run (stop_reason: max_tokens, cut off before it could
      // act on research it had already gathered) — same risk here.
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: isLastChance
        ? [submitFindingsTool]
        : [clinicalTrialsToolDefinition, pubmedToolDefinition, webSearchTool, submitFindingsTool],
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
      const parsed = clinicalResearchOutputSchema.safeParse(
        backfillEmptyArrayFields(submitBlock.input)
      );
      if (parsed.success) {
        const unverifiedNctIds = parsed.data.trials
          .map((t) => t.nctId)
          .filter((nctId) => !realNctIds.has(nctId));
        const citationUrls = [
          ...parsed.data.mechanismOfAction.citations.map((c) => c.sourceUrl),
          ...parsed.data.safetySignals.map((s) => s.citation.sourceUrl),
          ...parsed.data.similarDrugFailures.map((f) => f.citation.sourceUrl),
        ];
        const unverifiedUrls = findUnverifiedUrls(citationUrls, knownHostnames);
        if (unverifiedNctIds.length === 0 && unverifiedUrls.length === 0) return parsed.data;

        const problems: string[] = [];
        if (unverifiedNctIds.length > 0) {
          problems.push(
            `these NCT IDs are not in the search_clinical_trials results from this conversation: ${unverifiedNctIds.join(", ")} — never invent or recall an NCT ID from memory, search to confirm them or remove them from trials`
          );
        }
        if (unverifiedUrls.length > 0) {
          problems.push(
            `these citation URLs (in mechanismOfAction, safetySignals, or similarDrugFailures) were not seen in any real search_pubmed or web_search result this conversation: ${unverifiedUrls.join(", ")} — search to confirm them or remove the unverifiable entries`
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
      // Malformed structured output (confirmed in testing: the model can
      // garble a large tool call into a single string field instead of the
      // real JSON shape) — feed the validation error back as a tool_result
      // so the model can self-correct in this same conversation, instead of
      // throwing and forcing the Orchestrator to restart the whole agent
      // from scratch on its next retry.
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
      const toolSpan = parentSpan?.span({ name: block.name, input: block.input });
      if (block.name === "search_clinical_trials") {
        const result = await searchClinicalTrials(
          block.input as { query: string; condition?: string; pageSize?: number }
        );
        for (const study of result) {
          if (study.nctId) realNctIds.add(study.nctId);
        }
        if (result.length > 0) knownHostnames.add("clinicaltrials.gov");
        toolSpan?.end({ output: result });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      } else if (block.name === "search_pubmed") {
        const result = await searchPubmed(
          block.input as { query: string; maxResults?: number }
        );
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

  throw new Error(
    "Clinical Research Agent failed to produce findings within max iterations"
  );
}
