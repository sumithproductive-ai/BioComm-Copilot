"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="text-sm font-medium text-muted-foreground hover:text-brand-navy"
    >
      Sign out
    </button>
  );
}
