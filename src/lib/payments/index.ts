import { isMoolreLive, isPaystackLive } from "../env";
import { paystack } from "./paystack";
import { moolrePsp } from "./moolre";
import { hubtelPsp } from "./hubtel";
import type { PspAdapter, PspProvider } from "./types";
import { stubPsp } from "./stub";

const ADAPTERS: Record<PspProvider, PspAdapter> = {
  moolre: moolrePsp,
  paystack,
  hubtel: hubtelPsp,
  flutterwave: stubPsp,
  stub: stubPsp,
};

/**
 * Resolve the active PSP adapter.
 *
 * Priority order:
 *   1. Caller-specified provider (routing by transaction).
 *   2. Moolre if fully configured — our primary gateway in production.
 *   3. Paystack if configured — failover.
 *   4. Stub (dev / preview) so every flow works end-to-end without keys.
 */
export function getPsp(provider?: PspProvider): PspAdapter {
  if (provider) return ADAPTERS[provider] ?? stubPsp;
  if (isMoolreLive) return moolrePsp;
  if (isPaystackLive) return paystack;
  return stubPsp;
}

export { moolrePsp, paystack, hubtelPsp };
/** Charge PSP helpers live in `./charge-adapter` — do not barrel-export here (client components import `calculateFees` from this file). */
export type * from "./types";

import type { FeeRates, PayoutChannel } from "./defaults";
export { DEFAULT_FEE_RATES, channelLabel } from "./defaults";
export type { FeeRates, PayoutChannel } from "./defaults";

/**
 * Calculate every line item for a transaction. Encodes the platform's payout
 * release fee policy:
 *
 *   MoMo releases (Moolre):
 *     - Rider release fee = 1% of rider payout, capped at GHS 10  (buyer pays)
 *     - Seller release fee = 1% of seller payout, capped at GHS 10 (seller pays)
 *
 *   Bank releases (Paystack):
 *     - Rider release fee = GHS 8 flat (buyer pays)
 *     - Seller release fee = GHS 8 flat (seller pays)
 *
 * The rider release fee is added to `totalCharged` because the buyer pays it.
 * The seller release fee is DEDUCTED from `sellerPayout` because the seller
 * pays it out of their proceeds — it never hits the buyer's bill.
 */
export function calculateFees(
  args: {
    productAmount: number;
    deliveryAmount: number;
    riderPayoutChannel?: PayoutChannel;
    sellerPayoutChannel?: PayoutChannel;
  } & FeeRates,
) {
  const riderChannel: PayoutChannel = args.riderPayoutChannel ?? "momo";
  const sellerChannel: PayoutChannel = args.sellerPayoutChannel ?? "momo";

  const buyerFee = Math.round((args.productAmount * args.buyerFeeBps) / 10000);
  const sellerFee = Math.round((args.productAmount * args.sellerFeeBps) / 10000);

  const riderPayout = args.deliveryAmount;
  const sellerPayoutBeforeRelease = args.productAmount - sellerFee;

  let riderReleaseFee = 0;
  if (riderPayout > 0) {
    riderReleaseFee =
      riderChannel === "momo"
        ? Math.min(
            Math.round((riderPayout * args.riderReleaseMomoBps) / 10000),
            args.riderReleaseMomoCap,
          )
        : args.riderReleaseBank;
  }

  const sellerReleaseFee =
    sellerChannel === "momo"
      ? Math.min(
          Math.round(
            (sellerPayoutBeforeRelease * args.sellerReleaseMomoBps) / 10000,
          ),
          args.sellerReleaseMomoCap,
        )
      : args.sellerReleaseBank;

  // Buyer pays product + delivery + their own platform fee + the rider release
  // fee. The seller release fee is NOT in this total — it's netted out of the
  // seller's payout below.
  const totalCharged =
    args.productAmount + args.deliveryAmount + buyerFee + riderReleaseFee;
  const sellerPayout = sellerPayoutBeforeRelease - sellerReleaseFee;

  return {
    buyerFee,
    sellerFee,
    riderReleaseFee,
    sellerReleaseFee,
    totalCharged,
    sellerPayout,
    riderPayout,
    riderPayoutChannel: riderChannel,
    sellerPayoutChannel: sellerChannel,
  };
}
