/**
 * Client-safe fee math. Do not import PSP adapters or `env` here — wizards
 * and the marketing calculator import this module in the browser bundle.
 */
import type { FeeRates, PayoutChannel } from "./defaults";

export type { FeeRates, PayoutChannel } from "./defaults";
export { DEFAULT_FEE_RATES, channelLabel } from "./defaults";

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
            (Math.max(0, sellerPayoutBeforeRelease) * args.sellerReleaseMomoBps) /
              10000,
          ),
          args.sellerReleaseMomoCap,
        )
      : args.sellerReleaseBank;

  const totalCharged =
    args.productAmount + args.deliveryAmount + buyerFee + riderReleaseFee;
  // Never allow a negative seller payout — small bank-channel orders can
  // otherwise go underwater when the flat release fee exceeds net proceeds.
  const sellerPayout = Math.max(0, sellerPayoutBeforeRelease - sellerReleaseFee);

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
    /** True when fees would leave the seller with a negative net before clamp. */
    sellerPayoutClamped: sellerPayoutBeforeRelease - sellerReleaseFee < 0,
  };
}
