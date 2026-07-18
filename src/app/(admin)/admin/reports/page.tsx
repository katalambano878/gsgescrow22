import { Container } from "@/components/ui/container";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppTopbar } from "@/components/app-shell/topbar";
import { isDbLive } from "@/lib/env";
import { getDb } from "@/lib/db/client";
import { disputes } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { formatGhs } from "@/lib/utils";
import { BarChart3, Download } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin · Reports" };

export default async function AdminReportsPage() {
  let monthly: Array<{ month: string; count: number; gmv: number }> = [];
  let outcomes = { resolvedBuyer: 0, resolvedSeller: 0, partial: 0, open: 0 };
  if (isDbLive) {
    try {
      const db = getDb();
      const m = await db.execute(sql`
        select to_char(date_trunc('month', created_at), 'Mon YYYY') as month,
               count(*)::int as count,
               coalesce(sum(total_charged), 0)::bigint as gmv
        from transactions
        where created_at > now() - interval '12 months'
        group by 1
        order by min(created_at) asc
      `);
      monthly = (m as unknown as Array<{ month: string; count: number; gmv: number | string }>).map((r) => ({
        month: r.month,
        count: Number(r.count),
        gmv: Number(r.gmv),
      }));

      const o = await db
        .select({
          resolvedBuyer: sql<number>`count(*) filter (where state = 'resolved_buyer')::int`,
          resolvedSeller: sql<number>`count(*) filter (where state = 'resolved_seller')::int`,
          partial: sql<number>`count(*) filter (where state = 'partial')::int`,
          open: sql<number>`count(*) filter (where state in ('open','in_review'))::int`,
        })
        .from(disputes);
      outcomes = {
        resolvedBuyer: Number(o[0]?.resolvedBuyer ?? 0),
        resolvedSeller: Number(o[0]?.resolvedSeller ?? 0),
        partial: Number(o[0]?.partial ?? 0),
        open: Number(o[0]?.open ?? 0),
      };
    } catch {}
  }

  const maxGmv = Math.max(1, ...monthly.map((m) => m.gmv));

  return (
    <>
      <AppTopbar
        title="Reports"
        subtitle="Monthly GMV and dispute outcomes"
        actions={
          <div className="flex gap-2">
            {/* CSV downloads must be plain <a> tags (API routes, not pages). */}
            { }
            <a href="/api/admin/export/transactions" download>
              <Button variant="secondary" size="sm"><Download size={14} /> Transactions</Button>
            </a>
            { }
            <a href="/api/admin/export/payouts" download>
              <Button variant="secondary" size="sm"><Download size={14} /> Payouts</Button>
            </a>
            { }
            <a href="/api/admin/export/reviews" download>
              <Button variant="secondary" size="sm"><Download size={14} /> Reviews</Button>
            </a>
          </div>
        }
      />
      <main className="flex-1">
        <Container size="wide" className="py-8 grid lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2 p-6">
            <h2 className="font-display text-lg font-semibold flex items-center gap-2">
              <BarChart3 size={18} /> Monthly GMV
            </h2>
            {monthly.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--muted)]">No data yet</p>
            ) : (
              <div className="mt-6 space-y-2">
                {monthly.map((m) => (
                  <div key={m.month} className="grid grid-cols-12 items-center gap-3">
                    <span className="col-span-2 text-xs text-[var(--muted)] font-mono">{m.month}</span>
                    <div className="col-span-7 h-3 rounded-full bg-[var(--surface-muted)] overflow-hidden">
                      <div
                        className="h-full bg-[var(--primary)]"
                        style={{ width: `${(m.gmv / maxGmv) * 100}%` }}
                      />
                    </div>
                    <span className="col-span-2 text-sm font-semibold text-right">{formatGhs(m.gmv)}</span>
                    <span className="col-span-1 text-xs text-[var(--muted)] text-right">{m.count}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-lg font-semibold">Dispute outcomes</h2>
            <ul className="mt-5 space-y-3 text-sm">
              <Outcome label="Resolved for buyer" value={outcomes.resolvedBuyer} />
              <Outcome label="Resolved for seller" value={outcomes.resolvedSeller} />
              <Outcome label="Partial" value={outcomes.partial} />
              <Outcome label="Open / in review" value={outcomes.open} />
            </ul>
          </Card>
        </Container>
      </main>
    </>
  );
}

function Outcome({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="font-display text-xl font-bold">{value}</span>
    </li>
  );
}
