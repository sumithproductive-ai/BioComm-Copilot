// Stripe client — scaffold only. No Stripe account exists yet (see
// AGENTS tasks for this sprint), so STRIPE_SECRET_KEY is unset in every
// environment today. Lazily constructed, unlike db.ts/observability.ts's
// module-level client singletons, specifically so importing this module
// (e.g. from the webhook route, loaded at build time) doesn't throw before
// a real key exists — the error only surfaces if something actually tries
// to call Stripe.

import Stripe from "stripe";

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cachedClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured — no Stripe account is wired up yet (scaffold-only phase)."
    );
  }
  if (!cachedClient) {
    cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return cachedClient;
}
