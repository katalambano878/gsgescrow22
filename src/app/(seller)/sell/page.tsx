import { redirect } from "next/navigation";
import Link from "next/link";
import { Container, Section, Eyebrow } from "@/components/ui/container";
import { SellerWizard } from "@/components/seller/seller-wizard";
import { MarketingNav } from "@/components/marketing/nav";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ShieldCheck, UserPlus } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/session";
import { isAuthLive } from "@/lib/env";

export const metadata = { title: "Create a payment link" };

export default async function SellPage() {
  // Sellers MUST be registered. A payment link points at their MoMo for
  // the payout, so we need a real account to attach fraud history, trust
  // score, and approver trail to. Unauthenticated visitors get a sign-up
  // CTA with `next=/sell` so they land straight back here post-signup.
  const profile = await getCurrentProfile().catch(() => null);

  if (!profile) {
    return (
      <>
        <MarketingNav />
        <Section className="bg-paper min-h-[80vh]">
          <Container size="default">
            <Eyebrow>Seller wizard</Eyebrow>
            <h1 className="font-display text-4xl sm:text-5xl font-bold mt-4 tracking-tight">
              Create your seller account first.
            </h1>
            <p className="mt-4 text-lg text-[var(--muted)]">
              We need a verified seller profile before generating a payment link
              — that way the MoMo number we pay out to is tied to a real
              identity, and every order shows up in your Hub automatically.
            </p>
            <Card className="mt-10 p-6 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <h3 className="font-display text-xl font-semibold">
                    Takes less than a minute.
                  </h3>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Sign up with your phone or email. After verification
                    you&rsquo;ll be sent straight to the payment link wizard.
                  </p>
                </div>
              </div>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Link href={`/signup?next=${encodeURIComponent("/sell")}`} className="w-full sm:w-auto">
                  <Button className="w-full sm:w-auto">
                    <UserPlus size={16} /> Create a free account
                  </Button>
                </Link>
                <Link href={`/login?next=${encodeURIComponent("/sell")}`} className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full sm:w-auto">
                    I already have an account
                  </Button>
                </Link>
              </div>
              {!isAuthLive && (
                <p className="mt-4 text-xs text-[var(--danger)]">
                  Auth isn&rsquo;t configured. Set AUTH_SECRET to enable
                  sign-up.
                </p>
              )}
            </Card>
          </Container>
        </Section>
      </>
    );
  }

  // Signed-in sellers land straight in the wizard with their profile
  // prefilled. They can still change the fields (e.g. ship-under-alias)
  // but the MoMo payout number is locked to profile.momoNumber in the
  // wizard so a phished session can't redirect funds.
  void redirect; // keep import for future role-gating if needed.

  return (
    <>
      <MarketingNav />
      <Section className="bg-paper min-h-[80vh]">
        <Container size="lg">
          <Eyebrow>Seller wizard</Eyebrow>
          <h1 className="font-display text-4xl sm:text-5xl font-bold mt-4 tracking-tight">
            Create a protected payment link.
          </h1>
          <p className="mt-4 text-lg text-[var(--muted)] max-w-2xl">
            Enter the buyer&rsquo;s details and the agreed price. We&rsquo;ll
            generate a link you can drop in WhatsApp, Instagram or SMS.
          </p>
          <div className="mt-10">
            <SellerWizard
              prefill={{
                sellerName: profile.displayName ?? "",
                sellerPhone: profile.momoNumber ?? profile.phone ?? "",
              }}
            />
          </div>
        </Container>
      </Section>
    </>
  );
}
