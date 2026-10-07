"use client";

import { useActionState } from "react";
import { createCheckoutSession, type CreateCheckoutSessionState } from "@/lib/actions/create-checkout-session";
import { PLANS } from "@/lib/billing/plans";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const initialState: CreateCheckoutSessionState = {};

// SCAFFOLD STATUS: renders real plan data from lib/billing/plans.ts, but
// the Subscribe button's actual checkout redirect can't be exercised
// without a real Stripe account — see create-checkout-session.ts.
export function PricingPlans() {
  const [state, formAction, pending] = useActionState(createCheckoutSession, initialState);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {Object.values(PLANS).map((plan) => (
          <Card key={plan.id} className="rounded-2xl border border-border">
            <CardContent className="flex flex-col gap-4 p-6">
              <div>
                <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">{plan.name}</p>
                <p className="mt-2 text-3xl font-bold text-brand-navy">
                  ${plan.priceUsdPerMonth.toLocaleString()}
                  <span className="text-sm font-normal text-muted-foreground"> / month</span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{plan.runCap} assessments included per month</p>
              </div>
              <form action={formAction}>
                <input type="hidden" name="planId" value={plan.id} />
                <Button
                  type="submit"
                  disabled={pending}
                  className="h-11 w-full rounded-[9px] bg-brand-navy text-base font-semibold text-white hover:bg-brand-navy/90"
                >
                  {pending ? "Starting checkout…" : `Subscribe to ${plan.name}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
      {state.error && (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      )}
    </div>
  );
}
