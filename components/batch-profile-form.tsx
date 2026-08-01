"use client";

import { useActionState, useState } from "react";
import { ArrowRight, CircleAlert, Plus, X } from "lucide-react";
import { createBatchAssessments, type CreateBatchState } from "@/lib/actions/create-batch";
import { STAGE_OPTIONS, MAX_BATCH_SIZE } from "@/lib/validations/therapy-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: CreateBatchState = {};

let nextRowId = 0;
function makeRow() {
  nextRowId += 1;
  return { id: nextRowId };
}

export function BatchProfileForm() {
  const [state, formAction, pending] = useActionState(createBatchAssessments, initialState);
  const [rows, setRows] = useState(() => [makeRow(), makeRow()]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-[9px] border border-border bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Profile {index + 1}
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((r) => r.filter((x) => x.id !== row.id))}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Remove profile ${index + 1}`}
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Input name="target[]" placeholder="Target, e.g. IL-23 / p19 subunit" required />
              <div className="grid grid-cols-2 gap-2">
                <Input name="modality[]" placeholder="Modality" required />
                <Select name="stage[]">
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select stage" />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGE_OPTIONS.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {stage}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Input name="indication[]" defaultValue="Ulcerative colitis" required />
              <Textarea
                name="context[]"
                placeholder="Additional context — optional"
                className="min-h-16"
              />
            </div>
          </div>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={rows.length >= MAX_BATCH_SIZE}
        onClick={() => setRows((r) => [...r, makeRow()])}
        className="w-full rounded-[9px]"
      >
        <Plus className="size-4" />
        Add another profile
      </Button>

      <label className="flex items-start gap-2.5 rounded-[9px] border border-border bg-white px-3 py-2.5 text-sm has-[:checked]:border-brand-navy/30 has-[:checked]:bg-blue-50/50">
        <input type="checkbox" name="deepResearch" className="mt-0.5 size-4 shrink-0 accent-brand-navy" />
        <span>
          <span className="font-medium text-foreground">Deep research mode for this batch</span>
          <span className="block text-xs text-muted-foreground">
            Applies to every profile in this batch. Slower per run, more accurate.
          </span>
        </span>
      </label>

      {state.error && (
        <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
          <CircleAlert className="size-4" />
          {state.error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending}
        className="h-11 w-full rounded-[9px] bg-brand-navy text-base font-semibold text-white hover:bg-brand-navy/90"
      >
        {pending ? "Queuing…" : `Queue ${rows.length} Assessment${rows.length === 1 ? "" : "s"}`}
        {!pending && <ArrowRight className="size-4" />}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        Runs 2 at a time in the background — check{" "}
        <a href="/assessments" className="underline underline-offset-2">
          Assessments
        </a>{" "}
        for progress. No need to keep this tab open.
      </p>
    </form>
  );
}
