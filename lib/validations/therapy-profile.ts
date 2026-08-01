import { z } from "zod";

// PRODUCT_BRIEF.md Input Schema — Stage is constrained to standard trial phases,
// Target/Modality/Indication are free text (the space of possible values is too
// open-ended for a fixed list). Indication defaults to "Ulcerative colitis" since
// v1 is UC-only (PRD.md non-goal #1) — the Orchestrator Agent (AGENT_PLAN.md §4.1)
// is responsible for rejecting/flagging anything outside UC scope; this form only
// checks the field isn't empty.
export const STAGE_OPTIONS = [
  "Preclinical",
  "Phase 1",
  "Phase 2",
  "Phase 3",
  "Approved",
] as const;

export const therapyProfileSchema = z.object({
  target: z.string().trim().min(1, "Target is required"),
  modality: z.string().trim().min(1, "Modality is required"),
  stage: z.enum(STAGE_OPTIONS, { message: "Select a development stage" }),
  indication: z.string().trim().min(1, "Indication is required"),
  context: z
    .string()
    .trim()
    .max(2000, "Keep additional context under 2000 characters")
    .optional(),
});

export type TherapyProfileInput = z.infer<typeof therapyProfileSchema>;

// Batch queue (lib/actions/create-batch.ts) — capped well below anything
// that would let one submission monopolize assessmentRunQueue for hours;
// 10 profiles already means ~5+ full pipeline runs queued behind the
// concurrency cap of 2 at once.
export const MAX_BATCH_SIZE = 10;

export const batchProfileSchema = z
  .array(therapyProfileSchema)
  .min(1, "Add at least one therapy profile")
  .max(MAX_BATCH_SIZE, `Batch submissions are capped at ${MAX_BATCH_SIZE} profiles at once`);
