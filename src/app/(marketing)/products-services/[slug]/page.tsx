import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { ArrowLeft, ShieldCheck, MapPin, BadgeCheck, Truck, Clock, Users } from "lucide-react";
import { Container, Section } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDb } from "@/lib/db/client";
import { listings, profiles } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { formatGhs, relativeTime } from "@/lib/utils";
import { publicListingUrl } from "@/lib/storage/shared";
import { trackListingView } from "@/lib/actions/listings";

export const dynamic = "force-dynamic";

export default async function ListingDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isDbLive) return notFound();
  const db = getDb();
  const [row] = await db
    .select({
      id: listings.id,
      slug: listings.slug,
      kind: listings.kind,
      title: listings.title,
      tagline: listings.tagline,
      description: listings.description,
      category: listings.category,
      price: listings.price,
      deliveryFee: listings.deliveryFee,
      images: listings.images,
      city: listings.city,
      deliveryAvailable: listings.deliveryAvailable,
      stock: listings.stock,
      tags: listings.tags,
      featured: listings.featured,
      state: listings.state,
      publishedAt: listings.publishedAt,
      views: listings.views,
      purchases: listings.purchases,
      sellerId: listings.sellerId,
      sellerName: profiles.displayName,
      sellerHandle: profiles.handle,
      sellerPhone: profiles.phone,
      sellerBio: profiles.bio,
      sellerLocation: profiles.location,
      sellerBadge: profiles.badgeEnabled,
      sellerKyc: profiles.kycStatus,
      sellerTrust: profiles.trustScore,
    })
    .from(listings)
    .leftJoin(profiles, eq(listings.sellerId, profiles.id))
    .where(and(eq(listings.slug, slug)))
    .limit(1);

  if (!row || row.state !== "published") return notFound();

  await trackListingView(row.id);

  const images = ((row.images ?? []) as string[]).map((p) =>
    p.startsWith("http") ? p : publicListingUrl(p) ?? p,
  );
  const cover = images[0];
  const extras = images.slice(1, 5);

  const buyHref = new URLSearchParams({
    seller: row.sellerHandle ?? "",
    sellerName: row.sellerName ?? "",
    sellerPhone: row.sellerPhone ?? "",
    item: row.title,
    itemLink: `/products-services/${row.slug}`,
    price: (row.price / 100).toFixed(2),
    delivery: (row.deliveryFee / 100).toFixed(2),
    listingId: row.id,
  });

  return (
    <Section className="bg-paper">
      <Container size="wide">
        <Link
          href="/products-services"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft size={14} /> All listings
        </Link>

        <div className="mt-6 grid lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 space-y-4">
            <Card className="overflow-hidden">
              <div className="relative aspect-[4/3] bg-[var(--surface-muted)]">
                {cover ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={cover}
                    alt={row.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] font-display text-5xl sm:text-6xl">
                    {row.title.slice(0, 1).toUpperCase()}
                  </div>
                )}
                {row.featured && (
                  <span className="absolute top-4 left-4 inline-flex items-center gap-1 rounded-full bg-[#7C3AED] text-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]">
                    Featured listing
                  </span>
                )}
              </div>
            </Card>
            {extras.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-3">
                {extras.map((src, i) => (
                  <Card key={i} className="overflow-hidden">
                    <div className="aspect-square bg-[var(--surface-muted)]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="h-full w-full object-cover" />
                    </div>
                  </Card>
                ))}
              </div>
            )}

            <Card className="p-6">
              <h2 className="font-display text-lg font-semibold">About this {row.kind === "service" ? "service" : "item"}</h2>
              <p className="mt-3 text-[15px] leading-relaxed whitespace-pre-line text-[var(--foreground)]/90">
                {row.description}
              </p>
              {Array.isArray(row.tags) && row.tags.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-2">
                  {(row.tags as string[]).map((t) => (
                    <Badge key={t} tone="neutral">#{t}</Badge>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <aside className="lg:col-span-5 space-y-4 lg:sticky lg:top-24 self-start">
            <Card className="p-6">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <Badge tone="accent">{row.category}</Badge>
                {row.city && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--muted)]">
                    <MapPin size={12} /> {row.city}
                  </span>
                )}
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold mt-3 leading-tight tracking-[-0.01em]">
                {row.title}
              </h1>
              {row.tagline && <p className="mt-2 text-[var(--muted)]">{row.tagline}</p>}
              <div className="mt-6 flex items-baseline gap-3">
                <span className="font-display font-bold text-4xl">{formatGhs(row.price)}</span>
                {row.deliveryFee > 0 && (
                  <span className="text-xs text-[var(--muted)]">
                    + {formatGhs(row.deliveryFee)} delivery
                  </span>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-3 text-xs text-[var(--muted)]">
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck size={12} className="text-[var(--primary)]" /> SBBS-protected
                </span>
                {row.deliveryAvailable && (
                  <span className="inline-flex items-center gap-1">
                    <Truck size={12} /> Delivery offered
                  </span>
                )}
                {row.stock && row.stock > 0 && (
                  <span className="inline-flex items-center gap-1">
                    {row.stock} in stock
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <Clock size={12} /> Listed {row.publishedAt ? relativeTime(row.publishedAt) : "recently"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users size={12} /> {row.views} views
                </span>
              </div>

              <div className="mt-7 flex flex-col gap-2">
                <Link href={`/buy?${buyHref.toString()}`}>
                  <Button size="lg" variant="violet" className="w-full rounded-full">
                    Buy with SBBS protection
                  </Button>
                </Link>
                <p className="text-xs text-[var(--muted)] text-center">
                  Money is held until you confirm delivery. No seller sees it before then.
                </p>
              </div>
            </Card>

            <Card className="p-6">
              <p className="text-xs uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">Sold by</p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-12 w-12 rounded-full bg-gradient-to-br from-[var(--primary)] to-indigo-700 text-white flex items-center justify-center font-display font-bold">
                  {(row.sellerName ?? row.sellerHandle ?? "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display font-semibold flex items-center gap-1.5">
                    {row.sellerName ?? "Seller"}
                    {row.sellerBadge && <BadgeCheck size={14} className="text-[var(--primary)]" />}
                  </p>
                  {row.sellerHandle && (
                    <p className="text-xs text-[var(--muted)] font-mono">@{row.sellerHandle}</p>
                  )}
                </div>
                {row.sellerHandle && (
                  <Link href={`/u/${row.sellerHandle}`}>
                    <Button size="sm" variant="ghost">View profile</Button>
                  </Link>
                )}
              </div>
              {row.sellerBio && (
                <p className="mt-4 text-sm text-[var(--muted)] leading-relaxed">{row.sellerBio}</p>
              )}
              <div className="mt-5 flex gap-3 text-xs">
                <Pill label="KYC" value={row.sellerKyc ?? "none"} good={row.sellerKyc === "approved"} />
                <Pill label="Trust" value={(row.sellerTrust ?? 0).toFixed(2)} good />
                <Pill label="Purchases" value={String(row.purchases ?? 0)} />
              </div>
            </Card>
          </aside>
        </div>
      </Container>
    </Section>
  );
}

function Pill({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium " +
        (good
          ? "bg-[var(--primary-soft)] text-[var(--primary)]"
          : "bg-[var(--surface-muted)] text-[var(--muted)]")
      }
    >
      <span className="uppercase tracking-[0.14em] font-semibold text-[10px]">{label}</span>
      <span className="font-mono">{value}</span>
    </span>
  );
}
