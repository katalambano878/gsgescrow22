import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { payouts, transactions, webhooksLog } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { getPsp } from "@/lib/payments";
import { formatGhs } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { env } from "@/lib/env";

export interface ReconFinding {
  severity: "critical" | "warning" | "info";
  kind:
    | "stuck_awaiting_payment"
    | "stuck_processing_payout"
    | "missing_payout"
    | "psp_variance"
    | "unverified_webhook";
  ref: string;
  message: string;
  payload?: Record<string, unknown>;
}

export interface ReconReport {
  ranAt: string;
  durationMs: number;
  windowStart: string;
  windowEnd: string;
  counts: {
    transactionsScanned: number;
    payoutsScanned: number;
    webhooksScanned: number;
  };
  findings: ReconFinding[];
  summary: {
    critical: number;
    warning: number;
    info: number;
  };
}

interface RunOptions {
  /** Hours back to scan. Default 24. */
  hours?: number;
  /** Max PSP verifyCharge() calls per run to contain cost. */
  maxPspCalls?: number;
}

/**
 * Diff our DB against PSP ground-truth for the last N hours. Produces a
 * list of discrepancies ops needs to look at. Designed to be called from
 * a daily cron and surfaced via /admin/runbook.
 */
export async function runDailyReconciliation(opts: RunOptions = {}): Promise<ReconReport> {
  const start = performance.now();
  const ranAt = new Date();
  const hours = opts.hours ?? 24;
  const maxPspCalls = opts.maxPspCalls ?? 40;
  const windowStart = new Date(ranAt.getTime() - hours * 60 * 60 * 1000);

  const findings: ReconFinding[] = [];
  let transactionsScanned = 0;
  let payoutsScanned = 0;
  let webhooksScanned = 0;
  let pspCallsUsed = 0;

  if (!isDbLive) {
    return {
      ranAt: ranAt.toISOString(),
      durationMs: Math.round(performance.now() - start),
      windowStart: windowStart.toISOString(),
      windowEnd: ranAt.toISOString(),
      counts: { transactionsScanned: 0, payoutsScanned: 0, webhooksScanned: 0 },
      findings,
      summary: { critical: 0, warning: 0, info: 0 },
    };
  }

  const db = getDb();
  const psp = getPsp();

  // 1. Transactions stuck in awaiting_payment older than 1h — verify via PSP.
  const stuckAwaiting = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.state, "awaiting_payment"),
        gte(transactions.createdAt, windowStart),
        sql`${transactions.createdAt} < now() - interval '1 hour'`,
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(100);
  transactionsScanned += stuckAwaiting.length;

  for (const t of stuckAwaiting) {
    if (pspCallsUsed >= maxPspCalls) break;
    try {
      const v = await psp.verifyCharge(t.ref);
      pspCallsUsed += 1;
      if (v.status === "succeeded") {
        findings.push({
          severity: "critical",
          kind: "psp_variance",
          ref: t.ref,
          message: `PSP reports SUCCEEDED but our state is still awaiting_payment. Missing settlement webhook.`,
          payload: { pspStatus: v.status, pspAmount: v.amount, ours: t.totalCharged },
        });
      } else if (v.status === "failed") {
        findings.push({
          severity: "info",
          kind: "stuck_awaiting_payment",
          ref: t.ref,
          message: `PSP confirms failure. Safe to cancel.`,
        });
      } else {
        findings.push({
          severity: "warning",
          kind: "stuck_awaiting_payment",
          ref: t.ref,
          message: `Awaiting payment >1h, PSP says ${v.status}. Buyer may have abandoned.`,
        });
      }
    } catch (err) {
      findings.push({
        severity: "warning",
        kind: "stuck_awaiting_payment",
        ref: t.ref,
        message: `Couldn't reach PSP to verify: ${(err as Error).message}`,
      });
    }
  }

  // 2. Payouts stuck in processing >30min.
  const stuckPayouts = await db
    .select({
      id: payouts.id,
      transferRef: payouts.pspTransferRef,
      amount: payouts.amount,
      createdAt: payouts.createdAt,
      txnRef: transactions.ref,
    })
    .from(payouts)
    .innerJoin(transactions, eq(transactions.id, payouts.transactionId))
    .where(
      and(
        eq(payouts.state, "processing"),
        sql`${payouts.createdAt} < now() - interval '30 minutes'`,
      ),
    )
    .limit(50);
  payoutsScanned += stuckPayouts.length;

  for (const p of stuckPayouts) {
    if (!p.transferRef) {
      findings.push({
        severity: "critical",
        kind: "stuck_processing_payout",
        ref: p.txnRef,
        message: `Payout ${p.id} is processing but has no PSP transfer ref recorded.`,
      });
      continue;
    }
    if (pspCallsUsed >= maxPspCalls) {
      findings.push({
        severity: "warning",
        kind: "stuck_processing_payout",
        ref: p.txnRef,
        message: `Payout stuck processing >30min. (PSP call budget exhausted — verify manually.)`,
      });
      continue;
    }
    try {
      const v = await psp.verifyCharge(p.transferRef);
      pspCallsUsed += 1;
      if (v.status === "succeeded") {
        findings.push({
          severity: "critical",
          kind: "psp_variance",
          ref: p.txnRef,
          message: `Transfer ${p.transferRef} is PAID at PSP but our payout is still processing. Missing transfer webhook.`,
        });
      } else if (v.status === "failed") {
        findings.push({
          severity: "warning",
          kind: "stuck_processing_payout",
          ref: p.txnRef,
          message: `Transfer ${p.transferRef} reports failed. Consider rejecting + reissuing.`,
        });
      } else {
        findings.push({
          severity: "info",
          kind: "stuck_processing_payout",
          ref: p.txnRef,
          message: `Payout ${p.id} still pending at PSP (txstatus != 2 — don't assume failure).`,
        });
      }
    } catch (err) {
      findings.push({
        severity: "warning",
        kind: "stuck_processing_payout",
        ref: p.txnRef,
        message: `Couldn't reach PSP for payout ${p.id}: ${(err as Error).message}`,
      });
    }
  }

  // 3. Released transactions without a payout — missing queue.
  const missingPayouts = await db
    .select({
      id: transactions.id,
      ref: transactions.ref,
      releasedAt: transactions.releasedAt,
      amount: transactions.sellerPayoutAmount,
    })
    .from(transactions)
    .leftJoin(payouts, eq(payouts.transactionId, transactions.id))
    .where(
      and(
        eq(transactions.state, "released"),
        isNull(payouts.id),
        gte(transactions.releasedAt, windowStart),
      ),
    )
    .limit(50);
  for (const t of missingPayouts) {
    findings.push({
      severity: "critical",
      kind: "missing_payout",
      ref: t.ref,
      message: `Transaction released but no payout row exists. Seller ${formatGhs(t.amount)} owed.`,
    });
  }

  // 4. Webhook log — unverified signatures arriving in this window.
  const badSignatures = await db
    .select({
      id: webhooksLog.id,
      provider: webhooksLog.provider,
      event: webhooksLog.event,
      createdAt: webhooksLog.createdAt,
    })
    .from(webhooksLog)
    .where(
      and(
        eq(webhooksLog.signatureOk, false),
        gte(webhooksLog.createdAt, windowStart),
      ),
    )
    .orderBy(desc(webhooksLog.createdAt))
    .limit(20);
  webhooksScanned += badSignatures.length;
  for (const w of badSignatures) {
    findings.push({
      severity: "critical",
      kind: "unverified_webhook",
      ref: `webhook:${w.id.slice(0, 8)}`,
      message: `Webhook from ${w.provider} (${w.event}) failed signature verification.`,
    });
  }

  const summary = findings.reduce(
    (acc, f) => {
      acc[f.severity] += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 },
  );

  return {
    ranAt: ranAt.toISOString(),
    durationMs: Math.round(performance.now() - start),
    windowStart: windowStart.toISOString(),
    windowEnd: ranAt.toISOString(),
    counts: { transactionsScanned, payoutsScanned, webhooksScanned },
    findings,
    summary,
  };
}

