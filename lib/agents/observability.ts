// Langfuse wiring — AGENT_PLAN.md §6.2 / Story 14 (USER_STORIES.md).
// session_id is generated once at the Orchestrator and every downstream
// agent call, tool call, and retry is a nested span under that one trace,
// so a complete run is inspectable end-to-end from a single trace URL.

import { Langfuse } from "langfuse";

// Reads LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY / LANGFUSE_BASEURL from env
// automatically — note it's LANGFUSE_BASEURL (no underscore before "URL"),
// not the more intuitive LANGFUSE_HOST; get this wrong and the SDK silently
// falls back to its default host instead of erroring, which reads exactly
// like a bad API key. Constructed once and reused (the SDK batches/flushes
// internally; a fresh client per call would defeat that).
export const langfuse = new Langfuse();

export function isLangfuseConfigured(): boolean {
  return Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY);
}
