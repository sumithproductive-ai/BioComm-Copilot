// Whole-app Google OAuth gate — the confirmed product decision from the
// roadmap: access control, not attribution/multi-tenancy. "This is for
// competitor analysis and patent value, it should be locked to account
// users." Real login + a small allowlist, not a shared passcode.
//
// JWT session strategy, not @auth/prisma-adapter — Prisma 7 compatibility
// with that adapter was uncertain at the time this was planned, and a JWT
// session needs nothing persisted (no User/Session/Account tables), which
// keeps this additive to prisma/schema.prisma instead of a new migration
// for auth alone.
//
// next-auth@4.24.15 (not v5, still in beta at the time of this decision) —
// its package.json declares `next: '^12.2.5 || ^13 || ^14 || ^15 || ^16'`,
// confirmed genuinely supporting this app's Next.js 16 before choosing it,
// not assumed.

import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

// Comma-separated allowlist of emails permitted to sign in — the actual
// access-control mechanism. Google OAuth only proves *who* someone is; this
// is what decides *whether* they're allowed in. Case-insensitive compare
// since Google itself treats email casing loosely at signup, and a
// copy-pasted allowlist entry might not match a user's exact stored case.
function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowlist = (process.env.ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email.toLowerCase());
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    // Both success and rejection route through /login — a rejected sign-in
    // gets ?error=AccessDenied there instead of NextAuth's generic default
    // error page, so the messaging can stay in this app's own voice.
    error: "/login",
  },
  callbacks: {
    // The actual enforcement point — runs after Google confirms identity,
    // before a session is ever issued. Returning false here means no
    // cookie, no JWT, no session; the user never gets past /login.
    async signIn({ user }) {
      return isAllowedEmail(user.email);
    },
  },
};
