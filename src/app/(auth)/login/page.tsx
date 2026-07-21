import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthLive } from "@/lib/env";
import { verifyClaim } from "@/lib/auth/claim-tokens";
import { ClaimCallout } from "@/components/auth/claim-callout";

export const metadata = { title: "Log in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string; next?: string; claim?: string }>;
}) {
  const sp = await searchParams;
  const claim = sp.claim ? verifyClaim(sp.claim) : null;
  return (
    <div>
      {claim ? <ClaimCallout role={claim.role} txnRef={claim.ref} /> : null}
      <h1 className="font-display text-3xl font-bold tracking-tight">
        {claim ? "Log in to claim the order" : "Welcome back."}
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {claim
          ? "After you log in, we'll attach the order to your account and take you straight to it."
          : "Log in with your phone for an SMS code, or use email + password."}
      </p>
      {sp.reason === "auth-not-configured" && (
        <div className="mt-5 rounded-md border border-[#ecdba8] bg-[#fbf2dd] text-[#7a5410] text-sm p-3">
          Auth is not configured yet. Set <code>AUTH_SECRET</code> (32+ characters) to enable login.
        </div>
      )}
      {sp.reason === "forbidden" && (
        <div className="mt-5 rounded-md border border-[#f1bbb6] bg-[#fbe5e3] text-[var(--danger)] text-sm p-3">
          You don&rsquo;t have permission to access that page.
        </div>
      )}
      <div className="mt-8">
        <LoginForm
          next={sp.next}
          authLive={isAuthLive}
          claimToken={sp.claim || null}
        />
      </div>
      <p className="mt-6 text-sm text-[var(--muted)] text-center">
        New to SBBS?{" "}
        <Link
          href={sp.claim ? `/signup?claim=${encodeURIComponent(sp.claim)}` : "/signup"}
          className="text-[var(--primary)] font-medium underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}
