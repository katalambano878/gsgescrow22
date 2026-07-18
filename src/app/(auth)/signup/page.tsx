import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { isAuthLive } from "@/lib/env";
import { verifyClaim } from "@/lib/auth/claim-tokens";
import { ClaimCallout } from "@/components/auth/claim-callout";

export const metadata = { title: "Sign up" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const claim = sp.claim ? verifyClaim(sp.claim) : null;

  return (
    <div>
      {claim ? (
        <ClaimCallout role={claim.role} txnRef={claim.ref} />
      ) : null}

      <h1 className="font-display text-3xl font-bold tracking-tight">
        {claim ? "Create your account to claim the order" : "Create your SBBS account."}
      </h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        {claim
          ? "We've linked your invite to this signup. Once you verify, the order will appear in your Hub automatically."
          : "Pick how you want to sign up — phone gets an SMS code, email + password if you prefer a classic login, or email code if you don't want a password."}
      </p>
      <div className="mt-8">
        <LoginForm
          authLive={isAuthLive}
          intent="signup"
          next={sp.next}
          claimToken={sp.claim || null}
        />
      </div>
      <p className="mt-6 text-sm text-[var(--muted)] text-center">
        Already have an account?{" "}
        <Link
          href={
            sp.claim
              ? `/login?claim=${encodeURIComponent(sp.claim)}`
              : "/login"
          }
          className="text-[var(--primary)] font-medium underline"
        >
          Log in
        </Link>
      </p>
      <p className="mt-4 text-xs text-[var(--muted)] text-center">
        By signing up you agree to our{" "}
        <Link href="/terms" className="underline">Terms</Link> and{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link>.
      </p>
    </div>
  );
}
