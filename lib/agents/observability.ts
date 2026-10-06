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

// Reconstructs a trace URL from a persisted session_id — a pure local
// string computation (langfuse.trace().getTraceUrl() makes no network
// call, same as how orchestrator.ts already calls it unawaited), not a
// fresh trace. Takes LANGFUSE_BASEURL from whatever environment this is
// actually running in at render time, so a memo viewed from a different
// environment than the one it was generated in still resolves correctly —
// deliberately not persisting a baked-in URL for that reason. Returns null
// if Langfuse isn't configured (nothing to link to) or no session was
// recorded (e.g. a run from before this feature existed).
export function getTraceUrlForSession(sessionId: string | null): string | null {
  if (!sessionId || !isLangfuseConfigured()) return null;
  return langfuse.trace({ id: sessionId }).getTraceUrl();
}
