// Critic Agent — AGENT_PLAN.md §4.7. Sixth agent, last of the six
// research/review agents per the build-agent skill's build order (needs all
// 5 research schemas stable, which is now true). Unlike the research
// agents, Critic never touches original sources — it reasons only over the
// structured outputs it's given, so it has no web_search tool at all.

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { LangfuseSpanClient } from "langfuse";
import { criticFlagSchema, criticOutputSchema, type CriticOutput, type ResearchOutputs } from "./schemas";
import { UC_COMPETITOR_REFERENCE_LIST } from "@/lib/config/uc-competitors";

const client = new Anthropic();

const MODEL = "claude-sonnet-5";
const MAX_ATTEMPTS = 3;

const REFERENCE_LIST_TEXT = UC_COMPETITOR_REFERENCE_LIST.map(
  (c) => `- ${c.drug} (${c.brandName}), ${c.company}, ${c.mechanism}, approved ~${c.approvedYear}`
).join("\n");

// hasCriticalFlags is computed in code from flags.length, not asked of the
// model — same "boring and explainable" principle AGENT_PLAN.md §5.1 uses
// for the confidence formula. Letting the LLM independently assert a
// boolean that must stay consistent with the array it just wrote is a
// redundant failure mode (model lists 2 flags, forgets to flip the bool);
// deriving it deterministically removes that surface entirely.
const criticSubmissionSchema = z.object({
  flags: z.array(criticFlagSchema),
});

// Defense in depth for the system prompt's "never include a flag you
// talked yourself out of" rule. Confirmed live (comprehensive review,
// 2026-07-25): a real run's Reviewer Notes contained a "Missing competitor"
// flag whose own description read "...actually present. (No issue -
// retracting)" — the model reasoned its way out of the flag mid-sentence
// but still submitted it. A prompt instruction alone is exactly the class
// of unenforced guardrail this codebase has repeatedly found to fail in
// practice (see e.g. the Competitive Intelligence reference-list bug) —
// this is a cheap, deterministic backstop, not a replacement for the
// prompt fix. Matches case-insensitively; logs when it fires so a
// persistent pattern is visible in server logs rather than silently
// masked forever.
const SELF_CONTRADICTION_MARKERS = [
  "no issue",
  "not an issue",
  "actually fine",
  "actually present",
  "actually correct",
  "retracting",
  "retract this",
  "on second look",
  "on second thought",
  "never mind",
  "false positive",
  "disregard this",
];

function isSelfContradictingFlag(description: string): boolean {
  const normalized = description.toLowerCase();
  return SELF_CONTRADICTION_MARKERS.some((marker) => normalized.includes(marker));
}

function dropSelfContradictingFlags(
  flags: z.infer<typeof criticFlagSchema>[]
): z.infer<typeof criticFlagSchema>[] {
  return flags.filter((flag) => {
    if (!isSelfContradictingFlag(flag.description)) return true;
    console.warn(
      `[critic] Dropped a self-contradicting flag (model reasoned its way out of it but submitted it anyway): ${flag.type} / ${flag.section} — "${flag.description}"`
    );
    return false;
  });
}

