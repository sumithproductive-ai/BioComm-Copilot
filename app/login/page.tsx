import { CircleAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/logo";
import { GoogleSignInButton } from "@/components/google-signin-button";

// Whole-app gate's entry point (proxy.ts redirects here) — the only page
// reachable without a session. Not itself gated (proxy.ts's matcher
// excludes it), since a login page you can't reach without being logged in
// is a contradiction.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" ? params.callbackUrl : "/";
  const error = typeof params.error === "string" ? params.error : undefined;

  return (
    <div className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Commercialization intelligence for competitor analysis and patent value — access is limited to
          approved accounts.
        </p>

        <Card className="mt-6 rounded-2xl border border-border shadow-[0_1px_2px_rgba(15,31,61,0.04),0_12px_32px_-20px_rgba(15,31,61,0.18)]">
          <CardContent className="flex flex-col gap-4">
            {error === "AccessDenied" && (
              <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                <CircleAlert className="size-4 shrink-0" />
                That Google account isn&apos;t on the approved list. Contact an admin for access.
              </p>
            )}
            {error && error !== "AccessDenied" && (
              <p className="flex items-center gap-1.5 text-sm text-destructive" role="alert">
                <CircleAlert className="size-4 shrink-0" />
                Sign-in failed — please try again.
              </p>
            )}
            <GoogleSignInButton callbackUrl={callbackUrl} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
