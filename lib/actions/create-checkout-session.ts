"use server";

// SCAFFOLD STATUS: types checked against the installed Stripe SDK's own
// definitions (field names confirmed, not guessed), but this is the one
// piece of the billing sprint that genuinely cannot be verified without a
// real Stripe account — stripe.checkout.sessions.create() is a real network
// call, unlike webhook signature verification, which is a local operation
// and was fully end-to-end tested. Verify this against Stripe test mode
// before relying on it.

import { redirect } from "next/navigation";
import { getStripeClient } from "@/lib/stripe";
import { requireSession, UnauthorizedError } from "@/lib/require-session";
import { planById, type PlanId } from "@/lib/billing/plans";
import { db } from "@/lib/db";

export type CreateCheckoutSessionState = {
  error?: string;
};

export async function createCheckoutSession(
  _prevState: CreateCheckoutSessionState,
  formData: FormData
): Promise<CreateCheckoutSessionState> {
  let userEmail: string;
  try {
    userEmail = await requireSession();
  } catch (err) {
    if (err instanceof UnauthorizedError) return { error: err.message };
    throw err;
  }

  const planId = formData.get("planId");
  if (typeof planId !== "string" || !["starter", "team"].includes(planId)) {
    return { error: "Select a plan to continue." };
  }
  const plan = planById(planId as PlanId);

  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";

  // Existing customer (re-subscribing, or changing plan) gets reused rather
  // than creating a duplicate Stripe customer for the same email.
  const existing = await db.subscription.findUnique({ where: { userEmail } });

  let session;
  try {
    session = await getStripeClient().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      client_reference_id: userEmail,
      customer: existing?.stripeCustomerId,
      customer_email: existing?.stripeCustomerId ? undefined : userEmail,
      success_url: `${baseUrl}/pricing?checkout=success`,
      cancel_url: `${baseUrl}/pricing?checkout=canceled`,
    });
  } catch (err) {
    console.error("[billing] failed to create checkout session:", err);
    return { error: "Couldn't start checkout — please try again or contact support." };
  }

  if (!session.url) {
    return { error: "Checkout session created without a redirect URL — please try again." };
  }

  redirect(session.url);
}
