"use server";

import { getAgentProgress } from "@/lib/agents/persist";

// Polled directly from components/agent-progress.tsx on an interval — a
// plain Server Action is callable from client code without a route
// handler, same idiom this app already uses for mutations.
export async function getAgentProgressForPolling(memoRunId: string) {
  return getAgentProgress(memoRunId);
}
