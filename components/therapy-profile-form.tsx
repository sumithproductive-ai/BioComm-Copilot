"use client";

import { useActionState } from "react";
import { ArrowRight, CircleAlert } from "lucide-react";
import { createMemoRun, type CreateMemoRunState } from "@/lib/actions/memo-run";
import { STAGE_OPTIONS } from "@/lib/validations/therapy-profile";
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

const initialState: CreateMemoRunState = {};

// Agent roster the memo will run — AGENT_PLAN.md §2 (5 research agents + Critic;
// Orchestrator and Synthesis coordinate/compile and aren't user-facing here).
const AGENTS = [
  "Clinical Research",
  "Competitive Intelligence",
  "Commercial Opportunity",
  "Deal Comparables",
  "Regulatory",
  "Critic Review",
];

function FieldLabel({
  htmlFor,
  children,
  optional,
}: {
  htmlFor: string;
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
    >
      {children}
      {optional && (
        <span className="ml-1 font-normal normal-case text-muted-foreground/70">
          — optional
        </span>
      )}
    </label>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

export function TherapyProfileForm() {
  const [state, formAction, pending] = useActionState(createMemoRun, initialState);

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="target">Target</FieldLabel>
          <Input
            id="target"
            name="target"
            placeholder="e.g. IL-23 / p19 subunit"
            aria-invalid={!!state.errors?.target}
            required
          />
          <FieldError message={state.errors?.target?.[0]} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="modality">Modality</FieldLabel>
            <Input
              id="modality"
              name="modality"
              placeholder="e.g. Monoclonal antibody"
              aria-invalid={!!state.errors?.modality}
              required
            />
            <FieldError message={state.errors?.modality?.[0]} />
          </div>

          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="stage">Stage</FieldLabel>
            <Select name="stage">
              <SelectTrigger
                id="stage"
                aria-invalid={!!state.errors?.stage}
                className="w-full"
              >
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
            <FieldError message={state.errors?.stage?.[0]} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="indication">Indication</FieldLabel>
          <Input
            id="indication"
            name="indication"
            defaultValue="Ulcerative colitis"
            aria-invalid={!!state.errors?.indication}
            required
          />
          <FieldError message={state.errors?.indication?.[0]} />
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel htmlFor="context" optional>
            Additional context
          </FieldLabel>
          <Textarea
            id="context"
            name="context"
            placeholder="Company name, mechanism notes, anything else worth flagging"
            aria-invalid={!!state.errors?.context}
          />
          <FieldError message={state.errors?.context?.[0]} />
        </div>

        {state.message && (
          <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
            <CircleAlert className="size-4" />
            {state.message}
          </p>
        )}

        <Button
          type="submit"
          disabled={pending}
          className="h-11 w-full rounded-[9px] bg-brand-navy text-base font-semibold text-white hover:bg-brand-navy/90"
        >
          {pending ? "Starting assessment…" : "Generate Assessment"}
          {!pending && <ArrowRight className="size-4" />}
        </Button>
      </form>

      <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Runs in real time — findings appear as each agent completes.
      </p>

      <div className="flex flex-col items-center gap-3 border-t border-border pt-5">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground/80 uppercase">
          {AGENTS.length} agents deploy
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {AGENTS.map((agent) => (
            <span
              key={agent}
              className="rounded-md border border-border bg-white px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {agent}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
