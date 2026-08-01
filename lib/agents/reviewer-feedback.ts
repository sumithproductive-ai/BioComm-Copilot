// Shared formatting for Deep Research Mode's Critic-feedback loop
// (orchestrator.ts) — every research agent accepts an optional
// reviewerFeedback list and appends this same block to its initial user
// message when present. Kept in one place so the instruction text (redo the
// full submission, not a diff) stays identical across all 6 agents.

export function formatReviewerFeedback(reviewerFeedback?: string[]): string {
  if (!reviewerFeedback || reviewerFeedback.length === 0) return "";
  return `\n\nA reviewer flagged the following issues with your prior findings on this same asset. Use additional real research to resolve each one specifically, then call submit_findings again with your complete, corrected findings covering the full scope above — not just the changed parts. If, after real research, you still cannot resolve a specific flag, it's fine to leave that finding out or keep its label conservative, but do not ignore the flag silently:\n${reviewerFeedback.map((f) => `- ${f}`).join("\n")}`;
}
