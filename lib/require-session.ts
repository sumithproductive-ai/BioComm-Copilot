// Defense-in-depth session check for Server Actions — proxy.ts is the
// primary whole-app gate, but Next.js's own guidance (proxy.md) is
// explicit: "Always verify authentication and authorization inside each
// Server Function rather than relying on Proxy alone," since a matcher
// change or a Server Function moved to a different route can silently
// drop Proxy coverage without breaking anything visibly. Cheap to call,
// so every sensitive Server Action does.

import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export class UnauthorizedError extends Error {
  constructor(message = "Sign in required.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function requireSession(): Promise<void> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    throw new UnauthorizedError();
  }
}
