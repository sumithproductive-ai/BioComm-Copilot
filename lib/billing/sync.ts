// Subscription state sync — the business logic app/api/webhooks/stripe/
// route.ts calls into after verifying a webhook's signature. Kept separate
// from the route itself so the route stays a thin verify-and-dispatch
// wrapper, and so this logic is testable by constructing a Stripe.Event
// payload directly, without needing a real Stripe signature.

import type Stripe from "stripe";
import { db } from "@/lib/db";
import { planByStripePriceId } from "@/lib/billing/plans";
import type { SubscriptionStatus } from "@/lib/generated/prisma/client";

// A function, not a Record<Stripe.Subscription.Status, ...> — Stripe's own
// Status type includes a branded OtherString member for forward-compat
// with values Stripe adds later, which a Record can't exhaustively key on.
// Unrecognized values fall back to Incomplete rather than throwing, so an
// unfamiliar future Stripe status doesn't take the webhook handler down.
function mapStripeStatus(status: Stripe.Subscription.Status): SubscriptionStatus {
  switch (status) {
    case "active":
      return "Active";
    case "trialing":
      return "Trialing";
    case "past_due":
      return "PastDue";
    case "canceled":
    case "incomplete_expired":
    case "paused":
      return "Canceled";
    case "unpaid":
      return "Unpaid";
    case "incomplete":
      return "Incomplete";
    default:
      return "Incomplete";
  }
}

function customerIdOf(customer: string | Stripe.Customer | Stripe.DeletedCustomer | null): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id;
}

// First touch for a brand-new subscriber — links the Stripe customer to
// the app account. client_reference_id is set to the signed-in user's
// email when the Checkout Session is created (see lib/billing/checkout.ts),
// since Stripe Checkout has no awareness of our own auth.
export async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const userEmail = session.client_reference_id ?? session.customer_details?.email;
  const stripeCustomerId = customerIdOf(session.customer);

  if (!userEmail || !stripeCustomerId) {
    console.warn("[billing] checkout.session.completed missing userEmail or customer id, skipping", {
      sessionId: session.id,
    });
    return;
  }

  await db.subscription.upsert({
    where: { userEmail },
    create: { userEmail, stripeCustomerId, status: "Incomplete" },
    update: { stripeCustomerId },
  });
}

// The authoritative source for status/price/cap/period — checkout.session.
// completed only establishes the customer link; this event (fired on
// create AND every update) carries the real subscription state.
export async function handleSubscriptionUpserted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = customerIdOf(subscription.customer);
  if (!stripeCustomerId) return;

  const item = subscription.items.data[0];
  const priceId = item?.price.id;
  const plan = priceId ? planByStripePriceId(priceId) : undefined;

  const existing = await db.subscription.findUnique({ where: { stripeCustomerId } });
  if (!existing) {
    console.warn("[billing] subscription event for unknown stripeCustomerId, skipping", {
      stripeCustomerId,
      subscriptionId: subscription.id,
    });
    return;
  }

  await db.subscription.update({
    where: { stripeCustomerId },
    data: {
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      status: mapStripeStatus(subscription.status),
      // Only moves forward on a recognized price id — an unrecognized one
      // (a manual Stripe dashboard change, a stale price) keeps whatever
      // cap the row already had rather than silently zeroing a paying
      // customer's access.
      ...(plan ? { runCap: plan.runCap } : {}),
      currentPeriodStart: item?.current_period_start ? new Date(item.current_period_start * 1000) : undefined,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : undefined,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    },
  });
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
  const stripeCustomerId = customerIdOf(subscription.customer);
  if (!stripeCustomerId) return;
  await db.subscription.updateMany({ where: { stripeCustomerId }, data: { status: "Canceled" } });
}

// Fires at the start of every billing period, including renewals — the one
// specific place runsUsedThisPeriod resets to 0. Deliberately NOT reset on
// subscription.updated, which fires for lots of reasons unrelated to a new
// period starting (e.g. cancel_at_period_end being toggled mid-period).
export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = customerIdOf(invoice.customer);
  if (!stripeCustomerId) return;
  await db.subscription.updateMany({ where: { stripeCustomerId }, data: { runsUsedThisPeriod: 0 } });
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
  const stripeCustomerId = customerIdOf(invoice.customer);
  if (!stripeCustomerId) return;
  await db.subscription.updateMany({ where: { stripeCustomerId }, data: { status: "PastDue" } });
}
