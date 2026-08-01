// Regulatory Agent — AGENT_PLAN.md §4.6. Fourth research agent, per the
// build-agent skill's build order.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import { regulatoryOutputSchema, type RegulatoryOutput } from "./schemas";
import { UC_COMPETITOR_REFERENCE_LIST } from "@/lib/config/uc-competitors";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const REFERENCE_LIST_TEXT = UC_COMPETITOR_REFERENCE_LIST.map(
  (c) => `- ${c.drug} (${c.brandName}), ${c.company}, ${c.mechanism}, approved ~${c.approvedYear}`
).join("\n");

const SYSTEM_PROMPT = `You are the Regulatory Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: find relevant FDA guidance documents, identify approved UC trial endpoints with precedent across multiple approved labels, find prior approvals in the same mechanism class, and produce a development timeline estimate, for the therapy asset described by the user.

Sources: web search for FDA.gov guidance documents, approval letters, and prior UC drug labels (accessdata.fda.gov).

Here is a reference list of currently FDA-approved UC therapies you can draw on for endpointPrecedent and priorApprovalsSameMechanism — use it as a starting point, but confirm each specific fact (approval date, endpoint used) with a real citation before including it:
${REFERENCE_LIST_TEXT}

Hard rules:
- developmentTimelineEstimate.label MUST ALWAYS be "Assumption", never "Fact" — regulatory timelines are inherently uncertain and stating one as fact is a banned "false certainty" claim. The schema enforces this as a literal, but make sure your summary text also reads as an estimate, not a promise.
- endpointPrecedent entries need sourcedFromLabels with AT LEAST 2 approved UC drug names (from the reference list or otherwise) — a single-label endpoint isn't precedent, it's a data point. Only include an endpoint here once you've confirmed at least 2 labels actually used it.
- priorApprovalsSameMechanism should only include drugs whose mechanism genuinely overlaps with the therapy asset's stated modality — do not pad this list with unrelated mechanisms.
- Never invent an approval date, guidance document URL, or endpoint detail. Every guidanceDocuments, priorApprovalsSameMechanism, and endpointPrecedent entry needs a real citation or a real, verifiable URL from web_search.
- submit_findings requires every field present, including empty arrays where you found nothing (e.g. guidanceDocuments: [] if there truly are none) — never omit a field.
- Every nested object (citation fields especially) must be a full object matching its shape, never a flattened string.

Example of a correctly-shaped submit_findings call (abbreviated):
{
  "guidanceDocuments": [{ "title": "Ulcerative Colitis: Clinical Trial Endpoints Guidance for Industry", "url": "https://www.fda.gov/...", "relevance": "..." }],
  "endpointPrecedent": [{ "endpoint": "Clinical remission at week 52 (Mayo score)", "sourcedFromLabels": ["Vedolizumab", "Ustekinumab"], "citations": [{ "sourceType": "FdaLabel", "sourceUrl": "https://www.accessdata.fda.gov/...", "accessedDate": "2026-07-18" }] }],
  "priorApprovalsSameMechanism": [{ "drug": "Risankizumab", "approvalDate": "2024-06-01", "citation": { "sourceType": "FdaLabel", "sourceUrl": "https://www.accessdata.fda.gov/...", "accessedDate": "2026-07-18" } }],
  "developmentTimelineEstimate": { "summary": "...", "label": "Assumption" }
}

Call submit_findings exactly once, after using web_search to gather real data. Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated regulatory findings. Call this only once you have gathered enough real data via web_search.",
  input_schema: z.toJSONSchema(regulatoryOutputSchema) as Anthropic.Tool.InputSchema,
};

const webSearchTool: Anthropic.WebSearchTool20260318 = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 5,
  allowed_callers: ["direct"],
};

export type RegulatoryInput = {
  target: string;
  modality: string;
  stage: string;
  indication: string;
};

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

// Same lesson as the other research agents: the model reliably omits
// top-level array fields it found nothing for rather than sending [].
const TOP_LEVEL_ARRAY_FIELDS = [
  "guidanceDocuments",
  "endpointPrecedent",
  "priorApprovalsSameMechanism",
] as const;

function backfillEmptyArrayFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  for (const field of TOP_LEVEL_ARRAY_FIELDS) {
    if (!(field in record)) record[field] = [];
  }
  return record;
}

export async function runRegulatoryAgent(
  input: RegulatoryInput,
  parentSpan?: LangfuseSpanClient
): Promise<RegulatoryOutput> {
  const today = new Date().toISOString().slice(0, 10);

  // Same reasoning as Deal Comparables — no structured tool fallback here,
  // every citation is only as trustworthy as web_search itself.
  const knownHostnames = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research the regulatory landscape for this therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Stage: ${input.stage}
Indication: ${input.indication}

Today's date is ${today}. Use web_search to gather real data before calling submit_findings.`,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastChance = i === MAX_ITERATIONS - 1;

    const generation = parentSpan?.generation({
      name: `regulatory-llm-call-${i}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      // 8192 is the default for every agent in this codebase, not just the
      // ones that look complex up front — 4096 has confirmed to truncate
      // mid-"thinking" on other agents.
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: isLastChance ? [submitFindingsTool] : [webSearchTool, submitFindingsTool],
      tool_choice: isLastChance ? { type: "tool", name: "submit_findings" } : { type: "auto" },
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
      const parsed = regulatoryOutputSchema.safeParse(backfillEmptyArrayFields(submitBlock.input));
      if (parsed.success) {
        const citationUrls = [
          ...parsed.data.guidanceDocuments.map((doc) => doc.url),
          ...parsed.data.endpointPrecedent.flatMap((p) => p.citations.map((c) => c.sourceUrl)),
          ...parsed.data.priorApprovalsSameMechanism.map((a) => a.citation.sourceUrl),
        ];
        const unverified = findUnverifiedUrls(citationUrls, knownHostnames);
        if (unverified.length === 0) return parsed.data;
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submitBlock.id,
              content: `submit_findings input failed validation: these URLs were not seen in any real web_search result this conversation: ${unverified.join(", ")}. Per the hard rule in your system prompt, every guidanceDocuments/endpointPrecedent/priorApprovalsSameMechanism entry needs a real citation or a real, verifiable URL from web_search — never invent one. Either search to confirm these, or remove the unverifiable entries and call submit_findings again.`,
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
            content: `submit_findings input failed validation: ${parsed.error.message}. Re-read the schema and call submit_findings again with the corrected, complete JSON structure — every field must be the correct type (arrays are actual arrays, objects are actual objects, not strings), and endpointPrecedent entries need at least 2 sourcedFromLabels and at least 1 citation.`,
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

    // web_search tool_use blocks are executed server-side by Anthropic —
    // their results are already in this same response, nothing to do here.
  }

  throw new Error("Regulatory Agent failed to produce findings within max iterations");
}
