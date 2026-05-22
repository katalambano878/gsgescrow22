import { LegalShell } from "@/components/marketing/legal-shell";

export const metadata = { title: "Refund & Dispute Policy" };

export default function DisputesPolicyPage() {
  return (
    <LegalShell eyebrow="Legal" title="Refund & Dispute Policy" effective="20 April 2026">
      <p>
        Disputes are how SBBS keeps both buyers and sellers safe. This policy explains exactly how the process works, who decides what, and how long it takes.
      </p>

      <h2>1. Who can open a dispute</h2>
      <ul>
        <li>The buyer, at any point after payment until the transaction completes.</li>
        <li>The seller, if the buyer holds the delivery code unfairly.</li>
      </ul>

      <h2>2. What happens immediately</h2>
      <p>
        The transaction freezes. The auto-release timer is paused. No payout can be released until the dispute is resolved.
      </p>

      <h2>3. Evidence</h2>
      <p>
        Both sides upload to a private evidence vault: chat screenshots, photos, videos, tracking documents, dispatch slips. Evidence is visible only to the parties and SBBS reviewers.
      </p>

      <h2>4. SLA</h2>
      <p>
        SBBS reviews and decides within five business days. We aim for two. We notify both parties by SMS and email.
      </p>

      <h2>5. Possible outcomes</h2>
      <ul>
        <li>Full refund to the buyer (released to original payment method).</li>
        <li>Partial refund (split decided by SBBS).</li>
        <li>Released to seller (if the seller is in the right).</li>
      </ul>

      <h2>6. Refund mechanics</h2>
      <p>
        Refunds reach the buyer&rsquo;s original payment method (MoMo wallet, card) within 3 business days of approval. Where the original method is unavailable, an alternative is arranged with the buyer.
      </p>

      <h2>7. Release fees</h2>
      <p>
        The rider release fee is collected from the buyer when there&rsquo;s a delivery leg and is paid
        out separately when the transaction is dispatched. The seller release fee is deducted from the
        seller&rsquo;s payout to cover the cost of the seller payout transfer — it never inflates the
        buyer&rsquo;s total.
      </p>
      <p>
        Both release fees follow the same channel-aware structure:
      </p>
      <ul>
        <li><strong>MoMo (Moolre)</strong>: 1% of the released amount, capped at ₵10.</li>
        <li><strong>Bank (Paystack)</strong>: flat ₵8 per transfer.</li>
      </ul>
      <p>
        Release fees are generally not refunded, even if the product portion is, because the
        underlying dispatch and payout services have already been performed. Other PSP, telco, and
        bank fees may still apply on top of these.
      </p>

      <h2>8. Repeat disputes</h2>
      <p>
        Accounts with abnormally high dispute rates are reviewed and may be suspended pending investigation, in line with our Terms of Service.
      </p>
    </LegalShell>
  );
}
