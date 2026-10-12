// Zero-cost local test mode — every run*Agent function checks
// isMockAgentsEnabled() before making any Anthropic API call, and returns a
// schema-valid fixture instead. Exists because local development/testing
// was spending real API cost (~$8/run across 9 agents) on every pipeline
// run, including runs that only exercise UI/plumbing changes unrelated to
// research quality (see lib/agents/rnpv.ts's mock branch for the one
// exception that matters most: it still runs the real deterministic
// computeRnpv()/applyFinancialAssumptionsOverride(), so feature work on the
// calculator itself is still genuinely tested, just without paying for the
// LLM's assumption-drafting).
//
// Gated on NODE_ENV too, not just the env flag alone — same defense-in-depth
// posture as SKIP_AUTH_FOR_LOCAL_TEST (lib/require-session.ts, proxy.ts):
// Next.js sets NODE_ENV to "production" for every real build/deploy itself
// (not overridable via .env), so this can never silently activate in a
// deployed environment even if the flag leaked into one.
export function isMockAgentsEnabled(): boolean {
  return process.env.MOCK_AGENTS_FOR_LOCAL_TEST === "true" && process.env.NODE_ENV !== "production";
}

export function mockCitation(sourceType: import("./schemas").CitationRef["sourceType"] = "Other") {
  return {
    sourceType,
    sourceUrl: "https://example.com/mock-source-for-local-test-mode",
    accessedDate: new Date().toISOString().slice(0, 10),
  };
}
