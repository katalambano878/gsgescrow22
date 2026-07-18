"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  { id: "all", label: "All categories" },
  { id: "fashion", label: "Fashion" },
  { id: "beauty", label: "Beauty" },
  { id: "hair", label: "Hair" },
  { id: "sneakers", label: "Sneakers" },
  { id: "electronics", label: "Electronics" },
  { id: "food", label: "Food" },
  { id: "home", label: "Home" },
  { id: "automotive", label: "Automotive" },
  { id: "art", label: "Art" },
  { id: "services", label: "Services" },
  { id: "other", label: "Other" },
];

const KINDS = [
  { id: "all", label: "All" },
  { id: "product", label: "Products" },
  { id: "service", label: "Services" },
];

const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "popular", label: "Most popular" },
  { id: "price_low", label: "Price · low to high" },
  { id: "price_high", label: "Price · high to low" },
];

export function MarketplaceFilters({
  q,
  category,
  kind,
  sort,
  total,
}: {
  q: string;
  category: string;
  kind: string;
  sort: string;
  total: number;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(q);

  // Sync the input when the URL's q changes (state-adjust-during-render
  // pattern — avoids a cascading effect render).
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) {
    setPrevQ(q);
    setQuery(q);
  }

  function push(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === "all" || v === "" || v === "newest") next.delete(k);
      else next.set(k, v);
    }
    startTransition(() => router.push(`/products-services${next.toString() ? `?${next}` : ""}`));
  }

  return (
    <Card className="p-5 sm:p-6 shadow-[var(--shadow-pop)]">
      <form
        className="flex flex-col lg:flex-row gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          push({ q: query });
        }}
      >
        <div className="flex-1 flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface-muted)]/60 px-3 focus-within:bg-[var(--surface)] focus-within:ring-4 focus-within:ring-[var(--ring)] focus-within:border-[var(--primary)]">
          <Search size={16} className="text-[var(--muted)]" />
          <input
            className="h-11 w-full bg-transparent text-[15px] placeholder:text-[var(--muted)] focus:outline-none"
            placeholder="Search products or services…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
              onClick={() => {
                setQuery("");
                push({ q: "" });
              }}
            >
              Clear
            </button>
          )}
        </div>

        <Dropdown
          options={CATEGORIES}
          value={category}
          onChange={(v) => push({ c: v })}
        />
        <Dropdown options={KINDS} value={kind} onChange={(v) => push({ k: v })} />
        <Dropdown options={SORTS} value={sort} onChange={(v) => push({ s: v })} />

        <Button type="submit" size="md" loading={isPending} className="lg:w-auto">
          <SlidersHorizontal size={14} /> Apply
        </Button>
      </form>

      <p className="mt-4 flex items-center gap-2 text-xs text-[var(--muted)]">
        <SlidersHorizontal size={12} />
        Showing <span className="text-[var(--foreground)] font-semibold">{total}</span> verified {total === 1 ? "listing" : "listings"}
        {q && (
          <>
            {" "}
            matching <span className="text-[var(--foreground)] font-semibold">&ldquo;{q}&rdquo;</span>
          </>
        )}
      </p>
    </Card>
  );
}

function Dropdown({
  options,
  value,
  onChange,
}: {
  options: { id: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative lg:min-w-[160px]">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] pl-3 pr-9 text-[14px] font-medium appearance-none focus:outline-none focus:ring-4 focus:ring-[var(--ring)] focus:border-[var(--primary)]"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]">▾</span>
    </div>
  );
}
