import { desc, sql } from "drizzle-orm";
import Link from "next/link";
import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppTopbar } from "@/components/app-shell/topbar";
import { isDbLive } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { smsLog } from "@/lib/db/schema";
import { redactPhone, relativeTime } from "@/lib/utils";
import { SmsTestConsole } from "@/components/admin/sms-test-console";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · SMS log" };

const TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  queued: "info",
  sent: "info",
  delivered: "success",
  failed: "danger",
  undelivered: "warning",
};

export default async function AdminSmsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; kind?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status ?? "all";
  const kindFilter = sp.kind ?? "all";

  let rows: Array<{
    id: string;
    provider: string;
    senderId: string | null;
    recipient: string;
    body: string;
    kind: string | null;
    ref: string | null;
    providerMessageId: string | null;
    status: string;
    error: string | null;
    createdAt: Date;
  }> = [];
  let stats = { total: 0, sent: 0, failed: 0, delivered: 0, last24h: 0 };

  if (isDbLive) {
    try {
      const db = getDb();
      const whereStatus =
        statusFilter !== "all" ? sql`status = ${statusFilter}` : sql`true`;
      const whereKind = kindFilter !== "all" ? sql`kind = ${kindFilter}` : sql`true`;
      const data = await db
        .select()
        .from(smsLog)
        .where(sql`${whereStatus} and ${whereKind}`)
        .orderBy(desc(smsLog.createdAt))
        .limit(150);
      rows = data;

      const [s] = await db
        .select({
          total: sql<number>`count(*)::int`,
          sent: sql<number>`count(*) filter (where status in ('sent','delivered'))::int`,
          failed: sql<number>`count(*) filter (where status = 'failed')::int`,
          delivered: sql<number>`count(*) filter (where status = 'delivered')::int`,
          last24h: sql<number>`count(*) filter (where created_at > now() - interval '24 hours')::int`,
        })
        .from(smsLog);
      stats = {
        total: Number(s?.total ?? 0),
        sent: Number(s?.sent ?? 0),
        failed: Number(s?.failed ?? 0),
        delivered: Number(s?.delivered ?? 0),
        last24h: Number(s?.last24h ?? 0),
      };
    } catch {}
  }

  const filters = [
    { id: "all", label: "All" },
    { id: "sent", label: "Sent" },
    { id: "delivered", label: "Delivered" },
    { id: "failed", label: "Failed" },
    { id: "queued", label: "Queued" },
  ];

  return (
    <>
      <AppTopbar
        title="SMS log"
        subtitle={`${stats.total.toLocaleString()} total · ${stats.last24h} in last 24h · ${stats.failed} failed`}
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 space-y-6">
          <SmsTestConsole />

          <div className="flex gap-2 flex-wrap">
            {filters.map((f) => (
              <Link
                key={f.id}
                href={f.id === "all" ? "/admin/sms" : `/admin/sms?status=${f.id}`}
                className={
                  "px-3 py-1.5 rounded-full text-sm font-medium " +
                  (statusFilter === f.id
                    ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    : "bg-[var(--surface)] border border-[var(--border-strong)] text-[var(--muted)] hover:text-[var(--foreground)]")
                }
              >
                {f.label}
              </Link>
            ))}
          </div>

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs uppercase tracking-[0.14em] text-[var(--muted)] border-b border-[var(--border)] bg-[var(--surface-muted)]/40">
                    <th className="text-left px-6 py-3 font-semibold">When</th>
                    <th className="text-left px-4 py-3 font-semibold">To</th>
                    <th className="text-left px-4 py-3 font-semibold">Kind</th>
                    <th className="text-left px-4 py-3 font-semibold">Body</th>
                    <th className="text-left px-4 py-3 font-semibold">Provider</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-[var(--muted)]">
                        No SMS records yet
                      </td>
                    </tr>
                  )}
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-[var(--surface-muted)]/40 align-top">
                      <td className="px-6 py-3 text-[var(--muted)] whitespace-nowrap">
                        {relativeTime(r.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{redactPhone(r.recipient)}</td>
                      <td className="px-4 py-3 text-xs">
                        {r.kind ? <Badge tone="neutral">{r.kind}</Badge> : <span className="text-[var(--muted)]">—</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[420px]">
                        <p className="text-xs leading-relaxed line-clamp-3">{r.body}</p>
                        {r.ref && (
                          <p className="text-[11px] text-[var(--muted)] font-mono mt-1">ref · {r.ref}</p>
                        )}
                        {r.error && (
                          <p className="text-[11px] text-[var(--danger)] mt-1">{r.error}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 capitalize text-[var(--muted)] text-xs">{r.provider}</td>
                      <td className="px-4 py-3">
                        <Badge tone={TONE[r.status] ?? "neutral"} dot>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </Container>
      </main>
    </>
  );
}
