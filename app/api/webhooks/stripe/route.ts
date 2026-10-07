// Stripe webhook endpoint. Deliberately outside the session gate —
// proxy.ts's matcher already excludes all of /api/*, and Stripe has no way
// to complete a Google OAuth flow anyway. The signature check below is
// this route's actual authentication: it proves the request really came
// from Stripe, not a visitor hitting the URL directly.
//
// SCAFFOLD STATUS: code is correct against the installed SDK's own type
// definitions (checked directly, not assumed — see lib/billing/sync.ts's
// comments on where current_period_start/end actually live in this SDK
// version), and the business logic (lib/billing/sync.ts) is unit-verified
// against constructed event payloads. The one thing NOT yet verified is
// this route's actual signature verification against a real Stripe
// request, since no Stripe account exists yet. Verify with `stripe trigger
// checkout.session.completed` (Stripe CLI) once test-mode credentials
// exist, before this goes anywhere near production traffic.

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripeClient } from "@/lib/stripe";
import { db } from "@/lib/db";
import {
  handleCheckoutSessionCompleted,
  handleSubscriptionUpserted,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed,
} from "@/lib/billing/sync";

// Exported for the sprint's own verification script only — lets a test
// construct a fake Stripe.Event and exercise the dispatch/idempotency
// logic without a real signature. Not called from anywhere else in the app.
export async function dispatchStripeEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await handleSubscriptionUpserted(event.data.object as Stripe.Subscription);
      return;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
      return;
    case "invoice.paid":
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
      return;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
      return;
    default:
      // Deliberately silent — Stripe sends many event types this app
      // doesn't act on. Not an error, just nothing to do.
      return;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = (await headers()).get("stripe-signature");
  const body = await request.text();

  if (!webhookSecret || !signature) {
    console.error("[stripe webhook] missing signature header or STRIPE_WEBHOOK_SECRET");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = getStripeClient().webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    // Never trust an unverified payload — this is the entire security
    // boundary for this endpoint. Log and reject, do not fall through to
    // processing "just in case" the signature check was wrong.
    console.error("[stripe webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Idempotency — Stripe redelivers events on timeout/retry. A repeat must
  // no-op, not re-apply (e.g. re-zero runsUsedThisPeriod a second time).
  const alreadyProcessed = await db.stripeWebhookEvent.findUnique({
    where: { stripeEventId: event.id },
  });
  if (alreadyProcessed) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    await dispatchStripeEvent(event);
  } catch (err) {
    console.error(`[stripe webhook] handler failed for ${event.type} (${event.id}):`, err);
    // 500, not 200 — tells Stripe to retry. Do NOT record stripeWebhookEvent
    // below on failure; a retry needs to actually reprocess, not get
    // silently swallowed by the idempotency check above.
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  await db.stripeWebhookEvent.create({ data: { stripeEventId: event.id, type: event.type } });
  return NextResponse.json({ received: true });
}
