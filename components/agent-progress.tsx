"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, CircleAlert, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { runAssessment, type RunAssessmentState } from "@/lib/actions/run-assessment";
import { getAgentProgressForPolling } from "@/lib/actions/agent-progress";
import { AGENT_ROSTER, type AgentLiveStatus } from "@/lib/agents/roster";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const initialState: RunAssessmentState = {};

const POLL_INTERVAL_MS = 2500;

// Mirrors lib/actions/run-assessment.ts's server-side limits — client-side
// enforcement here is just a faster feedback loop, the server re-validates
// regardless (never trust a client-side check alone).
const MAX_DOCUMENT_COUNT = 5;
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Uploaded PDFs are never saved (see lib/pdf-extract.ts) — read once,
// extracted to text as additional context for every research agent, then
// discarded. A single native multi-file input, not a custom picker — file
// inputs can't have their selection set programmatically (a browser
// security restriction), so per-file remove buttons would need a
// DataTransfer workaround; a plain native input is simpler and just as
// usable (re-opening the picker replaces the selection).
function DocumentUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  function handleChange(fileList: FileList | null) {
    const selected = Array.from(fileList ?? []);
    const oversized = selected.filter((f) => f.size > MAX_DOCUMENT_BYTES);
    const tooMany = selected.length > MAX_DOCUMENT_COUNT;
    setError(
      oversized.length > 0
        ? `${oversized.map((f) => f.name).join(", ")} exceeds the 15 MB per-file limit — remove it and reselect.`
        : tooMany
          ? `Only the first ${MAX_DOCUMENT_COUNT} files will be used.`
          : null
    );
    setFiles(selected.slice(0, MAX_DOCUMENT_COUNT));
  }

  return (
    <div className="rounded-[9px] border border-border bg-white px-3 py-2.5">
      <label className="flex cursor-pointer items-start justify-between gap-2">
        <div>
          <span className="text-sm font-medium text-foreground">Supplementary documents</span>
          <span className="block text-xs text-muted-foreground">
            Optional — add up to {MAX_DOCUMENT_COUNT} PDFs (data room materials, internal decks) for
            additional context. Read once for this run, never saved. Each file up to{" "}
            {formatBytes(MAX_DOCUMENT_BYTES)}; across all files combined, roughly the first 20-25 pages of
            text are used. If anything is skipped or trimmed to fit, we&apos;ll note exactly what on the
            results page.
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-[9px] border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-brand-navy hover:bg-slate-50">
          <Upload className="size-3.5" />
          Choose PDFs
        </span>
        <input
          type="file"
          name="documents"
          accept="application/pdf"
          multiple
          className="hidden"
          onChange={(e) => handleChange(e.target.files)}
        />
      </label>

      {files.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {files.map((file, i) => (
            <li
              key={`${file.name}-${i}`}
              className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1 text-xs text-foreground"
            >
              <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">({formatBytes(file.size)})</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
    </div>
  );
}

type AgentRow = { agentName: string; status: AgentLiveStatus; attempt: number; note: string | null };

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
  agentProgress: { agentName: string; status: string; attempt: number; note: string | null }[];
} | null;

function rowsFromData(data: AgentProgressData): AgentRow[] {
  const byName = new Map(data?.agentProgress.map((row) => [row.agentName, row]) ?? []);
  return AGENT_ROSTER.map((agent) => {
    const row = byName.get(agent.key);
    return {
      agentName: agent.key,
      status: (row?.status as AgentLiveStatus) ?? "Queued",
      attempt: row?.attempt ?? 0,
      note: row?.note ?? null,
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
  const anyFailed = rows.some((row) => row.status === "Failed");
  // Reload only on a genuine full success — reloading a failed run would
  // just re-render the same stuck-looking progress list (nothing was
  // persisted to show), and since a fresh page load already sees the
  // terminal Failed rows in its initial data, reloading on any terminal
  // state (the previous behavior) caused an immediate reload-on-mount loop
  // the moment a run failed. Confirmed live (comprehensive review,
  // 2026-07-25): a rejected indication left every agent stuck at "Queued"
  // forever before this fix existed at all — this is the other half of
  // that fix, once run-assessment.ts actually starts writing "Failed".
  const allComplete = started && rows.every((row) => row.status === "Complete");

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
    if (allComplete) window.location.reload();
  }, [allComplete]);

  if (!started) {
    return (
      <form action={formAction} className="flex flex-col gap-3">
        <DocumentUpload />
        <label className="flex items-start gap-2.5 rounded-[9px] border border-border bg-white px-3 py-2.5 text-sm has-[:checked]:border-brand-navy/30 has-[:checked]:bg-blue-50/50">
          <input
            type="checkbox"
            name="deepResearch"
            className="mt-0.5 size-4 shrink-0 accent-brand-navy"
          />
          <span>
            <span className="font-medium text-foreground">Deep research mode</span>
            <span className="block text-xs text-muted-foreground">
              After the first review pass, any agent Critic flags a real problem with gets a second,
              targeted research round before the memo is finalized. Slower (roughly 1.5–2x), more
              accurate.
            </span>
          </span>
        </label>
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
      {anyFailed && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <CircleAlert className="size-4 shrink-0" />
          This assessment failed — see the failed agent(s) below for details. Start a new assessment to try again.
        </p>
      )}

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
                "flex flex-col gap-1 rounded-[9px] border border-border bg-white px-3 py-2",
                row.status === "Running" && "border-blue-200",
                row.status === "Failed" && "border-red-200"
              )}
            >
              <div className="flex items-center justify-between gap-3">
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
              {row.status === "Failed" && row.note && (
                <p className="pl-6 text-xs text-destructive">{row.note}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
