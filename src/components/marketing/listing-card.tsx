import Link from "next/link";
import { ShieldCheck, Sparkles, MapPin, BadgeCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { formatGhs } from "@/lib/utils";
import { publicListingUrl } from "@/lib/storage";

export interface ListingCardData {
  id: string;
  slug: string;
  title: string;
  tagline: string | null;
  price: number;
  images: string[];
  category: string;
  kind: string;
  city: string | null;
  featured: boolean;
  sellerName: string | null;
  sellerHandle: string | null;
  sellerBadge: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  fashion: "Fashion",
  beauty: "Beauty",
  hair: "Hair",
  electronics: "Electronics",
  food: "Food",
  home: "Home",
  services: "Services",
  automotive: "Automotive",
  sneakers: "Sneakers",
  art: "Art",
  other: "Other",
};

export function ListingCard({
  listing,
  featured = false,
}: {
  listing: ListingCardData;
  featured?: boolean;
}) {
  const firstImage = listing.images?.[0];
  const imgSrc = firstImage
    ? firstImage.startsWith("http")
      ? firstImage
      : publicListingUrl(firstImage) ?? undefined
    : undefined;

  return (
    <Link href={`/products-services/${listing.slug}`} className="group block">
      <Card className="overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-pop)] h-full flex flex-col">
        <div className="relative aspect-[4/5] bg-[var(--surface-muted)] overflow-hidden">
          {imgSrc ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={imgSrc}
              alt={listing.title}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--primary-soft)] via-white to-[var(--accent-soft)] flex items-center justify-center">
              <span className="font-display font-bold text-5xl text-[var(--primary)]/30">
                {listing.title.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
          <div className="absolute top-3 left-3 flex gap-1.5">
            {featured && (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#7C3AED] text-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
                <Sparkles size={10} /> Featured
              </span>
            )}
            {listing.kind === "service" && (
              <span className="rounded-full bg-white/90 backdrop-blur text-[var(--foreground)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em]">
                Service
              </span>
            )}
          </div>
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/90 backdrop-blur text-[var(--primary)] px-2 py-1 text-[10px] font-semibold">
              <ShieldCheck size={11} /> Protected
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 p-3 flex items-end justify-between bg-gradient-to-t from-black/45 to-transparent">
            <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-white/90">
              {CATEGORY_LABELS[listing.category] ?? listing.category}
            </span>
            {listing.city && (
              <span className="inline-flex items-center gap-1 text-[11px] text-white/85">
                <MapPin size={11} /> {listing.city}
              </span>
            )}
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col">
          <h3 className="font-display font-semibold text-[16px] leading-snug line-clamp-2">
            {listing.title}
          </h3>
          {listing.tagline && (
            <p className="mt-1 text-xs text-[var(--muted)] line-clamp-1">{listing.tagline}</p>
          )}
          <div className="mt-auto pt-4 flex items-end justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-[0.14em] font-semibold text-[var(--muted)]">
                Price
              </p>
              <p className="font-display font-bold text-lg leading-none mt-0.5">
                {formatGhs(listing.price)}
              </p>
            </div>
            <div className="text-right min-w-0">
              {listing.sellerHandle && (
                <p className="text-xs font-semibold truncate flex items-center gap-1 justify-end">
                  @{listing.sellerHandle}
                  {listing.sellerBadge && (
                    <BadgeCheck size={12} className="text-[var(--primary)] shrink-0" />
                  )}
                </p>
              )}
              {listing.sellerName && (
                <p className="text-[11px] text-[var(--muted)] truncate">{listing.sellerName}</p>
              )}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