const SYSTEM_PROMPT = `You are the Critic Agent for BioComm Copilot, a commercialization intelligence system for ulcerative colitis (UC) therapy assets.

Your job: adversarially review the 5 research agent outputs you're given (Clinical Research, Competitive Intelligence, Commercial Opportunity, Regulatory, Deal Comparables) for a single therapy asset, and flag every problem you find. You do not have web search or any other tool — you reason only over the structured JSON you're given, plus the hardcoded UC competitor reference list below. Do not invent facts to fill gaps; your job is to flag gaps, not close them.

Run exactly these 7 checks. Every flag you produce must use one of these exact "type" values, matching the check that produced it:

1. UnsupportedClaim — any claim in the Clinical Research output that is missing a citation where the schema allows one (e.g. a safetySignal or similarDrugFailure with no citation, when a citation was reasonably available).
2. MissingCompetitor — diff the Competitive Intelligence output's approvedCompetitors against this hardcoded reference list. Flag every drug on the list below that does NOT appear (by drug or brand name) in approvedCompetitors.
Reference list:
${REFERENCE_LIST_TEXT}
3. AssumptionAsFact — scan every section for a claim whose label is "Fact" but whose surrounding text reads as uncertain, estimated, or hedged, or a claim with no label field at all where the schema requires one. Also flag a label that looks too weak for a well-cited claim (mislabeled confidence goes both directions).
4. UndisclosedTerms — in Deal Comparables output, any comparableDeals entry whose disclosedTerms does not clearly state financial terms (or clearly state "not disclosed") but isn't already flagged as such by the Deal Comparables Agent itself.
5. StaleData — any trial in the Clinical Research output whose statusAsOfDate is more than 12 months before today's date (given below) but isStale is false.
6. OverconfidentRegulatory — any claim in the Regulatory output that states a regulatory outcome, timeline, or approval likelihood as settled fact rather than "Assumption" (developmentTimelineEstimate.label is enforced as "Assumption" by schema already — this check is about prose elsewhere in the Regulatory output that reads more confidently than its label suggests, and any other unlabeled regulatory claim treated as certain).
7. Contradiction — cross-section contradictions, most notably Commercial Opportunity's marketCrowdingAssessment.consistentWithCompetitiveLandscape being false, but also any other place where two sections' claims about the same fact disagree.

For each flag, set "section" to the name of the research section it applies to (e.g. "Clinical Research", "Competitive Intelligence", "Commercial Opportunity", "Regulatory", "Deal Comparables"), and "description" to a specific, concrete explanation — name the actual claim, drug, or field, not a generic restatement of the check.

Hard rules:
- Never filter or soften a flag that is genuinely correct — every real problem you confirm must appear in your output as its own array entry. This is a compliance-relevant check for a BD tool; false negatives on real problems are worse than over-flagging.
- This does NOT mean including a flag you talked yourself out of. If, while checking something, you conclude there is actually no problem (e.g. you first thought a competitor was missing, then noticed it's present under a different name or citation), that is not a flag — do not add it to the array. A flag's description must never contain hedging or self-correction language like "actually fine," "no issue," "retracting," or "on second look" — if your description would need to say any of that, the correct action is to not emit that flag at all, not to emit it with a caveat. Every entry in the array must be a confirmed, real problem end to end.
- Do not fabricate a problem that isn't there just to have output — if a section is null (that research agent failed or produced nothing), do not run checks against it and do not flag its absence as one of the 7 check types above (there is no flag type for "missing section").
- Every flag must be traceable to something actually present in the JSON you were given — don't speculate about data you weren't given.

Example of a correctly-shaped submit_findings call:
{
  "flags": [
    { "type": "MissingCompetitor", "section": "Competitive Intelligence", "description": "Ozanimod (Zeposia), Bristol Myers Squibb, is FDA-approved for UC since ~2021 but does not appear in approvedCompetitors." },
    { "type": "StaleData", "section": "Clinical Research", "description": "Trial NCT01234567 has statusAsOfDate of 2024-11-01 (more than 12 months before today) but isStale is false." }
  ]
}

If you find nothing wrong, call submit_findings with an empty flags array — do not invent a flag to avoid returning empty.

Call submit_findings exactly once.`;

const submitFindingsTool: Anthropic.Tool = {
  name: "submit_findings",
  description:
    "Submit your final list of flags from reviewing the 5 research outputs. Call this exactly once, whether or not you found any problems.",
  input_schema: z.toJSONSchema(criticSubmissionSchema) as Anthropic.Tool.InputSchema,
};

export type CriticInput = {
  target: string;
  modality: string;
  indication: string;
  researchOutputs: ResearchOutputs;
};

function isToolUseBlock(block: Anthropic.ContentBlock): block is Anthropic.ToolUseBlock {
  return block.type === "tool_use";
}

export async function runCriticAgent(
  input: CriticInput,
  parentSpan?: LangfuseSpanClient
): Promise<CriticOutput> {
  const today = new Date().toISOString().slice(0, 10);

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Review these research outputs for the following therapy asset.

Target: ${input.target}
Modality: ${input.modality}
Indication: ${input.indication}
Today's date: ${today}

Research outputs (any section may be null if that agent failed to produce output — do not run checks against a null section):
${JSON.stringify(input.researchOutputs, null, 2)}

Run all 7 checks from your system prompt and call submit_findings with every flag you find.`,
    },
  ];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const generation = parentSpan?.generation({
      name: `critic-llm-call-${attempt}`,
      model: MODEL,
      input: messages,
    });

    const response = await client.messages.create({
      model: MODEL,
      // 8192 is the default for every agent in this codebase — Critic's
      // input here is larger than any single research agent's (all 5
      // outputs at once), so there's no reason to go lower.
      max_tokens: 8192,
      system: SYSTEM_PROMPT,
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

    messages.push({ role: "assistant", content: response.content });

    const submitBlock = response.content
      .filter(isToolUseBlock)
      .find((b) => b.name === "submit_findings");
    if (submitBlock) {
      const parsed = criticSubmissionSchema.safeParse(submitBlock.input);
      if (parsed.success) {
        const flags = dropSelfContradictingFlags(parsed.data.flags);
        return criticOutputSchema.parse({
          flags,
          hasCriticalFlags: flags.length > 0,
        });
      }
      // Same confirmed-at-scale failure mode as the research agents: feed
      // the validation error back as an is_error tool_result so the model
      // can self-correct within this conversation instead of throwing and
      // forcing a full restart on the next Orchestrator retry.
      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: submitBlock.id,
            content: `submit_findings input failed validation: ${parsed.error.message}. Re-read the schema and call submit_findings again with the corrected, complete JSON structure — flags must be an actual array of objects, each with type/section/description as strings, never a flattened string.`,
            is_error: true,
          },
        ],
      });
      continue;
    }

    messages.push({
      role: "user",
      content: "Call submit_findings now with your findings (an empty array is fine if you found nothing).",
    });
  }

  throw new Error("Critic Agent failed to produce findings within max attempts");
}