/**
 * Render the recon report as branded HTML and email it to RECON_REPORT_TO.
 * Safe to call even when Resend isn't configured — the email service logs
 * the payload instead.
 */
export async function emailReconReport(report: ReconReport): Promise<void> {
  const to = env.RECON_REPORT_TO;
  if (!to) {
    console.log("[recon] no RECON_REPORT_TO configured, skipping email");
    return;
  }
  const date = new Date(report.ranAt).toLocaleDateString("en-GH", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const subject = `SBBS daily recon · ${report.summary.critical} critical · ${date}`;
  const html = renderReportHtml(report);
  await sendEmail({
    to,
    subject,
    html,
    tags: [
      { name: "report", value: "daily-recon" },
      { name: "critical", value: String(report.summary.critical) },
    ],
  });
}

function renderReportHtml(report: ReconReport): string {
  const rows = report.findings
    .map(
      (f) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px dashed #DCD6E3">
            <span style="display:inline-block;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.14em;background:${severityColor(f.severity).bg};color:${severityColor(f.severity).fg}">${f.severity}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px dashed #DCD6E3;font-family:ui-monospace,Menlo,monospace;font-size:12px">${escape(f.ref)}</td>
          <td style="padding:8px 12px;border-bottom:1px dashed #DCD6E3;font-size:13px">${escape(f.message)}</td>
        </tr>`,
    )
    .join("");

  const empty = `
    <tr><td colspan="3" style="padding:18px;text-align:center;color:#6E6680;font-size:13px">
      Nothing to investigate. All payments + payouts reconcile cleanly.
    </td></tr>`;

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
  <body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;margin:0;padding:0;background:#FBFAFC;color:#1A1424">
    <div style="max-width:640px;margin:0 auto;padding:32px 20px">
      <div style="display:inline-flex;align-items:center;gap:10px;font-weight:800;font-size:14px;color:#4F2BB8;letter-spacing:.04em">
        <img src="${env.NEXT_PUBLIC_APP_URL}/brand/gsg-logo.png" alt="GSG" width="63" height="32" style="display:block;height:32px;width:auto">
        SELL-SAFE BUY-SAFE &middot; DAILY RECON
      </div>
      <div style="background:#fff;border:1px solid #DCD6E3;border-radius:16px;padding:28px;margin-top:20px;box-shadow:0 1px 0 #00000008,0 12px 40px -24px rgba(79,43,184,0.25)">
        <h1 style="font-size:24px;line-height:1.15;margin:0 0 8px;font-weight:800;letter-spacing:-.01em">Daily reconciliation</h1>
        <p style="color:#6E6680;font-size:13px;margin:0">${new Date(report.windowStart).toLocaleString("en-GH")} → ${new Date(report.windowEnd).toLocaleString("en-GH")} · ran in ${report.durationMs}ms</p>

        <div style="display:flex;gap:10px;margin:20px 0 10px;flex-wrap:wrap">
          ${severityPill("critical", report.summary.critical)}
          ${severityPill("warning", report.summary.warning)}
          ${severityPill("info", report.summary.info)}
        </div>

        <p style="color:#6E6680;font-size:12px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.14em;font-weight:600">Coverage</p>
        <table style="width:100%;font-size:13px;border-collapse:collapse">
          <tr><td style="padding:4px 0;color:#6E6680">Transactions scanned</td><td style="padding:4px 0;text-align:right;font-weight:700">${report.counts.transactionsScanned}</td></tr>
          <tr><td style="padding:4px 0;color:#6E6680">Payouts scanned</td><td style="padding:4px 0;text-align:right;font-weight:700">${report.counts.payoutsScanned}</td></tr>
          <tr><td style="padding:4px 0;color:#6E6680">Webhook records reviewed</td><td style="padding:4px 0;text-align:right;font-weight:700">${report.counts.webhooksScanned}</td></tr>
        </table>

        <p style="color:#6E6680;font-size:12px;margin:22px 0 8px;text-transform:uppercase;letter-spacing:.14em;font-weight:600">Findings</p>
        <table style="width:100%;border-collapse:collapse;border:1px solid #DCD6E3;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#EEEBF1">
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6E6680">Severity</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6E6680">Reference</th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#6E6680">Detail</th>
            </tr>
          </thead>
          <tbody>
            ${report.findings.length > 0 ? rows : empty}
          </tbody>
        </table>

        <a href="${env.NEXT_PUBLIC_APP_URL}/admin/runbook" style="display:inline-block;background:#4F2BB8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;margin-top:24px">Open runbook</a>
      </div>
      <p style="color:#6E6680;font-size:11px;text-align:center;margin:20px 0">SBBS automated reconciliation · Do not reply.</p>
    </div></body></html>`;
}

function severityColor(s: "critical" | "warning" | "info") {
  return s === "critical"
    ? { bg: "#fbe5e3", fg: "#b3241f" }
    : s === "warning"
      ? { bg: "#fbf2dd", fg: "#7a5410" }
      : { bg: "#e8f1f8", fg: "#1f4a72" };
}

function severityPill(severity: "critical" | "warning" | "info", n: number): string {
  const c = severityColor(severity);
  return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700;background:${c.bg};color:${c.fg}">
    <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${c.fg}"></span>
    ${n} ${severity}
  </span>`;
}

function escape(s: string): string {
  return s.replace(/[<>&"]/g, (c) =>
    c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === "&" ? "&amp;" : "&quot;",
  );
}
