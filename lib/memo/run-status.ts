import type { AgentLiveStatus } from "@/lib/agents/roster";

// MemoRun has no dedicated status column (see prisma/schema.prisma) — status
// is always derived from whether Synthesis has produced a DecisionSummary
// and, if not, whether any AgentProgress row for this run is Failed. Same
// logic app/memo/[id]/page.tsx already computes inline (hasDecisionSummary /
// hasStartedRun); this is the single reusable version for list/compare views
// that need the full four-state picture, including Failed.
export type RunStatus = "Queued" | "In Progress" | "Complete" | "Failed";

export function deriveRunStatus(run: {
  decisionSummary: unknown | null;
  agentProgress: { status: AgentLiveStatus | string }[];
}): RunStatus {
  if (run.decisionSummary) return "Complete";
  if (run.agentProgress.some((row) => row.status === "Failed")) return "Failed";
  if (run.agentProgress.length > 0) return "In Progress";
  return "Queued";
}

export const RUN_STATUS_BADGE_STYLES: Record<RunStatus, string> = {
  Queued: "border-border bg-slate-50 text-muted-foreground",
  "In Progress": "border-blue-200 bg-blue-50 text-blue-700",
  Complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Failed: "border-red-200 bg-red-50 text-red-700",
};
