"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";

// Every child table already has onDelete: Cascade back to MemoRun (see
// prisma/schema.prisma) — a single delete removes the whole assessment,
// no manual fan-out needed.
export async function deleteAssessment(id: string): Promise<void> {
  await db.memoRun.delete({ where: { id } });
  revalidatePath("/assessments");
}
