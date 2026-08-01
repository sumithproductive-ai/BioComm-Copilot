"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";

// Destructive and irreversible (every child table cascades) — no auth yet
// to scope this to "your own" assessments (this app has no login wall, see
// lib/rate-limit.ts), so a generous but real IP-keyed limit bounds a
// scripted mass-delete against the team's shared assessment history.
const DELETE_ASSESSMENT_LIMIT = { maxRequests: 20, windowMs: 60 * 1000 };

// Every child table already has onDelete: Cascade back to MemoRun (see
// prisma/schema.prisma) — a single delete removes the whole assessment,
// no manual fan-out needed.
export async function deleteAssessment(id: string): Promise<void> {
  checkRateLimit(await getClientKey(), DELETE_ASSESSMENT_LIMIT);
  await db.memoRun.delete({ where: { id } });
  revalidatePath("/assessments");
}
