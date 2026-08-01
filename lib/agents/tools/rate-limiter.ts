// Shared per-host rate limiting — AGENT_PLAN.md §5.4: "put a shared
// rate-limiter/queue in front of that MCP tool binding (not per-agent) so
// two agents don't independently double the request rate." fetchWithRetry
// handles *reactive* backoff after a 429; this is the *proactive* half —
// caps concurrency and spaces out request starts per external API, shared
// across every agent that calls the same tool, not one limiter per call.

type Task<T> = () => Promise<T>;

export function createRateLimiter({
  maxConcurrent,
  minIntervalMs,
}: {
  maxConcurrent: number;
  minIntervalMs: number;
}) {
  let active = 0;
  let lastStart = 0;
  const queue: Array<() => void> = [];
  let pumping = false;

  async function pump() {
    if (pumping) return;
    pumping = true;
    while (queue.length > 0 && active < maxConcurrent) {
      const wait = Math.max(0, lastStart + minIntervalMs - Date.now());
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      const runNext = queue.shift();
      if (!runNext) break;
      active++;
      lastStart = Date.now();
      runNext();
    }
    pumping = false;
  }

  return function schedule<T>(fn: Task<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            void pump();
          });
      });
      void pump();
    });
  };
}

// One shared instance per external API, module-scoped so every agent that
// imports the tool wrapper goes through the same queue — not a fresh
// limiter per agent instance, which would defeat the point.

// NCBI documents a 3 req/sec limit for E-utilities without an API key.
export const pubmedLimiter = createRateLimiter({ maxConcurrent: 3, minIntervalMs: 350 });

// ClinicalTrials.gov doesn't publish a strict limit — same conservative
// cap so concurrent agents (Clinical + Competitive both query it) don't
// hammer it simultaneously.
export const clinicalTrialsLimiter = createRateLimiter({ maxConcurrent: 3, minIntervalMs: 350 });

// SEC's Fair Access policy publishes a 10 req/sec ceiling across all of
// sec.gov/data.sec.gov/efts.sec.gov combined — well under that, same
// conservative-pacing reasoning as the other two, and this one's shared
// by two agents (Deal Comparables + Competitive Intelligence) at once.
export const secEdgarLimiter = createRateLimiter({ maxConcurrent: 3, minIntervalMs: 300 });
