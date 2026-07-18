"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, Loader2, XCircle } from "lucide-react";
import { runAssessment, type RunAssessmentState } from "@/lib/actions/run-assessment";
import { getAgentProgressForPolling } from "@/lib/actions/agent-progress";
import { AGENT_ROSTER, type AgentLiveStatus } from "@/lib/agents/roster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const initialState: RunAssessmentState = {};

const POLL_INTERVAL_MS = 2500;

type AgentRow = { agentName: string; status: AgentLiveStatus; attempt: number };

function isTerminal(status: AgentLiveStatus): boolean {
  return status === "Complete" || status === "Failed";
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function StatusIcon({ status }: { status: AgentLiveStatus }) {
  switch (status) {
    case "Complete":
      return <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />;
    case "Running":
      return <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" />;
    case "Failed":
      return <XCircle className="size-4 shrink-0 text-red-600" />;
    case "Queued":
    default:
      return <span className="block size-4 shrink-0 rounded-full border-2 border-slate-300" />;
  }
}

const STATUS_BADGE_STYLES: Record<AgentLiveStatus, string> = {
  Queued: "border-border bg-slate-50 text-muted-foreground",
  Running: "border-blue-200 bg-blue-50 text-blue-700",
  Complete: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Failed: "border-red-200 bg-red-50 text-red-700",
};

type AgentProgressData = {
  assessmentStartedAt: Date | null;
  agentProgress: { agentName: string; status: string; attempt: number }[];
} | null;

function rowsFromData(data: AgentProgressData): AgentRow[] {
  const byName = new Map(data?.agentProgress.map((row) => [row.agentName, row]) ?? []);
  return AGENT_ROSTER.map((agent) => {
    const row = byName.get(agent.key);
    return {
      agentName: agent.key,
      status: (row?.status as AgentLiveStatus) ?? "Queued",
      attempt: row?.attempt ?? 0,
    };
  });
}

// Story 2 — the live "Agent Pipeline" view. Renders the trigger button when
// no run has started yet; once started, polls AgentProgress rows and shows
// per-agent status until every agent is terminal, then does a hard reload
// so the now-complete memo sections render (router.refresh() alone was
// confirmed unreliable for picking up fresh data in this app's dev setup —
// see the note this replaced in the old blocking runAssessment).
export function AgentProgressSection({
  memoRunId,
  initialData,
}: {
  memoRunId: string;
  initialData: AgentProgressData;
}) {
  const boundAction = runAssessment.bind(null, memoRunId);
  const [actionState, formAction, pending] = useActionState(boundAction, initialState);
  const [data, setData] = useState<AgentProgressData>(initialData);
  const [now, setNow] = useState(() => Date.now());
  // initialData is a snapshot from the page load that rendered this
  // "not started" button — it never reflects the Queued rows
  // initializeAgentProgress just wrote once the action resolves. Track
  // submission explicitly and poll immediately, don't wait on stale props.
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const wasPendingRef = useRef(false);

  useEffect(() => {
    if (wasPendingRef.current && !pending) setHasSubmitted(true);
    wasPendingRef.current = pending;
  }, [pending]);

  const started = hasSubmitted || (!!data && data.agentProgress.length > 0);
  const rows = rowsFromData(data);
  const allTerminal = started && rows.every((row) => isTerminal(row.status));

  useEffect(() => {
    if (!started || allTerminal) return;
    let cancelled = false;
    async function poll() {
      const fresh = await getAgentProgressForPolling(memoRunId);
      if (!cancelled) setData(fresh);
    }
    poll();
    const interval = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [memoRunId, started, allTerminal]);

  useEffect(() => {
    if (!started || allTerminal) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [started, allTerminal]);

  useEffect(() => {
    if (allTerminal) window.location.reload();
  }, [allTerminal]);

  if (!started) {
    return (
      <form action={formAction} className="flex flex-col gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-[9px] bg-brand-navy text-base font-semibold text-white hover:bg-brand-navy/90"
        >
          {pending ? "Starting assessment…" : "Run Assessment"}
          {!pending && <ArrowRight className="size-4" />}
        </Button>
        {actionState.error && (
          <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <CircleAlert className="size-4" />
            {actionState.error}
          </p>
        )}
      </form>
    );
  }

  const completeCount = rows.filter((row) => row.status === "Complete").length;
  const elapsedMs = data?.assessmentStartedAt ? now - new Date(data.assessmentStartedAt).getTime() : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-semibold tracking-wide uppercase">
          {completeCount} / {rows.length} complete
        </span>
        <span className="tabular-nums">Elapsed {formatElapsed(elapsedMs)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {rows.map((row) => {
          const roster = AGENT_ROSTER.find((agent) => agent.key === row.agentName);
          return (
            <div
              key={row.agentName}
              className={cn(
                "flex items-center justify-between gap-3 rounded-[9px] border border-border bg-white px-3 py-2",
                row.status === "Running" && "border-blue-200"
              )}
            >
              <div className="flex items-center gap-2.5">
                <StatusIcon status={row.status} />
                <span className={cn("text-sm", row.status === "Running" ? "font-semibold text-brand-navy" : "text-foreground")}>
                  {roster?.label ?? row.agentName}
                </span>
                {row.attempt > 0 && (
                  <span className="text-xs text-muted-foreground">retry {row.attempt}</span>
                )}
              </div>
              <Badge variant="outline" className={cn("font-medium", STATUS_BADGE_STYLES[row.status])}>
                {row.status}
              </Badge>
            </div>
          );
        })}
      </div>
    </div>
  );
}
