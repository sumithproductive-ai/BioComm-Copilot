"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { checkRateLimit, getClientKey } from "@/lib/rate-limit";
import { requireSession } from "@/lib/require-session";

// Destructive and irreversible (every child table cascades) — access is
// gated to allowlisted accounts (proxy.ts + requireSession() here as
// defense-in-depth), but there's still no per-user ownership model (every
// assessment is "shared across the team"), so a generous but real IP-keyed
// limit still bounds a scripted mass-delete by any one signed-in client.
const DELETE_ASSESSMENT_LIMIT = { maxRequests: 20, windowMs: 60 * 1000 };

// Every child table already has onDelete: Cascade back to MemoRun (see
// prisma/schema.prisma) — a single delete removes the whole assessment,
// no manual fan-out needed.
export async function deleteAssessment(id: string): Promise<void> {
  await requireSession();
  checkRateLimit(await getClientKey(), DELETE_ASSESSMENT_LIMIT);
  await db.memoRun.delete({ where: { id } });
  revalidatePath("/assessments");
}
