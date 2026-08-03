// PDF text extraction for the "supplementary documents" feature — a user
// can attach real company-provided PDFs (data room materials, internal
// decks) before running an assessment, and every research agent gets the
// extracted text as additional context. Deliberately ephemeral: this file
// only ever turns bytes into a string in memory. Nothing here writes a
// file to disk or a database — see run-assessment.ts, which extracts text
// before scheduling the actual agent run and never holds onto the
// original file bytes past that point.
//
// unpdf, not pdf-parse — pdf-parse's latest major pulls in @napi-rs/canvas
// (a native binary dependency) even though this only needs text
// extraction, not rendering. unpdf wraps pdfjs-dist for text-only
// extraction with canvas as an optional peer dependency we never trigger —
// confirmed by installing it and checking npm did NOT pull in
// @napi-rs/canvas, and this project deploys on a `node:22-alpine` (musl
// libc) container where an unnecessary native dependency is exactly the
// kind of thing that silently fails to install or load at runtime.
// Verified live against a real 22-page, 578KB FDA guidance PDF — correct
// page count, correct extracted text, no crash (a few benign pdfjs
// warnings about an unrelated newer JS Math API and font substitution,
// neither of which affected the extracted text).

import { extractText, getDocumentProxy } from "unpdf";

// Bounds worst-case prompt size/cost across every agent this context gets
// injected into (6 research agents, each with their own system prompt and
// research already) — a cap here, not just a UI file-size limit, since a
// PDF's byte size doesn't linearly predict its extracted text length.
export const MAX_EXTRACTED_CHARS_PER_FILE = 50_000;

export type PdfExtractResult =
  | { ok: true; text: string; truncated: boolean }
  | { ok: false; error: string };

export async function extractPdfText(buffer: ArrayBuffer): Promise<PdfExtractResult> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    const trimmed = text.trim();
    if (!trimmed) {
      return { ok: false, error: "No extractable text found (likely a scanned image with no text layer)." };
    }
    const truncated = trimmed.length > MAX_EXTRACTED_CHARS_PER_FILE;
    return {
      ok: true,
      text: truncated ? trimmed.slice(0, MAX_EXTRACTED_CHARS_PER_FILE) : trimmed,
      truncated,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not parse PDF: ${message}` };
  }
}
