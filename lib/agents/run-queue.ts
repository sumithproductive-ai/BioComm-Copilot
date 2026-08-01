// Caps how many full assessment pipelines run at once, system-wide — each
// pipeline fires up to 6+ concurrent Anthropic API calls of its own (one per
// research agent), so running many assessments simultaneously would risk
// blowing through Anthropic's rate limits / cost budget in one burst. Both
// the single "Run Assessment" button (run-assessment.ts) and batch
// submissions (create-batch.ts) schedule their actual execution through this
// same shared queue, so a batch and a manual run compete fairly for the same
// capacity rather than each assuming they have the whole budget to themselves.
//
// Reuses the generic maxConcurrent+pacing queue built for per-external-API
// rate limiting (lib/agents/tools/rate-limiter.ts) — the concurrency-limiting
// logic is identical, just applied to whole pipeline runs instead of a
// single HTTP host.
//
// Deliberately in-memory only, not a durable job table — acceptable for this
// PoC-scale deployment (a single always-on Azure Container App instance, not
// a serverless fleet), but a real limitation worth knowing: a redeploy or
// crash mid-batch loses any not-yet-started queued runs (already-started runs
// that got far enough still have their partial progress persisted, same as
// any other run failure).
import { createRateLimiter } from "./tools/rate-limiter";

export const assessmentRunQueue = createRateLimiter({ maxConcurrent: 2, minIntervalMs: 0 });
