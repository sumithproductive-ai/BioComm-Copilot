"use client";

import { useActionState } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { runAssessment, type RunAssessmentState } from "@/lib/actions/run-assessment";
import { Button } from "@/components/ui/button";

const initialState: RunAssessmentState = {};

// On success the action redirects (forces a fresh navigation so the new
// Postgres rows actually render — revalidatePath + router.refresh() alone
// were confirmed not to pick up fresh data reliably in dev). This
// component only ever sees state on the error path; success never returns.
export function RunAssessmentButton({ memoRunId }: { memoRunId: string }) {
  const boundAction = runAssessment.bind(null, memoRunId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-[9px] bg-brand-navy text-base font-semibold text-white hover:bg-brand-navy/90"
      >
        {pending ? "Researching clinical landscape… (about a minute)" : "Run Clinical Research"}
        {!pending && <ArrowRight className="size-4" />}
      </Button>
      {state.error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <CircleAlert className="size-4" />
          {state.error}
        </p>
      )}
      {state.traceUrl && (
        <a
          href={state.traceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-muted-foreground underline underline-offset-2"
        >
          View Langfuse trace
        </a>
      )}
    </form>
  );
}
