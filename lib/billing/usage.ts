// Atomic usage-cap enforcement — the system of record for "can this user
// start a run," independent of Stripe. Stripe's own usage metering has up
// to an hour of reporting lag and isn't meant for real-time access control
// (confirmed via research before building this), so the cap itself has to
// live here, backed by the database, not in Stripe or in memory.
//
// This is deliberately NOT built on lib/rate-limit.ts's in-memory bucket
// pattern. That module is explicit about its own scope: abuse prevention,
// single-instance, a restart resetting everyone's window is an acceptable
// tradeoff. None of that is acceptable for a real billing cap — two
// concurrent requests arriving at the exact cap boundary must not both
// succeed, which requires one atomic, database-serialized operation, not a
// read-then-write in application code.

import { db } from "@/lib/db";

export class NoActiveSubscriptionError extends Error {
  constructor(message = "No active subscription found for this account.") {
    super(message);
    this.name = "NoActiveSubscriptionError";
  }
}

export class UsageCapExceededError extends Error {
  constructor(
    message = "You've used all the runs included in your current plan this billing period."
  ) {
    super(message);
    this.name = "UsageCapExceededError";
  }
}

const ACTIVE_STATUSES = ["Active", "Trialing"] as const;

// Reserves `count` run slots against userEmail's subscription in a single
// atomic transaction: one conditional UPDATE (not read-then-write) claims
// the slots, Postgres's row-level locking means two concurrent calls can't
// both read "N remaining" and both proceed — only one UPDATE can win the
// race for the last slot(s), the other sees 0 rows affected and throws.
// Throws rather than returning a boolean so a call site can't accidentally
// ignore a failed reservation and dispatch an unpaid-for run.
//
// Called at run-start, before any Anthropic spend is committed — not at
// run-completion. A run that fails immediately on bad input shouldn't cost
// a slot (reject it before calling this); one where agents actually ran
// and then failed midway correctly still consumed a slot, since real spend
// already happened.
export async function reserveUsageSlots(userEmail: string, count: number): Promise<string[]> {
  if (count < 1) throw new Error("reserveUsageSlots: count must be at least 1");

  return db.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE subscription
      SET "runsUsedThisPeriod" = "runsUsedThisPeriod" + ${count}, "updatedAt" = now()
      WHERE "userEmail" = ${userEmail}
        AND status IN ('Active', 'Trialing')
        AND "runsUsedThisPeriod" + ${count} <= "runCap"
    `;

    if (updated === 0) {
      const subscription = await tx.subscription.findUnique({ where: { userEmail } });
      if (!subscription || !ACTIVE_STATUSES.includes(subscription.status as (typeof ACTIVE_STATUSES)[number])) {
        throw new NoActiveSubscriptionError();
      }
      throw new UsageCapExceededError();
    }

    const subscription = await tx.subscription.findUniqueOrThrow({ where: { userEmail } });
    const records = await Promise.all(
      Array.from({ length: count }, () =>
        tx.usageRecord.create({
          data: { subscriptionId: subscription.id, userEmail, status: "Reserved" },
        })
      )
    );
    return records.map((r) => r.id);
  });
}

// Informational only — never the thing a gate decides on (that's always
// reserveUsageSlots' atomic UPDATE). Useful for showing "N of M runs used"
// in the UI without claiming a slot.
export async function getUsageSummary(
  userEmail: string
): Promise<{ runsUsed: number; runCap: number; status: string } | null> {
  const subscription = await db.subscription.findUnique({ where: { userEmail } });
  if (!subscription) return null;
  return {
    runsUsed: subscription.runsUsedThisPeriod,
    runCap: subscription.runCap,
    status: subscription.status,
  };
}
