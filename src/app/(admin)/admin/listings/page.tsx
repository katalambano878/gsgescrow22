import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppTopbar } from "@/components/app-shell/topbar";
import { getDb } from "@/lib/db/client";
import { listings, profiles } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { formatGhs, relativeTime } from "@/lib/utils";
import { publicListingUrl } from "@/lib/storage/shared";
import { ModerateActions } from "@/components/admin/moderate-actions";
import { Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Listings" };

const STATE_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  suspended: "danger",
  archived: "neutral",
};

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const sp = await searchParams;
  const filter = sp.state ?? "all";

  let rows: Array<{
    id: string;
    slug: string;
    title: string;
    category: string;
    kind: string;
    price: number;
    state: string;
    featured: boolean;
    images: string[];
    views: number;
    purchases: number;
    createdAt: Date;
    sellerName: string | null;
    sellerHandle: string | null;
    sellerKyc: string;
  }> = [];

  if (isDbLive) {
    try {
      const db = getDb();
      const baseSelect = db
        .select({
          id: listings.id,
          slug: listings.slug,
          title: listings.title,
          category: listings.category,
          kind: listings.kind,
          price: listings.price,
          state: listings.state,
          featured: listings.featured,
          images: listings.images,
          views: listings.views,
          purchases: listings.purchases,
          createdAt: listings.createdAt,
          sellerName: profiles.displayName,
          sellerHandle: profiles.handle,
          sellerKyc: profiles.kycStatus,
        })
        .from(listings)
        .leftJoin(profiles, eq(listings.sellerId, profiles.id));
      const filtered =
        filter === "all"
          ? baseSelect
          : baseSelect.where(
              eq(
                listings.state,
                filter as "draft" | "pending_review" | "published" | "suspended" | "archived",
              ),
            );
      const data = await filtered.orderBy(desc(listings.updatedAt)).limit(200);
      rows = data.map((r) => ({
        ...r,
        images: (r.images ?? []) as string[],
        sellerName: r.sellerName ?? null,
        sellerHandle: r.sellerHandle ?? null,
        sellerKyc: r.sellerKyc ?? "none",
      }));
    } catch {}
  }

  const filters = [
    { id: "all", label: "All" },
    { id: "pending_review", label: "Pending review" },
    { id: "published", label: "Published" },
    { id: "suspended", label: "Suspended" },
    { id: "draft", label: "Drafts" },
  ];

  return (
    <>
      <AppTopbar
        title="Listings moderation"
        subtitle="Review, feature, and moderate marketplace listings"
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-6">
          <div className="flex gap-2 flex-wrap">
            {filters.map((f) => (
              <Link
                key={f.id}
                href={f.id === "all" ? "/admin/listings" : `/admin/listings?state=${f.id}`}
                className={
                  "px-3 py-1.5 rounded-full text-sm font-medium " +
                  (filter === f.id
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--muted)] hover:text-[var(--foreground)]")
                }
              >
                {f.label}
              </Link>
            ))}
          </div>

          {rows.length === 0 ? (
            <Card className="p-14 text-center">
              <p className="text-sm text-[var(--muted)]">No listings in this state.</p>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <ul className="divide-y divide-[var(--border)]">
                {rows.map((l) => {
                  const img = l.images?.[0];
                  const imgSrc = img
                    ? img.startsWith("http")
                      ? img
                      : publicListingUrl(img) ?? undefined
                    : undefined;
                  return (
                    <li key={l.id} className="flex items-start gap-4 p-4">
                      <div className="h-16 w-16 rounded-md bg-[var(--surface-muted)] overflow-hidden shrink-0">
                        {imgSrc ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={imgSrc} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="h-full w-full flex items-center justify-center font-display font-bold text-[var(--muted)]">
                            {l.title.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/products-services/${l.slug}`}
                            target="_blank"
                            className="font-medium hover:underline truncate"
                          >
                            {l.title}
                          </Link>
                          {l.featured && (
                            <Badge tone="accent">
                              <Sparkles size={10} className="mr-1" /> Featured
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-[var(--muted)] mt-1 flex items-center gap-2 flex-wrap">
                          <span className="capitalize">{l.category}</span>
                          <span>·</span>
                          <span className="capitalize">{l.kind}</span>
                          <span>·</span>
                          <span>{formatGhs(l.price)}</span>
                          <span>·</span>
                          <span>{l.views} views</span>
                          <span>·</span>
                          <span>{l.purchases} purchases</span>
                        </p>
                        <p className="text-[11px] text-[var(--muted)] mt-1">
                          by {l.sellerName ?? "—"}
                          {l.sellerHandle && <span className="font-mono"> @{l.sellerHandle}</span>}
                          {" · "}KYC <span className="capitalize">{l.sellerKyc}</span>
                          {" · "}Created {relativeTime(l.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge tone={STATE_TONE[l.state] ?? "neutral"} dot>
                          {l.state.replace("_", " ")}
                        </Badge>
                        <ModerateActions id={l.id} state={l.state} featured={l.featured} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </Container>
      </main>
    </>
  );
}
