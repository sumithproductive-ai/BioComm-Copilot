// Whole-app auth gate — the confirmed product decision: this handles
// competitor analysis and patent value, so it's locked to real, allowlisted
// Google logins, not left open. `proxy.ts` is this Next.js version's file
// convention for what used to be `middleware.ts` (renamed in Next 16 — see
// AGENTS.md and node_modules/next/dist/docs/.../file-conventions/proxy.md).
//
// Defaults to the Node.js runtime as of Next 16 (confirmed from that same
// doc), so next-auth's `getToken` — which needs real Node crypto, not an
// Edge-safe subset — works here without extra configuration.
//
// Per Next.js's own proxy.md guidance ("Always verify authentication and
// authorization inside each Server Function rather than relying on Proxy
// alone"): this is the primary gate, not the only one — the sensitive
// Server Actions (run-assessment.ts, create-batch.ts, delete-assessment.ts,
// memo-run.ts) each independently check the session too.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

export async function proxy(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  if (token) return NextResponse.next();

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    // Everything except: /login itself (has to be reachable pre-auth),
    // /api/* (NextAuth's own OAuth routes need to be public for the flow
    // to work at all; the MCP endpoint under /api/[transport] already has
    // its own separate bearer-token auth and deliberately isn't
    // session-gated — see app/api/[transport]/route.ts), Next.js internals,
    // and static assets.
    "/((?!login|api|_next/static|_next/image|favicon.ico).*)",
  ],
};
