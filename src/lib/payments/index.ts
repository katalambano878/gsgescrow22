import "server-only";

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
/** Charge PSP helpers live in `./charge-adapter` — do not barrel-export from here. */
export type * from "./types";

/** Fee math is re-exported for server callers; clients must import `@/lib/payments/fees`. */
export {
  calculateFees,
  DEFAULT_FEE_RATES,
  channelLabel,
} from "./fees";
export type { FeeRates, PayoutChannel } from "./fees";
