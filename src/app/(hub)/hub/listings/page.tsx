import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppTopbar } from "@/components/app-shell/topbar";
import { getSessionUser, getCurrentProfile } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listings } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { formatGhs, relativeTime } from "@/lib/utils";
import { Plus, Sparkles, AlertTriangle } from "lucide-react";
import { publicListingUrl } from "@/lib/storage/shared";
import { ListingRowActions } from "@/components/hub/listing-row-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "My listings" };

const STATE_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  draft: "neutral",
  pending_review: "warning",
  published: "success",
  suspended: "danger",
  archived: "neutral",
};

export default async function HubListingsPage() {
  const user = await getSessionUser();
  const profile = await getCurrentProfile();

  let rows: Array<{
    id: string;
    slug: string;
    title: string;
    category: string;
    kind: string;
    price: number;
    state: string;
    views: number;
    purchases: number;
    images: string[];
    featured: boolean;
    publishedAt: Date | null;
    createdAt: Date;
  }> = [];

  if (isDbLive && user) {
    try {
      const data = await getDb()
        .select({
          id: listings.id,
          slug: listings.slug,
          title: listings.title,
          category: listings.category,
          kind: listings.kind,
          price: listings.price,
          state: listings.state,
          views: listings.views,
          purchases: listings.purchases,
          images: listings.images,
          featured: listings.featured,
          publishedAt: listings.publishedAt,
          createdAt: listings.createdAt,
        })
        .from(listings)
        .where(eq(listings.sellerId, user.id))
        .orderBy(desc(listings.updatedAt))
        .limit(100);
      rows = data.map((r) => ({ ...r, images: (r.images ?? []) as string[] }));
    } catch {}
  }

  const kycBlocking = profile && profile.kycStatus !== "approved";

  return (
    <>
      <AppTopbar
        title="My listings"
        subtitle="Products and services you've listed on SBBS"
        actions={
          <Link href="/hub/listings/new">
            <Button size="sm">
              <Plus size={14} /> New listing
            </Button>
          </Link>
        }
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-6">
          {kycBlocking && (
            <Card className="p-5 border-[#ecdba8] bg-[#fbf2dd]">
              <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-[#7a5410] shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-[#7a5410]">KYC required to publish</p>
                  <p className="text-sm text-[#7a5410]/90 mt-1">
                    You can still draft listings, but published listings are gated on KYC approval.
                  </p>
                </div>
                <Link href="/hub/profile">
                  <Button size="sm" variant="secondary">Complete KYC</Button>
                </Link>
              </div>
            </Card>
          )}

          {rows.length === 0 ? (
            <Card className="p-14 text-center">
              <Sparkles size={22} className="mx-auto text-[var(--primary)]" />
              <h3 className="font-display text-xl font-semibold mt-3">Start your catalog</h3>
              <p className="mt-2 text-sm text-[var(--muted)] max-w-md mx-auto">
                List your first product or service. Buyers on SBBS will pay
                through protected checkout — no ghosting, no fronting dispatch.
              </p>
              <Link href="/hub/listings/new" className="inline-block mt-6">
                <Button>
                  <Plus size={14} /> Create your first listing
                </Button>
              </Link>
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
                            href={`/hub/listings/${l.id}/edit`}
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
                          {l.state === "published"
                            ? `Published ${l.publishedAt ? relativeTime(l.publishedAt) : ""}`
                            : `Created ${relativeTime(l.createdAt)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge tone={STATE_TONE[l.state] ?? "neutral"} dot>
                          {l.state.replace("_", " ")}
                        </Badge>
                        <ListingRowActions id={l.id} slug={l.slug} state={l.state} />
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
