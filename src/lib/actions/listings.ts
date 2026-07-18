"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { listings, profiles } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { audit } from "@/lib/audit/log";
import { getCurrentProfile, isAdminRole } from "@/lib/auth/session";
import { ghsToPesewas } from "@/lib/utils";
import { sendSms, SmsTemplates } from "@/lib/sms";

const categoryEnum = z.enum([
  "fashion",
  "beauty",
  "hair",
  "electronics",
  "food",
  "home",
  "services",
  "automotive",
  "sneakers",
  "art",
  "other",
]);

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  kind: z.enum(["product", "service"]).default("product"),
  title: z.string().min(3).max(120),
  tagline: z.string().max(180).optional(),
  description: z.string().min(10).max(4000),
  category: categoryEnum,
  priceCedis: z.coerce.number().min(0),
  deliveryCedis: z.coerce.number().min(0).default(0),
  images: z.array(z.string().min(1)).max(8).default([]),
  city: z.string().max(80).optional(),
  deliveryAvailable: z.boolean().default(true),
  stock: z.coerce.number().int().min(0).optional(),
  tags: z.array(z.string()).max(12).default([]),
  publish: z.boolean().default(false),
});

export type UpsertListingInput = z.infer<typeof upsertSchema>;

function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${base || "listing"}-${rand}`;
}

export async function upsertListing(
  input: UpsertListingInput,
): Promise<
  | { ok: true; id: string; slug: string; state: string }
  | { ok: false; error: string }
> {
  const parsed = upsertSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  }
  if (!isDbLive) return { ok: false, error: "DB not configured" };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sign in to list items" };

  const data = parsed.data;
  const db = getDb();

  // Only KYC-approved sellers can publish live; others go to draft.
  const canPublish = profile.kycStatus === "approved" || profile.role === "admin" || profile.role === "superadmin";
  const initialState = data.publish ? (canPublish ? "published" : "pending_review") : "draft";

  const payload = {
    sellerId: profile.id,
    kind: data.kind,
    title: data.title,
    tagline: data.tagline ?? null,
    description: data.description,
    category: data.category,
    price: ghsToPesewas(data.priceCedis),
    deliveryFee: ghsToPesewas(data.deliveryCedis),
    images: data.images,
    city: data.city ?? null,
    deliveryAvailable: data.deliveryAvailable,
    stock: data.stock ?? null,
    tags: data.tags,
    state: initialState as "draft" | "pending_review" | "published",
    publishedAt: initialState === "published" ? new Date() : null,
    updatedAt: new Date(),
  };

  if (data.id) {
    const [existing] = await db.select().from(listings).where(eq(listings.id, data.id)).limit(1);
    if (!existing) return { ok: false, error: "Not found" };
    if (existing.sellerId !== profile.id && !isAdminRole(profile.role)) {
      return { ok: false, error: "Not authorized" };
    }
    await db.update(listings).set(payload).where(eq(listings.id, data.id));
    await audit({
      action: "listing.upsert",
      targetType: "listing",
      targetId: data.id,
      payload: { state: payload.state, title: payload.title },
    });
    revalidatePath("/hub/listings");
    revalidatePath("/products-services");
    revalidatePath(`/products-services/${existing.slug}`);
    return { ok: true, id: existing.id, slug: existing.slug, state: payload.state };
  }

  const slug = slugify(data.title);
  const [row] = await db
    .insert(listings)
    .values({ ...payload, slug })
    .returning();
  if (!row) return { ok: false, error: "Failed to create listing" };

  await audit({
    action: "listing.upsert",
    targetType: "listing",
    targetId: row.id,
    payload: { created: true, state: row.state, title: row.title },
  });

  revalidatePath("/hub/listings");
  revalidatePath("/products-services");
  return { ok: true, id: row.id, slug: row.slug, state: row.state };
}

export async function togglePublish(id: string): Promise<{ ok: boolean; error?: string; state?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sign in" };
  const db = getDb();
  const [row] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!row) return { ok: false, error: "Not found" };
  if (row.sellerId !== profile.id && !isAdminRole(profile.role)) return { ok: false, error: "Not authorized" };

  const canPublish = profile.kycStatus === "approved" || isAdminRole(profile.role);
  let next: "draft" | "pending_review" | "published";
  if (row.state === "published") next = "draft";
  else if (canPublish) next = "published";
  else next = "pending_review";

  await db
    .update(listings)
    .set({
      state: next,
      publishedAt: next === "published" ? new Date() : row.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, id));

  await audit({
    action: "listing.upsert",
    targetType: "listing",
    targetId: id,
    payload: { from: row.state, to: next },
  });

  revalidatePath("/hub/listings");
  revalidatePath("/products-services");
  revalidatePath(`/products-services/${row.slug}`);
  return { ok: true, state: next };
}

export async function deleteListing(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, error: "Sign in" };
  const db = getDb();
  const [row] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!row) return { ok: false, error: "Not found" };
  if (row.sellerId !== profile.id && !isAdminRole(profile.role)) return { ok: false, error: "Not authorized" };

  await db.update(listings).set({ state: "archived", updatedAt: new Date() }).where(eq(listings.id, id));
  await audit({
    action: "listing.archive",
    targetType: "listing",
    targetId: id,
    payload: { archived: true },
  });
  revalidatePath("/hub/listings");
  revalidatePath("/products-services");
  return { ok: true };
}

export async function setFeatured(id: string, featured: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const profile = await getCurrentProfile();
  if (!profile || !isAdminRole(profile.role)) return { ok: false, error: "Not authorized" };
  const db = getDb();
  await db.update(listings).set({ featured, updatedAt: new Date() }).where(eq(listings.id, id));
  await audit({
    action: "listing.feature",
    targetType: "listing",
    targetId: id,
    payload: { featured },
  });
  revalidatePath("/admin/listings");
  revalidatePath("/products-services");
  return { ok: true };
}

const moderateSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["approve", "suspend", "reinstate"]),
  reason: z.string().min(4),
});

export async function moderateListing(input: z.infer<typeof moderateSchema>) {
  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid" };
  if (!isDbLive) return { ok: false as const, error: "DB not configured" };
  const profile = await getCurrentProfile();
  if (!profile || !isAdminRole(profile.role)) return { ok: false as const, error: "Not authorized" };

  const db = getDb();
  const [row] = await db.select().from(listings).where(eq(listings.id, parsed.data.id)).limit(1);
  if (!row) return { ok: false as const, error: "Not found" };

  const next =
    parsed.data.action === "approve"
      ? "published"
      : parsed.data.action === "suspend"
        ? "suspended"
        : "published";

  await db
    .update(listings)
    .set({
      state: next,
      publishedAt: next === "published" ? new Date() : row.publishedAt,
      suspendedReason: parsed.data.action === "suspend" ? parsed.data.reason : null,
      updatedAt: new Date(),
    })
    .where(eq(listings.id, row.id));

  await audit({
    action: "listing.moderate",
    targetType: "listing",
    targetId: row.id,
    reason: parsed.data.reason,
    payload: { moderation: parsed.data.action, from: row.state, to: next },
  });

  const [seller] = await getDb()
    .select()
    .from(profiles)
    .where(eq(profiles.id, row.sellerId))
    .limit(1);
  if (seller?.phone) {
    await sendSms({
      to: seller.phone,
      body:
        parsed.data.action === "suspend"
          ? SmsTemplates.listingSuspended(row.title, parsed.data.reason)
          : SmsTemplates.listingApproved(row.title),
      kind: `listing.${parsed.data.action}`,
      targetType: "listing",
      targetId: row.id,
    });
  }

  revalidatePath("/admin/listings");
  revalidatePath("/products-services");
  revalidatePath(`/products-services/${row.slug}`);
  return { ok: true as const };
}

export async function trackListingView(id: string): Promise<void> {
  if (!isDbLive) return;
  try {
    const db = getDb();
    await db
      .update(listings)
      .set({ views: sql`${listings.views} + 1` })
      .where(eq(listings.id, id));
  } catch {
    // best effort
  }
}
