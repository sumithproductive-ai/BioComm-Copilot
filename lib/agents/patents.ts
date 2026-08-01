// Patent Agent — 6th research agent, added post-launch per an explicit
// product decision that patent value deserves the same weight as
// competitive/commercial analysis. Informational only: does not feed the
// Confidence Score formula (see synthesis.ts) — a deliberate choice to
// avoid changing what past and future Confidence Scores mean.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import { patentOutputSchema, type PatentOutput } from "./schemas";
import { epoPatentSearchToolDefinition, searchPatents } from "./tools/epo-patents";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are the Patent Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: find patents relevant to the therapy asset described by the user — composition-of-matter, method-of-use, and formulation patents held by the asset's own developer, plus any blocking or closely competing patents held by others in the same or an overlapping mechanism class.

Sources, in priority order: search_patents (EPO Open Patent Services, structured and authoritative) first, then web search only as a fallback for context EPO's index might miss (e.g. a very recent filing, litigation/licensing context around a patent). This order matters for the same reason it does for every other agent here: structured sources first minimizes hallucination risk before you touch looser web text.

Hard rules:
- Never invent a patent number. Every patent you report must come from a real search_patents result (or, if found only via web_search, a real citation from that search — never a number you recall from training data).
- Each patents entry requires a real citation — if you cannot find a direct source for a specific patent finding, leave that entry out of the array entirely. Never submit one uncited, and never invent a citation just to satisfy the schema — an omitted finding is correct behavior here, not a failure.
- status must reflect what the source actually says (Granted, Pending, Expired, Abandoned) — never guess a status you haven't confirmed.
- landscapeSummary.label must never be "Fact" unless you have directly cited evidence for the overall patent landscape claim you're making (e.g. "no blocking patents found" is an inference from an incomplete search, not a fact) — default to Assumption or Inference.
- Label every claim as Fact, Assumption, Inference, or Unknown based on how directly it's sourced.
- If you find no relevant patents at all, return an empty patents array with a landscapeSummary explaining the search you did and why nothing relevant turned up — do not fail silently or fabricate a patent to fill the gap.
- submit_findings requires every field present, including an empty patents array if you found nothing.
- Every nested object (citation fields especially) must be a full object matching its shape, never a flattened string.

Example of a correctly-shaped submit_findings call (abbreviated):
{
  "patents": [{ "patentNumber": "US10000000B2", "title": "...", "applicant": "...", "publicationDate": "2020-01-01", "status": "Granted", "relevance": "Composition-of-matter patent covering the asset's active molecule.", "label": "Fact", "citation": { "sourceType": "Other", "sourceUrl": "https://worldwide.espacenet.com/...", "accessedDate": "2026-07-18" } }],
  "landscapeSummary": { "summary": "...", "label": "Assumption" }
}

Call submit_findings exactly once, after using search_patents (and web_search if needed) to gather real data. Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated patent findings. Call this only once you have gathered enough real data via search_patents and, if needed, web_search.",
  input_schema: z.toJSONSchema(patentOutputSchema) as Anthropic.Tool.InputSchema,
};

const webSearchTool: Anthropic.WebSearchTool20260318 = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 3,
  allowed_callers: ["direct"],
};

export type PatentsInput = {
  target: string;
  modality: string;
  indication: string;
  context?: string;
};

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

// Same lesson as every other research agent: the model reliably omits a
// top-level array field it found nothing for rather than sending [].
function backfillEmptyArrayFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  if (!("patents" in record)) record.patents = [];
  return record;
}

export async function runPatentsAgent(
  input: PatentsInput,
  parentSpan?: LangfuseSpanClient
): Promise<PatentOutput> {
  const today = new Date().toISOString().slice(0, 10);

  // Provenance tracking for patents[].citation — same idea as Clinical
  // Research's realNctIds, hostname-level since these are arbitrary URLs.
  // Seeded with espacenet.com whenever search_patents actually returns
  // results, plus every real web_search result hostname.
  const knownHostnames = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research patents relevant to this therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Indication: ${input.indication}
${input.context ? `Additional context: ${input.context}` : ""}

Today's date is ${today}. Use search_patents to gather real data before calling submit_findings.`,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastChance = i === MAX_ITERATIONS - 1;

    const generation = parentSpan?.generation({
      name: `patents-llm-call-${i}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
      tools: isLastChance
        ? [submitFindingsTool]
        : [epoPatentSearchToolDefinition, webSearchTool, submitFindingsTool],
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
      const parsed = patentOutputSchema.safeParse(backfillEmptyArrayFields(submitBlock.input));
      if (parsed.success) {
        const citationUrls = parsed.data.patents.map((p) => p.citation.sourceUrl);
        const unverified = findUnverifiedUrls(citationUrls, knownHostnames);
        if (unverified.length === 0) return parsed.data;
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submitBlock.id,
              content: `submit_findings input failed validation: these citation URLs were not seen in any real search_patents or web_search result this conversation: ${unverified.join(", ")}. Never invent a source URL — search to confirm them or remove the unverifiable patents and call submit_findings again.`,
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
      if (block.name === "search_patents") {
        const toolSpan = parentSpan?.span({ name: block.name, input: block.input });
        const result = await searchPatents(
          block.input as { applicant?: string; keyword?: string; maxResults?: number }
        );
        if (result.length > 0) knownHostnames.add("worldwide.espacenet.com");
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

  throw new Error("Patent Agent failed to produce findings within max iterations");
}
