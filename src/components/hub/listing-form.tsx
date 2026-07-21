"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload, X, Star } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Label, Textarea, FieldHint } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { upsertListing, type UpsertListingInput } from "@/lib/actions/listings";
import { publicListingUrl } from "@/lib/storage/shared";
import { formatGhs, ghsToPesewas } from "@/lib/utils";

const CATEGORIES = [
  "fashion",
  "beauty",
  "hair",
  "sneakers",
  "electronics",
  "food",
  "home",
  "automotive",
  "services",
  "art",
  "other",
] as const;

export interface ListingFormInitial {
  id?: string;
  kind?: "product" | "service";
  title?: string;
  tagline?: string;
  description?: string;
  category?: (typeof CATEGORIES)[number];
  priceCedis?: string;
  deliveryCedis?: string;
  images?: string[];
  city?: string;
  deliveryAvailable?: boolean;
  stock?: string;
  tags?: string[];
  state?: string;
}

export function ListingForm({ initial }: { initial?: ListingFormInitial }) {
  const router = useRouter();
  const [form, setForm] = useState({
    kind: initial?.kind ?? "product",
    title: initial?.title ?? "",
    tagline: initial?.tagline ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "fashion",
    priceCedis: initial?.priceCedis ?? "",
    deliveryCedis: initial?.deliveryCedis ?? "0",
    city: initial?.city ?? "Accra",
    deliveryAvailable: initial?.deliveryAvailable ?? true,
    stock: initial?.stock ?? "",
    tags: initial?.tags?.join(", ") ?? "",
  });
  const [images, setImages] = useState<string[]>(initial?.images ?? []);
  const [uploading, setUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const res = await fetch("/api/upload/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: "listing",
          fileName: file.name,
          mime: file.type,
          sizeBytes: file.size,
          subKey: initial?.id,
        }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        signedUrl?: string;
        path?: string;
        error?: string;
      };
      if (!data.ok || !data.signedUrl || !data.path) {
        toast.error(data.error ?? "Couldn't prepare upload");
        return;
      }
      const up = await fetch(data.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!up.ok) {
        toast.error("Upload failed");
        return;
      }
      setImages((prev) => [...prev, data.path!]);
      toast.success("Uploaded");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function submit(publish: boolean) {
    const payload: UpsertListingInput = {
      id: initial?.id,
      kind: form.kind,
      title: form.title,
      tagline: form.tagline,
      description: form.description,
      category: form.category,
      priceCedis: Number(form.priceCedis || 0),
      deliveryCedis: Number(form.deliveryCedis || 0),
      images,
      city: form.city,
      deliveryAvailable: form.deliveryAvailable,
      stock: form.stock ? Number(form.stock) : undefined,
      tags: form.tags
        .split(",")
        .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9]/g, ""))
        .filter(Boolean)
        .slice(0, 12),
      publish,
    };

    startTransition(async () => {
      const r = await upsertListing(payload);
      if (!r.ok) {
        toast.error(r.error ?? "Failed");
        return;
      }
      if (r.state === "pending_review") {
        toast.success("Submitted for review — we'll notify you when it's live");
      } else if (r.state === "published") {
        toast.success("Published");
      } else {
        toast.success("Saved as draft");
      }
      router.push("/hub/listings");
      router.refresh();
    });
  }

  return (
    <div className="grid lg:grid-cols-12 gap-6">
      <div className="lg:col-span-8 space-y-5">
        <Card className="p-6 space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label>Listing type</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(["product", "service"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => set("kind", k)}
                    className={
                      "h-11 rounded-[var(--radius-md)] border px-3 font-medium text-sm capitalize transition-colors " +
                      (form.kind === k
                        ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]"
                        : "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]")
                    }
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label required>Category</Label>
              <select
                className="h-11 w-full rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 text-[15px] capitalize"
                value={form.category}
                onChange={(e) => set("category", e.target.value as (typeof CATEGORIES)[number])}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <Label required>Title</Label>
            <Input
              placeholder="e.g. Handmade Kente A-line dress"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              maxLength={120}
            />
            <FieldHint>Max 120 characters. Clear and specific works best.</FieldHint>
          </div>
          <div>
            <Label>Tagline</Label>
            <Input
              placeholder="One-line pitch shown in the grid"
              value={form.tagline}
              onChange={(e) => set("tagline", e.target.value)}
              maxLength={180}
            />
          </div>
          <div>
            <Label required>Description</Label>
            <Textarea
              rows={6}
              placeholder="Everything a buyer needs to know. Sizes, materials, what's included, how soon it ships."
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
          <div>
            <Label>Tags</Label>
            <Input
              placeholder="Comma separated: kente, handmade, limited-run"
              value={form.tags}
              onChange={(e) => set("tags", e.target.value)}
            />
            <FieldHint>Up to 12. Only a-z, 0-9 — spaces become hyphens.</FieldHint>
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-display text-lg font-semibold">Images</h3>
          <p className="text-sm text-[var(--muted)] mt-1">
            The first image is the cover shown in the marketplace grid. Drag to reorder (coming soon).
          </p>
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {images.map((p, i) => {
              const src = p.startsWith("http") ? p : publicListingUrl(p) ?? "";
              return (
                <div key={p} className="relative aspect-square rounded-[var(--radius-md)] overflow-hidden border border-[var(--border)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                  {i === 0 && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur px-2 py-0.5 text-[10px] font-semibold">
                      <Star size={10} className="text-[var(--accent)]" /> Cover
                    </span>
                  )}
                  <button
                    type="button"
                    className="absolute top-1.5 right-1.5 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black"
                    onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            })}
            {images.length < 8 && (
              <label
                htmlFor="listing-file"
                className="aspect-square flex flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)]/40 cursor-pointer hover:border-[var(--primary)]/50 hover:bg-[var(--primary-soft)]/30 transition-colors"
              >
                <Upload size={20} className="text-[var(--muted)]" />
                <span className="mt-2 text-xs font-medium text-[var(--muted)]">
                  {uploading ? "Uploading…" : "Add image"}
                </span>
                <span className="mt-0.5 text-[10px] text-[var(--muted)]">JPG, PNG, WEBP · 12MB</span>
              </label>
            )}
          </div>
          <input
            id="listing-file"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFile(f);
              e.currentTarget.value = "";
            }}
          />
        </Card>
      </div>

      <aside className="lg:col-span-4 space-y-5">
        <Card className="p-6 space-y-4 lg:sticky lg:top-24">
          <div>
            <Label required>Price</Label>
            <Input
              inputMode="decimal"
              leading="₵"
              value={form.priceCedis}
              onChange={(e) => set("priceCedis", e.target.value)}
            />
            {form.priceCedis && (
              <FieldHint>= {formatGhs(ghsToPesewas(form.priceCedis || "0"))}</FieldHint>
            )}
          </div>
          <div>
            <Label>Delivery fee</Label>
            <Input
              inputMode="decimal"
              leading="₵"
              value={form.deliveryCedis}
              onChange={(e) => set("deliveryCedis", e.target.value)}
            />
          </div>
          <div>
            <Label>City / area</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          {form.kind === "product" && (
            <div>
              <Label>Stock</Label>
              <Input
                inputMode="numeric"
                placeholder="Leave blank for unlimited"
                value={form.stock}
                onChange={(e) => set("stock", e.target.value.replace(/\D/g, ""))}
              />
            </div>
          )}
          <label className="flex items-start gap-3 cursor-pointer rounded-md p-3 border border-[var(--border)] bg-[var(--surface-muted)]/40">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5 accent-[var(--primary)]"
              checked={form.deliveryAvailable}
              onChange={(e) => set("deliveryAvailable", e.target.checked)}
            />
            <span className="text-sm">
              <span className="font-medium block">Delivery available</span>
              <span className="text-[var(--muted)] text-xs">Enable if you can ship / deliver this.</span>
            </span>
          </label>

          <div className="pt-4 border-t border-[var(--border)] space-y-2">
            <Button
              className="w-full"
              size="lg"
              loading={isPending}
              onClick={() => submit(true)}
            >
              {initial?.id && initial.state === "published" ? "Save & keep live" : "Publish"}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              loading={isPending}
              onClick={() => submit(false)}
            >
              Save as draft
            </Button>
            <p className="text-[11px] text-[var(--muted)] text-center">
              Published listings gate on KYC approval. Drafts are private until you publish.
            </p>
          </div>
        </Card>
      </aside>
    </div>
  );
}
