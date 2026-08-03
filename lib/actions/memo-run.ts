"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { therapyProfileSchema } from "@/lib/validations/therapy-profile";
import { checkRateLimit, getClientKey, RateLimitError } from "@/lib/rate-limit";
import { requireSession, UnauthorizedError } from "@/lib/require-session";

export type CreateMemoRunState = {
  errors?: Partial<Record<"target" | "modality" | "stage" | "indication" | "context", string[]>>;
  message?: string;
};

// Cheap on its own (just a DB row — the real cost happens at "Run
// Assessment," already limited in run-assessment.ts), but a generous bound
// still guards against scripted DB spam.
const CREATE_MEMO_RUN_LIMIT = { maxRequests: 20, windowMs: 60 * 1000 };

// Story 1 (USER_STORIES.md): validates input and creates the run. Kicking off
// the Orchestrator Agent happens in a later phase (AGENT_PLAN.md §4.1) — for now
// this just persists the therapy profile and routes to the run's page.
export async function createMemoRun(
  _prevState: CreateMemoRunState,
  formData: FormData
): Promise<CreateMemoRunState> {
  try {
    await requireSession();
    checkRateLimit(await getClientKey(), CREATE_MEMO_RUN_LIMIT);
  } catch (err) {
    if (err instanceof UnauthorizedError) return { message: err.message };
    if (err instanceof RateLimitError) return { message: err.message };
    throw err;
  }

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
