import { Container, Section, Eyebrow } from "@/components/ui/container";
import { CalculatorWidget } from "@/components/marketing/calculator-widget";

export const metadata = { title: "Fee calculator" };

export default function CalculatorPage() {
  return (
    <Section className="bg-paper min-h-[80vh]">
      <Container size="lg">
        <Eyebrow>Transparent fees</Eyebrow>
        <h1 className="font-display text-4xl sm:text-5xl font-bold mt-4 tracking-tight">
          See exactly what you&rsquo;ll pay.
        </h1>
        <p className="mt-4 text-lg text-[var(--muted)] max-w-2xl">
          No hidden fees, no markup on Moolre or Paystack rates. Two platform fees plus
          release fees that depend on the payout channel:
          <span className="font-semibold text-[var(--foreground)]"> MoMo</span> is 1%
          capped at ₵10, <span className="font-semibold text-[var(--foreground)]">Bank</span>{" "}
          is a flat ₵8. The buyer covers the rider release fee, the seller release fee comes
          out of the seller&rsquo;s payout.
        </p>
        <div className="mt-10">
          <CalculatorWidget />
        </div>
      </Container>
    </Section>
  );
}
