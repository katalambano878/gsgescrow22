/**
 * Default fee rates shared between the client (wizards, calculator widget)
 * and the server (createTransaction, settings defaults). The DB-backed
 * settings can override these per environment but the wizards display these
 * values until rebuild — same drift as the platform fee bps.
 *
 * Channel meaning:
 *   - "momo" — release sent via Mobile Money (Moolre transfer to MTN/Telecel/
 *      AirtelTigo wallets). Fee is 1% of the released amount, capped at GHS 10.
 *   - "bank" — release sent via Paystack bank transfer to a current/savings
 *      account. Fee is a flat GHS 8 because bank transfers cost a fixed
 *      provider fee.
 */
export type PayoutChannel = "momo" | "bank";

export const DEFAULT_FEE_RATES = {
  buyerFeeBps: 150,
  sellerFeeBps: 150,
  riderReleaseMomoBps: 100,
  riderReleaseMomoCap: 1000,
  riderReleaseBank: 800,
  sellerReleaseMomoBps: 100,
  sellerReleaseMomoCap: 1000,
  sellerReleaseBank: 800,
} as const;

export interface FeeRates {
  buyerFeeBps: number;
  sellerFeeBps: number;
  riderReleaseMomoBps: number;
  riderReleaseMomoCap: number;
  riderReleaseBank: number;
  sellerReleaseMomoBps: number;
  sellerReleaseMomoCap: number;
  sellerReleaseBank: number;
}

/** Human-friendly channel label for receipts and admin views. */
export function channelLabel(c: PayoutChannel): string {
  return c === "bank" ? "Bank (Paystack)" : "MoMo (Moolre)";
}
