import { NextResponse } from "next/server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import React from "react";
import { getDb } from "@/lib/db/client";
import { transactions } from "@/lib/db/schema";
import { isDbLive } from "@/lib/env";
import { formatGhs } from "@/lib/utils";
import { channelLabel, type PayoutChannel } from "@/lib/payments/defaults";
import { getSessionUser, getCurrentProfile, isAdminRole } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const styles = StyleSheet.create({
  page: { padding: 48, fontSize: 11, fontFamily: "Helvetica", color: "#1A1424" },
  brand: { fontSize: 18, fontFamily: "Helvetica-Bold", color: "#4F2BB8", marginBottom: 4 },
  sub: { fontSize: 10, color: "#6E6680" },
  ref: { fontSize: 22, fontFamily: "Courier-Bold", marginTop: 24 },
  hr: { borderBottom: "1pt solid #C7BFD1", marginVertical: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", marginVertical: 3 },
  label: { color: "#6E6680", fontSize: 10 },
  value: { fontSize: 11 },
  total: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", color: "#4F2BB8", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1.4 },
  badge: { backgroundColor: "#E9E4F0", color: "#3A1F75", padding: 6, fontSize: 9, alignSelf: "flex-start" },
  footer: { marginTop: 36, paddingTop: 16, borderTop: "1pt solid #DCD6E3", fontSize: 9, color: "#6E6680" },
});

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ref: string }> },
) {
  const { ref } = await ctx.params;
  if (!isDbLive) return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  const [txn] = await getDb().select().from(transactions).where(eq(transactions.ref, ref)).limit(1);
  if (!txn) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Receipts contain full phones/addresses — parties + admins only.
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }
  const profile = await getCurrentProfile().catch(() => null);
  const isParty = user.id === txn.buyerId || user.id === txn.sellerId;
  const isAdmin = profile ? isAdminRole(profile.role) : false;
  if (!isParty && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const md = (txn.metadata ?? {}) as {
    riderPayoutChannel?: PayoutChannel;
    sellerPayoutChannel?: PayoutChannel;
  };
  const riderChannel: PayoutChannel = md.riderPayoutChannel ?? "momo";
  const sellerChannel: PayoutChannel = md.sellerPayoutChannel ?? "momo";

  const buffer = await renderToBuffer(
    React.createElement(
      Document,
      null,
      React.createElement(
        Page,
        { size: "A4", style: styles.page },
        React.createElement(Text, { style: styles.brand }, "Sell-Safe Buy-Safe"),
        React.createElement(Text, { style: styles.sub }, "Protected payment receipt · sbbs.gh"),
        React.createElement(Text, { style: styles.ref }, ref),
        React.createElement(Text, { style: { ...styles.sub, marginTop: 4 } }, `Issued ${new Date().toLocaleString("en-GH")}`),
        React.createElement(View, { style: styles.hr }),
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, "Order"),
          React.createElement(Row, { label: "Item", value: txn.itemDescription }),
          React.createElement(Row, { label: "Buyer", value: `${txn.buyerName} · ${txn.buyerPhone}` }),
          React.createElement(Row, { label: "Seller", value: `${txn.sellerName} · ${txn.sellerPhone}` }),
          React.createElement(Row, { label: "Delivery to", value: `${txn.deliveryAddress}, ${txn.deliveryCity}` }),
          React.createElement(Row, { label: "Status", value: txn.state }),
        ),
        React.createElement(View, { style: styles.section },
          React.createElement(Text, { style: styles.sectionTitle }, "Money"),
          React.createElement(Row, { label: "Product", value: formatGhs(txn.productAmount) }),
          React.createElement(Row, { label: "Delivery", value: formatGhs(txn.deliveryAmount) }),
          React.createElement(Row, { label: "Buyer fee", value: formatGhs(txn.buyerFee) }),
          React.createElement(Row, {
            label: `Rider release · ${channelLabel(riderChannel)}`,
            value: formatGhs(txn.riderReleaseFee),
          }),
          React.createElement(Row, {
            label: `Seller release · ${channelLabel(sellerChannel)}`,
            value: formatGhs(txn.sellerReleaseFee),
          }),
          React.createElement(View, { style: styles.hr }),
          React.createElement(View, { style: styles.row },
            React.createElement(Text, { style: styles.total }, "Total charged"),
            React.createElement(Text, { style: styles.total }, formatGhs(txn.totalCharged)),
          ),
          React.createElement(View, { style: { ...styles.row, marginTop: 6 } },
            React.createElement(Text, { style: styles.label }, "Net to seller"),
            React.createElement(Text, { style: styles.value }, formatGhs(txn.sellerPayoutAmount)),
          ),
        ),
        React.createElement(Text, { style: styles.footer },
          "Funds were held by Moolre on behalf of GSG Brands and released only on confirmation of delivery (or 72-hour auto-release). This receipt is the official record of the protected transaction. Disputes follow the policy at sbbs.gh/disputes-policy.",
        ),
      ),
    ),
  );

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${ref}.pdf"`,
    },
  });
}

function Row({ label, value }: { label: string; value: string }) {
  return React.createElement(
    View,
    { style: styles.row },
    React.createElement(Text, { style: styles.label }, label),
    React.createElement(Text, { style: styles.value }, value),
  );
}
