"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { audit } from "@/lib/audit/log";
import { getSessionUser } from "@/lib/auth/session";

const schema = z.object({
  displayName: z.string().min(2),
  handle: z.string().regex(/^[a-z0-9_]+$/i).optional().or(z.literal("")),
  bio: z.string().optional(),
  location: z.string().optional(),
  momoNumber: z.string().optional(),
  momoNetwork: z.string().optional(),
});

export async function saveProfile(input: z.infer<typeof schema>) {
  if (!isDbLive) return { ok: false, error: "DB not configured" };
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid" };
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Sign in first" };
  const db = getDb();
  await db
    .insert(profiles)
    .values({
      id: user.id,
      email: user.email,
      phone: user.phone,
      displayName: parsed.data.displayName,
      handle: parsed.data.handle || null,
      bio: parsed.data.bio || null,
      location: parsed.data.location || null,
      momoNumber: parsed.data.momoNumber || null,
      momoNetwork: parsed.data.momoNetwork || null,
    })
    .onConflictDoUpdate({
      target: profiles.id,
      set: {
        displayName: parsed.data.displayName,
        handle: parsed.data.handle || null,
        bio: parsed.data.bio || null,
        location: parsed.data.location || null,
        momoNumber: parsed.data.momoNumber || null,
        momoNetwork: parsed.data.momoNetwork || null,
        updatedAt: new Date(),
      },
    });
  await audit({
    action: "user.profile_update",
    targetType: "profile",
    targetId: user.id,
    payload: { fields: Object.keys(parsed.data) },
  });
  revalidatePath("/hub/profile");
  return { ok: true };
}
