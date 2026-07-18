"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, Zap } from "lucide-react";
import { formatGhs, relativeTime } from "@/lib/utils";
import { useAdminRealtime } from "@/lib/realtime/use-admin-realtime";

interface Snapshot {
  active: number;
  disputed: number;
  gmv: number;
  pendingPayouts: number;
  at: string;
}

interface TxnEvent {
  id: string;
  ref: string;
  state: string;
  item: string;
  total: number;
  at: string;
}

export function LiveTicker() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<TxnEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const retryRef = useRef(0);

  // Supabase Realtime — pushes instantly on table changes. Complements SSE's
  // 5s snapshot polling so the UI feels truly live without hammering the DB.
  const { events: realtimeEvents, connected: realtimeConnected } = useAdminRealtime({
    tables: ["transactions", "payouts", "alerts"],
  });

  // Fold new realtime rows into the ticker using the state-adjust-during-
  // render pattern (guarded by receivedAt) instead of a setState-in-effect,
  // which can cascade renders.
  const [lastRealtimeAt, setLastRealtimeAt] = useState<string | null>(null);
  const latestRealtime = realtimeEvents[0];
  if (latestRealtime && latestRealtime.receivedAt !== lastRealtimeAt) {
    setLastRealtimeAt(latestRealtime.receivedAt);
    if (latestRealtime.table === "transactions") {
      const row = latestRealtime.row as Partial<TxnEvent> & { id?: string };
      if (row.id && row.ref) {
        setEvents((prev) => [
          {
            id: String(row.id),
            ref: String(row.ref),
            state: String(row.state ?? ""),
            item: String((row as unknown as { item_description?: string }).item_description ?? ""),
            total: Number((row as unknown as { total_charged?: number }).total_charged ?? 0),
            at: latestRealtime.receivedAt,
          },
          ...prev,
        ].slice(0, 12));
      }
    }
  }

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      try {
        es = new EventSource("/api/admin/live");
        es.onopen = () => {
          setConnected(true);
          retryRef.current = 0;
        };
        es.onerror = () => {
          setConnected(false);
          es?.close();
          const delay = Math.min(15_000, 1000 * 2 ** retryRef.current);
          retryRef.current += 1;
          setTimeout(connect, delay);
        };
        es.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data) as
              | ({ type: "snapshot" } & Snapshot)
              | { type: "transactions"; rows: TxnEvent[] }
              | { type: "alerts"; rows: unknown[] }
              | { type: "hello"; at: string }
              | { type: "error"; message: string };
            if (msg.type === "snapshot") setSnap(msg);
            if (msg.type === "transactions") {
              setEvents((prev) => [...msg.rows, ...prev].slice(0, 12));
            }
          } catch {
            // ignore
          }
        };
      } catch {
        setConnected(false);
      }
    };
    connect();
    return () => {
      cancelled = true;
      es?.close();
    };
  }, []);

  if (!snap && events.length === 0) {
    return (
      <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-xs text-[var(--muted)]">
        <Activity size={12} /> Waiting for live signal…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold">
        <span className="relative flex h-2 w-2">
          {(connected || realtimeConnected) && (
            <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--primary)] opacity-70 animate-ping" />
          )}
          <span
            className={
              "relative inline-flex h-2 w-2 rounded-full " +
              (connected || realtimeConnected ? "bg-[var(--primary)]" : "bg-[var(--muted)]")
            }
          />
        </span>
        {realtimeConnected ? (
          <span className="inline-flex items-center gap-1">
            <Zap size={10} className="text-[var(--accent)]" /> Realtime
          </span>
        ) : connected ? (
          "Polling"
        ) : (
          "Offline"
        )}
      </span>
      {snap && (
        <>
          <Pulse label="Active" value={snap.active} />
          <Pulse label="Queued payouts" value={snap.pendingPayouts} />
          <Pulse label="Disputes" value={snap.disputed} tone={snap.disputed > 0 ? "danger" : "neutral"} />
          <Pulse label="GMV protected" value={formatGhs(snap.gmv)} />
          <span className="text-xs text-[var(--muted)]">Updated {relativeTime(snap.at)}</span>
        </>
      )}
      {events.length > 0 && (
        <span className="text-xs text-[var(--muted)]">
          Latest: <span className="font-mono text-[var(--foreground)]">{events[0].ref}</span> → {events[0].state}
        </span>
      )}
    </div>
  );
}

function Pulse({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  tone?: "neutral" | "danger";
}) {
  return (
    <span
      className={
        "inline-flex items-center gap-2 text-xs " +
        (tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]")
      }
    >
      <span className="uppercase tracking-[0.14em] font-semibold">{label}</span>
      <span className="font-display font-bold text-[var(--foreground)]">{value}</span>
    </span>
  );
}
