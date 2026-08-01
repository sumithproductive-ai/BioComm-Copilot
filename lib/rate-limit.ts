// Per-client rate limiting for Server Actions — security hardening item,
// not agent-tool rate limiting (see lib/agents/tools/rate-limiter.ts for
// that, a different concern: pacing outbound calls to external APIs).
//
// No auth exists yet (Google OAuth is next on the roadmap), and
// /assessments is explicitly "shared across the team" with no login wall —
// so the only identity available to key a limit on is the client's IP.
// Deliberately in-memory (same acceptable tradeoff as assessmentRunQueue):
// this is a single always-on Azure Container App instance, not a
// horizontally-scaled fleet, so there's one process for the limiter state
// to live in. A restart resets everyone's window, which is fine for abuse
// prevention (the threat model is "don't let one client burn the whole
// Anthropic budget or mass-delete the team's assessments," not "enforce an
// exact global quota").

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();

// Sweep old buckets on every call instead of a separate timer — bounded
// enough at this traffic scale, avoids a background interval to manage.
function sweep(now: number, maxWindowMs: number) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > maxWindowMs) buckets.delete(key);
  }
}

export class RateLimitError extends Error {
  constructor(message = "Too many requests — please wait a moment and try again.") {
    super(message);
    this.name = "RateLimitError";
  }
}

export function checkRateLimit(
  key: string,
  { maxRequests, windowMs }: { maxRequests: number; windowMs: number }
): void {
  const now = Date.now();
  sweep(now, windowMs);

  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return;
  }
  if (bucket.count >= maxRequests) {
    throw new RateLimitError();
  }
  bucket.count += 1;
}

// Azure Container Apps' ingress sets x-forwarded-for; fall back to a
// constant key (effectively a global limit) if it's ever missing rather
// than throwing — a missing header shouldn't take the action down, and a
// shared fallback key still bounds worst-case abuse.
export async function getClientKey(): Promise<string> {
  const { headers } = await import("next/headers");
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "unknown-client";
}
