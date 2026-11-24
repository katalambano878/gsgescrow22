"use client";

import { useCallback, useEffect, useState } from "react";
import { AppTopbar } from "@/components/app-shell/topbar";
import { Container } from "@/components/ui/container";

type Package = { id: string; amount: string; currency: string; sms: number };
type Checkout = { id: string; status: string; sms?: number; already_credited?: boolean };
type Billing = {
  configured: boolean;
  sms_left?: number;
  packages?: Package[];
  checkout?: Checkout | null;
};

const PENDING_KEY = "sbbs_sms_checkout";

function cedis(amount: string | number): string {
  const value = Number(amount) || 0;
  return `GH₵ ${value.toLocaleString("en-GH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function readPending(): string {
  try {
    return sessionStorage.getItem(PENDING_KEY) || "";
  } catch {
    return "";
  }
}

function writePending(id: string | null) {
  try {
    if (id) sessionStorage.setItem(PENDING_KEY, id);
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    /* private mode */
  }
}

async function loadBilling(checkoutId = ""): Promise<Billing> {
  const url = checkoutId ? `/api/admin/sms-credit?checkout=${encodeURIComponent(checkoutId)}` : "/api/admin/sms-credit";
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || "Could not load SMS packages.");
  return json as Billing;
}

export default function BuySmsPage() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [paying, setPaying] = useState(false);

  const load = useCallback(async (checkoutId = "") => {
    const data = await loadBilling(checkoutId);
    setBilling(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pending = readPending();
        const data = await load(pending);
        if (cancelled || !pending || !data.checkout) return;
        if (data.checkout.status === "succeeded") {
          writePending(null);
          const added = Number(data.checkout.sms) || 0;
          setNotice(data.checkout.already_credited ? "This payment was already added." : `${added.toLocaleString("en-GH")} SMS added to this store.`);
        } else if (data.checkout.status === "failed") {
          writePending(null);
          setError("The payment was not completed. Your balance is unchanged.");
        } else {
          setNotice("Payment is still confirming. Refresh this page in a moment and the texts will show here.");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load SMS packages.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function buy(packageId: string) {
    setPaying(true);
    setError("");
    try {
      const res = await fetch("/api/admin/sms-credit", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package_id: packageId }),
      });
      const checkout = await res.json().catch(() => ({}));
      if (!res.ok || !checkout?.checkout_url) {
        throw new Error(checkout?.error || "Could not start payment.");
      }
      writePending(checkout.id);
      window.location.href = checkout.checkout_url;
    } catch (err) {
      setPaying(false);
      setError(err instanceof Error ? err.message : "Could not start payment.");
    }
  }

  return (
    <>
      <AppTopbar title="Buy SMS" subtitle="Texts for deals, payouts and alerts come out of this balance." />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-6">
          {!billing && !error && <p className="text-sm text-[var(--muted)]">Loading SMS packages…</p>}
          {notice && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm">{notice}</div>
          )}
          {error && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-[var(--danger)]">{error}</div>
          )}
          {billing && !billing.configured && (
            <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
              SMS buying is not connected on this store yet. Once the Taysend key is set, the packages appear here.
            </div>
          )}
          {billing?.configured && (
            <>
              <div className="rounded-[var(--radius-lg)] bg-[var(--primary)] p-6 text-[var(--primary-foreground)]">
                <p className="text-sm opacity-80">SMS left</p>
                <p className="mt-1 text-4xl font-bold tabular-nums">{(billing.sms_left || 0).toLocaleString("en-GH")}</p>
                <p className="mt-2 text-sm opacity-80">Sender: GSGBRANDS. If this balance is empty, texts still go through the existing Moolre account.</p>
              </div>
              <p className="text-sm font-medium">Choose a package, then press Buy on it.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="SMS packages">
                {(billing.packages || []).map((pkg) => {
                  const selected = pkg.id === selectedId;
                  const price = cedis(pkg.amount);
                  return (
                    <div
                      key={pkg.id}
                      role="radio"
                      aria-checked={selected}
                      tabIndex={0}
                      onClick={() => setSelectedId(pkg.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedId(pkg.id);
                        }
                      }}
                      className={
                        "flex cursor-pointer flex-col rounded-[var(--radius-lg)] border p-5 text-left " +
                        (selected
                          ? "border-[var(--primary)] bg-[var(--surface)] ring-2 ring-[var(--primary)]"
                          : "border-[var(--border)] bg-[var(--surface)]")
                      }
                    >
                      <p className="text-2xl font-bold tabular-nums">{price}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{pkg.sms.toLocaleString("en-GH")} SMS</p>
                      <button
                        type="button"
                        disabled={paying}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (!selected) {
                            setSelectedId(pkg.id);
                            return;
                          }
                          buy(pkg.id);
                        }}
                        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md bg-[var(--primary)] text-sm font-semibold text-[var(--primary-foreground)] disabled:cursor-wait"
                      >
                        {paying && selected ? "Opening payment…" : selected ? `Buy ${price}` : "Buy"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </Container>
      </main>
    </>
  );
}
