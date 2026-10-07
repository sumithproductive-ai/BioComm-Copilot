// Plan config — a hand-maintained TS table keyed by Stripe Price ID, not a
// DB table. At this scale plans change by deploy (a founder decision), not
// by admin action at runtime, so a Plan table would be a layer of indirection
// with no real consumer. Subscription.runCap is still denormalized onto the
// DB row at subscribe/renewal time (see lib/billing/usage.ts) — this file is
// the source of truth only at the moment a subscription is created or
// renewed, not something read live on every usage check.
//
// Figures below are an illustrative starting point (see the pricing research
// from this session: enterprise pharma intelligence platforms run six
// figures/year custom-quote; early-stage biotech tools budgets are nowhere
// near that), not a final, tested number — expect to revise after real
// pricing conversations.

export type PlanId = "starter" | "team";

export type Plan = {
  id: PlanId;
  name: string;
  runCap: number;
  priceUsdPerMonth: number;
  // Real Stripe Price IDs don't exist yet (no Stripe account wired up —
  // see lib/stripe.ts's own comment). Falls back to an obviously-fake
  // placeholder so planByStripePriceId() fails loudly (returns undefined)
  // rather than silently matching in a test environment.
  stripePriceId: string;
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    runCap: 15,
    priceUsdPerMonth: 300,
    stripePriceId: process.env.STRIPE_PRICE_ID_STARTER ?? "price_starter_not_configured",
  },
  team: {
    id: "team",
    name: "Team",
    runCap: 60,
    priceUsdPerMonth: 1200,
    stripePriceId: process.env.STRIPE_PRICE_ID_TEAM ?? "price_team_not_configured",
  },
};

export function planByStripePriceId(stripePriceId: string): Plan | undefined {
  return Object.values(PLANS).find((plan) => plan.stripePriceId === stripePriceId);
}

export function planById(id: PlanId): Plan {
  return PLANS[id];
}
