import { PricingPlans } from "@/components/pricing-plans";

// Behind the existing auth gate (proxy.ts's matcher doesn't exclude this
// route) — a known gap, not an oversight: this app's access model today is
// "already on ALLOWED_EMAILS", completely separate from "has an active
// subscription". A real self-serve flow (unauthenticated visitor sees
// pricing, pays, THEN gets access) would mean rethinking that allowlist
// gate, not just adding this page — a product decision flagged for the
// user, not made silently here.
export default function PricingPage() {
  return (
    <div className="flex flex-1 justify-center bg-background px-6 py-16">
      <div className="w-full max-w-3xl">
        <p className="text-xs font-bold tracking-wide text-brand-amber uppercase">Plans</p>
        <h1 className="mt-2 text-[27px] font-bold text-brand-navy">Choose a plan</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Every plan includes the full nine-agent pipeline. Runs beyond your plan&apos;s included
          amount are blocked until your next billing period, not charged automatically.
        </p>
        <div className="mt-8">
          <PricingPlans />
        </div>
      </div>
    </div>
  );
}
