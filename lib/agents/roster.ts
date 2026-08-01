// Canonical agent roster — AGENT_PLAN.md §2's original 7 tracked agents plus
// the Patent Agent, added post-launch (Orchestrator coordinates but isn't
// itself tracked). Single source of truth for display order/labels so the
// pre-run agent list (therapy-profile-form.tsx) and the live progress screen
// (agent-progress.tsx) can't drift apart. `key` values match the `name`
// strings orchestrator.ts already passes to onAgentStatusChange — no
// translation layer needed between the two.

export type AgentRosterEntry = { key: string; label: string };

// Story 2's own vocabulary — deliberately not the Prisma-generated
// AgentRunStatus enum, so orchestrator.ts (which has no Prisma dependency
// anywhere else) doesn't need one just for this callback signature.
export type AgentLiveStatus = "Queued" | "Running" | "Complete" | "Failed";

export const AGENT_ROSTER: AgentRosterEntry[] = [
  { key: "clinical", label: "Clinical Research" },
  { key: "competitive", label: "Competitive Intelligence" },
  { key: "commercial", label: "Commercial Opportunity" },
  { key: "dealComparables", label: "Deal Comparables" },
  { key: "regulatory", label: "Regulatory" },
  { key: "patents", label: "Patent Landscape" },
  { key: "critic", label: "Critic Review" },
  { key: "synthesis", label: "Synthesis" },
];
