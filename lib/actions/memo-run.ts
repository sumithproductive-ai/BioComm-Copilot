"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { therapyProfileSchema } from "@/lib/validations/therapy-profile";

export type CreateMemoRunState = {
  errors?: Partial<Record<"target" | "modality" | "stage" | "indication" | "context", string[]>>;
  message?: string;
};

// Story 1 (USER_STORIES.md): validates input and creates the run. Kicking off
// the Orchestrator Agent happens in a later phase (AGENT_PLAN.md §4.1) — for now
// this just persists the therapy profile and routes to the run's page.
export async function createMemoRun(
  _prevState: CreateMemoRunState,
  formData: FormData
): Promise<CreateMemoRunState> {
  const parsed = therapyProfileSchema.safeParse({
    target: formData.get("target"),
    modality: formData.get("modality"),
    stage: formData.get("stage"),
    indication: formData.get("indication"),
    context: formData.get("context") || undefined,
  });

  if (!parsed.success) {
    return {
      errors: parsed.error.flatten().fieldErrors,
      message: "Fix the highlighted fields and try again.",
    };
  }

  const memoRun = await db.memoRun.create({
    data: parsed.data,
  });

  redirect(`/memo/${memoRun.id}`);
}
