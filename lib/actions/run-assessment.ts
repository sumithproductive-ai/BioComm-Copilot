"use server";

import { after } from "next/server";
import { db } from "@/lib/db";
import { executeAssessmentRun } from "@/lib/agents/run-executor";
import { assessmentRunQueue } from "@/lib/agents/run-queue";
import { checkRateLimit, getClientKey, RateLimitError } from "@/lib/rate-limit";
import { requireSession, UnauthorizedError } from "@/lib/require-session";
import { extractPdfText } from "@/lib/pdf-extract";

export type RunAssessmentState = {
  error?: string;
};

// Each run costs real Anthropic API spend across up to 8 agents — bounds
// how many full pipelines one client can kick off in a burst. Still IP-keyed
// even now that Google OAuth exists (lib/rate-limit.ts) — a compromised or
// careless allowlisted account is still worth bounding, not just anonymous
// traffic.
const RUN_ASSESSMENT_LIMIT = { maxRequests: 5, windowMs: 10 * 60 * 1000 };

// Supplementary document upload limits — bounds both request size and the
// combined cost across all 6 research agents that receive the extracted
// text (see lib/agents/supplementary-documents.ts). The combined cap is a
// *total* across every uploaded file, not per-file × count — a real risk
// flagged in review: this text gets duplicated into 6 separate agent
// prompts, so an uncapped total multiplies fast. 80k combined chars (~20k
// tokens) × 6 agents is already a meaningful addition to a run's cost; a
// higher cap wasn't worth the latency/spend for what's meant to be
// supplementary context, not the primary research input.
const MAX_DOCUMENT_COUNT = 5;
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024; // 15MB, per file, raw PDF size
const MAX_COMBINED_EXTRACTED_CHARS = 80_000;

type DocumentExtractionResult = {
  text: string | undefined;
  count: number;
  // Human-readable summary of anything skipped or truncated — surfaced to
  // the user (persisted on MemoRun, shown on the memo page), not just
  // logged. A silent drop is exactly the wrong failure mode for an app
  // whose whole premise is "know what data actually went into this."
  note: string | undefined;
};

// Reads any uploaded PDFs from the form, extracts their text, and returns
// one combined string ready to inject into every agent's prompt. Files
// themselves are never written anywhere — read into memory
// (`file.arrayBuffer()`), parsed, and the ArrayBuffer/File references are
// dropped once this returns. A file that fails to parse (scanned image,
// corrupt, oversized) is skipped rather than failing the whole assessment —
// one bad PDF among several good ones shouldn't block the run — but every
// skip and every truncation is recorded in the returned note, not just
// logged server-side.
async function extractSupplementaryDocuments(formData: FormData): Promise<DocumentExtractionResult> {
  const allFiles = formData
    .getAll("documents")
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  const files = allFiles.slice(0, MAX_DOCUMENT_COUNT);
  const overflow = allFiles.slice(MAX_DOCUMENT_COUNT);

  if (files.length === 0) return { text: undefined, count: 0, note: undefined };

  const sections: string[] = [];
  const issues: string[] = [];
  let usedChars = 0;
  let successCount = 0;

  for (const file of overflow) {
    issues.push(`"${file.name}" not used (more than ${MAX_DOCUMENT_COUNT} files uploaded)`);
  }

  for (const file of files) {
    if (file.size > MAX_DOCUMENT_BYTES) {
      issues.push(`"${file.name}" not used (exceeds ${MAX_DOCUMENT_BYTES / (1024 * 1024)}MB limit)`);
      continue;
    }
    if (usedChars >= MAX_COMBINED_EXTRACTED_CHARS) {
      issues.push(`"${file.name}" not used (combined document size budget already used)`);
      continue;
    }

    const result = await extractPdfText(await file.arrayBuffer());
    if (!result.ok) {
      issues.push(`"${file.name}" not used (${result.error})`);
      continue;
    }

    const remaining = MAX_COMBINED_EXTRACTED_CHARS - usedChars;
    const wasTruncated = result.truncated || result.text.length > remaining;
    const text = result.text.length > remaining ? result.text.slice(0, remaining) : result.text;
    if (wasTruncated) {
      issues.push(`"${file.name}" was truncated (only part of it fit within the size budget)`);
    }
    sections.push(`Document: ${file.name}\n${text}`);
    usedChars += text.length;
    successCount += 1;
  }

  const note = issues.length > 0 ? issues.join("; ") : undefined;
  if (sections.length === 0) return { text: undefined, count: 0, note };
  return { text: sections.join("\n\n---\n\n"), count: successCount, note };
}

// Triggered from the memo page. Fast path only: returns almost immediately
// and schedules the actual ~2-4min (or longer, in Deep Research Mode) run
// through assessmentRunQueue inside Next.js's after() — Story 2's live
// progress screen (components/agent-progress.tsx) polls AgentProgress rows
// for the rest and refreshes the page once every agent reaches a terminal
// state. Routing through the same queue batch submissions use
// (lib/actions/create-batch.ts) means a manual run and a batch fairly share
// the same system-wide concurrency cap instead of each assuming unlimited
// capacity.
//
// Supplementary PDFs (if any) are extracted to text here, before after() —
// extraction is fast (a few seconds even for a large multi-page PDF,
// confirmed live against a real 22-page document) so it doesn't meaningfully
// delay the fast-return, and it means only a plain string ever crosses into
// the deferred closure, never a File or ArrayBuffer.
export async function runAssessment(
  memoRunId: string,
  _prevState: RunAssessmentState,
  formData: FormData
): Promise<RunAssessmentState> {
  try {
    await requireSession();
    checkRateLimit(await getClientKey(), RUN_ASSESSMENT_LIMIT);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    if (err instanceof RateLimitError) return { error: err.message };
    throw err;
  }

  const memoRun = await db.memoRun.findUnique({ where: { id: memoRunId } });
  if (!memoRun) {
    return { error: "Run not found." };
  }

  const deepResearch = formData.get("deepResearch") === "on";
  const {
    text: supplementaryDocuments,
    count: supplementaryDocumentCount,
    note: supplementaryDocumentNote,
  } = await extractSupplementaryDocuments(formData);

  after(() =>
    assessmentRunQueue(() =>
      executeAssessmentRun(
        memoRun,
        deepResearch,
        supplementaryDocuments,
        supplementaryDocumentCount,
        supplementaryDocumentNote
      )
    )
  );

  return {};
}
