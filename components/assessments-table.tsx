"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format-time";
import { RUN_STATUS_BADGE_STYLES } from "@/lib/memo/run-status";
import { deleteAssessment } from "@/lib/actions/delete-assessment";
import type { AssessmentListItem } from "@/lib/agents/persist";

const MAX_COMPARE_SELECTION = 2;

const OPPORTUNITY_STYLES: Record<string, string> = {
  High: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  Low: "bg-red-50 text-red-700 border-red-200",
};

function DeleteRowButton({ id, target, onDeleted }: { id: string; target: string; onDeleted: (id: string) => void }) {
  const [isPending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Delete assessment for ${target}`} />}
      >
        <Trash2 className="size-3.5 text-muted-foreground hover:text-destructive" />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
          {/* One string expression, not JSX text nodes around {target} — JSX's
              per-line trim-and-join strips the space right after an expression
              when the following text wraps to a new source line. */}
          <AlertDialogDescription>
            {`This permanently deletes the ${target} assessment and everything in it — clinical, competitive, commercial, regulatory, and deal comparables data, citations, and the decision summary. This can't be undone.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={() => {
              startTransition(async () => {
                await deleteAssessment(id);
                onDeleted(id);
              });
            }}
          >
            {isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AssessmentsTable({ rows: initialRows }: { rows: AssessmentListItem[] }) {
  const [rows, setRows] = useState(initialRows);
  const [selected, setSelected] = useState<string[]>([]);
  const router = useRouter();

  function toggleSelected(id: string, checked: boolean) {
    setSelected((prev) => {
      if (checked) {
        return prev.includes(id) ? prev : [...prev, id].slice(-MAX_COMPARE_SELECTION);
      }
      return prev.filter((selectedId) => selectedId !== id);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 && (
        <div className="sticky top-2 z-10 flex items-center justify-between rounded-[9px] border border-brand-navy/20 bg-white px-4 py-2.5 shadow-sm">
          <span className="text-xs text-muted-foreground">
            {selected.length} selected{selected.length < MAX_COMPARE_SELECTION && " — pick 2 to compare"}
          </span>
          <Button
            size="sm"
            disabled={selected.length !== MAX_COMPARE_SELECTION}
            onClick={() => router.push(`/compare?a=${selected[0]}&b=${selected[1]}`)}
          >
            Compare selected
          </Button>
        </div>
      )}

      {rows.map((run) => (
        <div
          key={run.id}
          className="flex items-center gap-2 rounded-[9px] border border-border bg-white pr-2 transition-colors hover:border-brand-navy/30 hover:bg-secondary"
        >
          <Checkbox
            className="ml-4"
            checked={selected.includes(run.id)}
            onCheckedChange={(checked) => toggleSelected(run.id, checked)}
            aria-label={`Select ${run.target} for comparison`}
          />

          <Link href={`/memo/${run.id}`} className="flex min-w-0 flex-1 items-center justify-between gap-4 px-4 py-3 text-sm">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate font-medium text-brand-navy">{run.target}</span>
              <span className="truncate text-xs text-muted-foreground">
                {run.modality} · {run.stage} · {run.indication}
              </span>
            </div>

            <div className="flex shrink-0 items-center gap-3">
              {run.decisionSummary && (
                <>
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-medium",
                      OPPORTUNITY_STYLES[run.decisionSummary.commercialOpportunity] ?? ""
                    )}
                  >
                    {run.decisionSummary.commercialOpportunity}
                  </Badge>
                  <span className="hidden text-xs font-semibold text-brand-navy sm:inline">
                    {run.decisionSummary.confidenceScore.toFixed(1)}/10
                  </span>
                </>
              )}
              <Badge variant="outline" className={cn("font-medium", RUN_STATUS_BADGE_STYLES[run.status])}>
                {run.status}
              </Badge>
              <span className="hidden w-16 shrink-0 text-right text-xs text-muted-foreground sm:inline">
                {relativeTime(run.createdAt.toISOString())}
              </span>
            </div>
          </Link>

          <DeleteRowButton
            id={run.id}
            target={run.target}
            onDeleted={(id) => {
              setRows((prev) => prev.filter((row) => row.id !== id));
              setSelected((prev) => prev.filter((selectedId) => selectedId !== id));
            }}
          />
        </div>
      ))}
    </div>
  );
}
