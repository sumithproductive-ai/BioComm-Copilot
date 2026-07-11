"use client";

import { useActionState } from "react";
import { createMemoRun, type CreateMemoRunState } from "@/lib/actions/memo-run";
import { STAGE_OPTIONS } from "@/lib/validations/therapy-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const initialState: CreateMemoRunState = {};

export function TherapyProfileForm() {
  const [state, formAction, pending] = useActionState(createMemoRun, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor="target">Target</Label>
        <Input
          id="target"
          name="target"
          placeholder="e.g. IL-23 / p19 subunit"
          aria-invalid={!!state.errors?.target}
          required
        />
        {state.errors?.target && (
          <p className="text-sm text-destructive">{state.errors.target[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="modality">Modality</Label>
        <Input
          id="modality"
          name="modality"
          placeholder="e.g. Monoclonal antibody"
          aria-invalid={!!state.errors?.modality}
          required
        />
        {state.errors?.modality && (
          <p className="text-sm text-destructive">{state.errors.modality[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="stage">Stage</Label>
        <Select name="stage">
          <SelectTrigger id="stage" aria-invalid={!!state.errors?.stage} className="w-full">
            <SelectValue placeholder="Select a development stage" />
          </SelectTrigger>
          <SelectContent>
            {STAGE_OPTIONS.map((stage) => (
              <SelectItem key={stage} value={stage}>
                {stage}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {state.errors?.stage && (
          <p className="text-sm text-destructive">{state.errors.stage[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="indication">Indication</Label>
        <Input
          id="indication"
          name="indication"
          defaultValue="Ulcerative colitis"
          aria-invalid={!!state.errors?.indication}
          required
        />
        {state.errors?.indication && (
          <p className="text-sm text-destructive">{state.errors.indication[0]}</p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="context">Additional context (optional)</Label>
        <Textarea
          id="context"
          name="context"
          placeholder="Company name, mechanism notes, anything else worth flagging"
          aria-invalid={!!state.errors?.context}
        />
        {state.errors?.context && (
          <p className="text-sm text-destructive">{state.errors.context[0]}</p>
        )}
      </div>

      {state.message && (
        <p className="text-sm text-destructive" role="alert">
          {state.message}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Starting assessment…" : "Start assessment"}
      </Button>
    </form>
  );
}
