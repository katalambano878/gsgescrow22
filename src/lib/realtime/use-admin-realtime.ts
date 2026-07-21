"use client";

import { useEffect, useState } from "react";

export interface RealtimeEvent {
  table: string;
  eventType: "INSERT" | "UPDATE" | "DELETE";
  row: Record<string, unknown>;
  oldRow?: Record<string, unknown>;
  receivedAt: string;
}

type PollPayload = {
  ok: boolean;
  events?: Array<{
    table: string;
    eventType: "INSERT" | "UPDATE" | "DELETE";
    row: Record<string, unknown>;
    receivedAt: string;
  }>;
};

/**
 * Polls `/api/admin/live` for recent admin activity. Replaces Supabase
 * Realtime `postgres_changes` with a visibility-aware 3.5s poll so the
 * live ticker keeps working on plain Postgres.
 */
export function useAdminRealtime(opts: {
  tables?: Array<"transactions" | "payouts" | "alerts" | "transaction_events" | "listings" | "sms_log">;
  bufferSize?: number;
} = {}) {
  const tables = opts.tables ?? [
    "transactions",
    "payouts",
    "alerts",
    "transaction_events",
  ];
  const bufferSize = opts.bufferSize ?? 30;
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSeen = "";

    async function tick() {
      if (cancelled) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        timer = setTimeout(tick, 3500);
        return;
      }
      try {
        const qs = new URLSearchParams({
          tables: tables.join(","),
          since: lastSeen,
        });
        const res = await fetch(`/api/admin/live?${qs.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (!res.ok) {
          setConnected(false);
        } else {
          const data = (await res.json()) as PollPayload;
          setConnected(Boolean(data.ok));
          if (data.events?.length) {
            setEvents((prev) => {
              const next = [...data.events!, ...prev].slice(0, bufferSize);
              return next;
            });
            lastSeen = data.events[0]!.receivedAt;
          }
        }
      } catch {
        setConnected(false);
      }
      if (!cancelled) timer = setTimeout(tick, 3500);
    }

    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [tables.join(","), bufferSize]);

  return { events, connected };
}
