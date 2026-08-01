// Deal Comparables Agent — AGENT_PLAN.md §4.5. Fifth and final research
// agent, per the build-agent skill's build order. Its no-fabrication
// guardrail is the single most important one in this agent, per
// PRODUCT_BRIEF.md — test the no-comp path explicitly, not just the happy
// path, before considering this agent done.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import { dealComparablesOutputSchema, type DealComparablesOutput } from "./schemas";
import { secEdgarSearchToolDefinition, searchSecFilings } from "./tools/sec-edgar";
import { extractWebSearchHostnames, findUnverifiedUrls } from "./tools/source-provenance";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ITERATIONS = 10;

const SYSTEM_PROMPT = `You are the Deal Comparables Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: find real, publicly disclosed licensing or acquisition deals for comparable therapy assets (same or overlapping mechanism, similar stage) to the one described by the user.

Sources, in priority order: search_sec_filings (SEC EDGAR full-text search, structured and authoritative — finds the actual 8-K/10-K exhibit disclosing deal terms) first, then web search for press releases, licensing announcements, and biotech news (Endpoints News, Fierce Biotech, BioPharma Dive, company investor relations pages) to fill in context SEC filings won't have (deal rationale, analyst commentary) or to find deals SEC EDGAR's search missed. A real SEC filing citation is stronger evidence than a news article about the same deal — prefer it when both exist.

THE SINGLE MOST IMPORTANT RULE FOR THIS AGENT: If you cannot find a deal with verifiable, disclosed source information, set noCompFound: true and explain why. Do not estimate or infer a deal that was not publicly reported. A fabricated comparable deal is a worse outcome than admitting you found none — a BD analyst using this memo to negotiate terms would be directly misled by an invented number. It is completely acceptable, and expected in many cases, for noCompFound to be true.

Other hard rules:
- comparableDeals MUST be empty ([]) whenever noCompFound is true — never populate both.
- disclosedTerms is a string; if a deal's specific financial terms weren't disclosed, write the literal string "not disclosed" — never estimate, guess, or infer a dollar figure to fill this field.
- compStrength is "Direct" only for a deal involving the same or a very closely overlapping mechanism/modality at a similar stage; otherwise "Approximate". Don't inflate weak analogues to "Direct".
- Every comparableDeals entry needs a real citation (sourceUrl) from an actual search_sec_filings or web_search result — never invent a source URL.
- submit_findings requires every field present, including an empty comparableDeals array when noCompFound is true.
- Every nested object (citation fields especially) must be a full object matching its shape, never a flattened string.

Example of a correctly-shaped submit_findings call when a real comp is found:
{
  "comparableDeals": [{ "asset": "...", "company": "...", "stageAtDeal": "Phase 2", "dealType": "License", "disclosedTerms": "$50M upfront, up to $500M in milestones", "compStrength": "Direct", "citation": { "sourceType": "PressRelease", "sourceUrl": "https://...", "accessedDate": "2026-07-18" } }],
  "noCompFound": false
}

Example of a correctly-shaped submit_findings call when no real comp is found:
{
  "comparableDeals": [],
  "noCompFound": true,
  "noCompExplanation": "Searched SEC EDGAR, press releases, and biotech news for licensing/acquisition deals involving IL-23p19-targeted UC assets at Phase 2 or later; found no deals with disclosed terms — only two relevant assets are internally developed by large pharma (AbbVie, Lilly) rather than licensed or acquired, so no comparable transaction exists to report."
}

Call submit_findings exactly once, after using search_sec_filings and/or web_search to gather real data (or to confirm nothing real exists). Do not call it before doing at least one real search.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final, validated deal comparables findings. Call this only once you have used search_sec_filings and/or web_search to either find real comparable deals or confirm none exist.",
  input_schema: z.toJSONSchema(dealComparablesOutputSchema) as Anthropic.Tool.InputSchema,
};

const webSearchTool: Anthropic.WebSearchTool20260318 = {
  type: "web_search_20260318",
  name: "web_search",
  max_uses: 5,
  allowed_callers: ["direct"],
};

export type DealComparablesInput = {
  target: string;
  modality: string;
  stage: string;
  indication: string;
};

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

// Same lesson as the other research agents: the model reliably omits a
// top-level array field it found nothing for rather than sending [] —
// here that matters doubly, since an omitted comparableDeals combined with
// noCompFound: true must still resolve to [] to satisfy the schema's
// no-fabrication refine, not fail validation on a technicality.
function backfillEmptyArrayFields(input: unknown): unknown {
  if (typeof input !== "object" || input === null) return input;
  const record = input as Record<string, unknown>;
  if (!("comparableDeals" in record)) record.comparableDeals = [];
  return record;
}

export async function runDealComparablesAgent(
  input: DealComparablesInput,
  parentSpan?: LangfuseSpanClient
): Promise<DealComparablesOutput> {
  const today = new Date().toISOString().slice(0, 10);

  // Track every hostname that actually appeared in a real result this run —
  // seeded with sec.gov whenever search_sec_filings returns results, plus
  // every real web_search result hostname. A citation whose hostname never
  // appeared is rejected below.
  const knownHostnames = new Set<string>();

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Research comparable deals for this therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Stage: ${input.stage}
Indication: ${input.indication}

Today's date is ${today}. Use search_sec_filings and web_search to gather real data before calling submit_findings. Remember: if you find no verifiable, disclosed deal, set noCompFound: true with a real explanation rather than fabricating one.`,
    },
  ];

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const isLastChance = i === MAX_ITERATIONS - 1;

    const generation = parentSpan?.generation({
      name: `deal-comparables-llm-call-${i}`,
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
      tools: isLastChance
        ? [submitFindingsTool]
        : [secEdgarSearchToolDefinition, webSearchTool, submitFindingsTool],
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
      const parsed = dealComparablesOutputSchema.safeParse(backfillEmptyArrayFields(submitBlock.input));
      if (parsed.success) {
        const citationUrls = parsed.data.comparableDeals.map((deal) => deal.citation.sourceUrl);
        const unverified = findUnverifiedUrls(citationUrls, knownHostnames);
        if (unverified.length === 0) return parsed.data;
        messages.push({
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: submitBlock.id,
              content: `submit_findings input failed validation: these citation URLs were not seen in any real search_sec_filings or web_search result this conversation: ${unverified.join(", ")}. Per the hard rule in your system prompt, every comparableDeals citation needs a real source from an actual search_sec_filings or web_search result — never invent a source URL. Either search to confirm these, or remove the unverifiable deals and call submit_findings again (setting noCompFound: true if nothing verifiable remains).`,
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
      // This also catches the specific no-fabrication violation (both
      // fields' refine errors) if the model tries to report a deal AND
      // noCompFound: true at once.
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: submitBlock.id,
            content: `submit_findings input failed validation: ${parsed.error.message}. Re-read the schema and call submit_findings again with the corrected, complete JSON structure. Remember: comparableDeals must be empty when noCompFound is true, and noCompExplanation is required when noCompFound is true.`,
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

  throw new Error("Deal Comparables Agent failed to produce findings within max iterations");
}
