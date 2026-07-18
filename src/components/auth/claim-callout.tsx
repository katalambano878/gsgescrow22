import { Package, ShieldCheck } from "lucide-react";

export function ClaimCallout({ role, txnRef }: { role: "seller" | "buyer"; txnRef: string }) {
  return (
    <div className="mb-6 rounded-[var(--radius-md)] border border-[var(--primary)]/20 bg-[var(--primary-soft)] px-4 py-3 flex items-start gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--primary)] text-white">
        {role === "seller" ? <Package size={16} /> : <ShieldCheck size={16} />}
      </span>
      <div className="min-w-0">
        <p className="font-semibold text-[var(--primary)] text-sm">
          {role === "seller" ? "Seller invite detected" : "Buyer invite detected"}
        </p>
        <p className="text-xs text-[var(--primary)]/80 mt-0.5">
          Order <span className="font-mono font-semibold">{txnRef}</span> will be added to your
          Hub right after you finish creating your account.
        </p>
      </div>
    </div>
  );
}
