// Shared rate-limit/retry handling for the public API tools (ClinicalTrials.gov,
// PubMed) — AGENT_PLAN.md §5.4: "put a shared rate-limiter/queue in front of
// that MCP tool binding... test this explicitly... don't discover it in Week 5."
// We discovered it on the very first real agent run: PubMed's E-utilities
// rate-limits unauthenticated requests. Retries with exponential backoff,
// honoring Retry-After when the API sends one.

const MAX_RETRIES = 4;
const BASE_DELAY_MS = 1000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url, init);

    if (res.ok) return res;

    const isRetryable = res.status === 429 || res.status >= 500;
    if (!isRetryable || attempt === MAX_RETRIES) {
      return res; // let the caller raise its own descriptive error
    }

    const retryAfterHeader = res.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : NaN;
    const backoffMs = Number.isFinite(retryAfterMs)
      ? retryAfterMs
      : BASE_DELAY_MS * 2 ** attempt;

    await sleep(backoffMs);
    lastError = new Error(`${res.status} ${res.statusText}`);
  }

  // Unreachable given the loop above always returns, but keeps TS satisfied.
  throw lastError instanceof Error ? lastError : new Error("fetchWithRetry exhausted retries");
}
