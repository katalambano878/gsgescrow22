import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppTopbar } from "@/components/app-shell/topbar";
import { isDbLive } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { kycSubmissions, profiles } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { relativeTime } from "@/lib/utils";
export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · KYC" };

export default async function AdminKycPage() {
  let rows: Array<{
    id: string;
    legalName: string;
    docType: string;
    state: string;
    createdAt: Date;
    profileEmail: string | null;
    profileName: string | null;
  }> = [];
  if (isDbLive) {
    try {
      const db = getDb();
      rows = await db
        .select({
          id: kycSubmissions.id,
          legalName: kycSubmissions.legalName,
          docType: kycSubmissions.docType,
          state: kycSubmissions.state,
          createdAt: kycSubmissions.createdAt,
          profileEmail: profiles.email,
          profileName: profiles.displayName,
        })
        .from(kycSubmissions)
        .leftJoin(profiles, eq(kycSubmissions.profileId, profiles.id))
        .orderBy(desc(kycSubmissions.createdAt))
        .limit(100);
    } catch {}
  }

  const TONE: Record<string, "neutral" | "warning" | "success" | "danger"> = {
    none: "neutral",
    pending: "warning",
    approved: "success",
    rejected: "danger",
  };

  return (
    <>
      <AppTopbar title="KYC Verifications" subtitle="Approve or reject seller identity submissions" />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-4">
          {rows.length === 0 ? (
            <Card className="p-14 text-center">
              <h3 className="font-display text-xl font-semibold">No submissions</h3>
              <p className="mt-2 text-sm text-[var(--muted)]">When a seller submits KYC documents they&rsquo;ll appear here.</p>
            </Card>
          ) : (
            rows.map((r) => (
              <Card key={r.id} className="p-6 grid lg:grid-cols-12 gap-4 items-center">
                <div className="lg:col-span-4">
                  <p className="font-medium">{r.legalName}</p>
                  <p className="text-xs text-[var(--muted)] mt-1">{r.profileEmail ?? "—"}</p>
                </div>
                <div className="lg:col-span-2">
                  <Badge tone="neutral">{r.docType.replace("_", " ")}</Badge>
                </div>
                <div className="lg:col-span-2">
                  <Badge tone={TONE[r.state] ?? "neutral"} dot>{r.state}</Badge>
                </div>
                <div className="lg:col-span-2 text-xs text-[var(--muted)]">{relativeTime(r.createdAt)}</div>
                <div className="lg:col-span-2 flex justify-end gap-2">
                  <Link href={`/admin/kyc/${r.id}`}>
                    <Button size="sm" variant="secondary">Review</Button>
                  </Link>
                </div>
              </Card>
            ))
          )}
        </Container>
      </main>
    </>
  );
}
