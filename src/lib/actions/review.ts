"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { transactions, reviews, profiles } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { audit } from "@/lib/audit/log";
import { getSessionUser } from "@/lib/auth/session";
import { sendSms, SmsTemplates } from "@/lib/sms";

const schema = z.object({
  ref: z.string(),
  stars: z.number().int().min(1).max(5),
  body: z.string().optional(),
});

export async function submitReview(input: z.infer<typeof schema>) {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first" };
  const db = getDb();
  const [txn] = await db.select().from(transactions).where(eq(transactions.ref, parsed.data.ref)).limit(1);
  if (!txn) return { ok: false, error: "Not found" };
  if (txn.state !== "completed") return { ok: false, error: "You can only review completed deals" };
  const isBuyer = txn.buyerId === user.id;
  const isSeller = txn.sellerId === user.id;
  if (!isBuyer && !isSeller) return { ok: false, error: "Not your transaction" };

  const revieweeId = isBuyer ? txn.sellerId : txn.buyerId;
  const revieweeName = isBuyer ? txn.sellerName : txn.buyerName;

  await db.insert(reviews).values({
    transactionId: txn.id,
    reviewerId: user.id,
    revieweeId,
    revieweeName,
    stars: parsed.data.stars,
    body: parsed.data.body ?? null,
    isPublic: true,
  }).onConflictDoNothing();

  if (revieweeId) {
    const [agg] = await db
      .select({ avg: sql<number>`coalesce(avg(${reviews.stars})::float, 0)` })
      .from(reviews)
      .where(eq(reviews.revieweeId, revieweeId));
    await db
      .update(profiles)
      .set({ trustScore: Number(agg?.avg ?? 0), updatedAt: new Date() })
      .where(eq(profiles.id, revieweeId));
  }

  await audit({
    action: "review.create",
    targetType: "transaction",
    targetId: txn.id,
    payload: { stars: parsed.data.stars },
  });

  if (revieweeId) {
    const [revProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, revieweeId))
      .limit(1);
    if (revProfile?.phone) {
      const reviewerName = isBuyer ? txn.buyerName.split(" ")[0] : txn.sellerName.split(" ")[0];
      await sendSms({
        to: revProfile.phone,
        body: SmsTemplates.reviewReceived(parsed.data.stars, reviewerName),
        kind: "review.received",
        targetType: "transaction",
        targetId: txn.id,
      });
    }
  }

  revalidatePath(`/hub/transactions/${parsed.data.ref}`);
  revalidatePath("/reviews");
  return { ok: true };
}
