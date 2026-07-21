import { NextResponse } from "next/server";

/**
 * Legacy Supabase Auth SMS hook — retired.
 * OTP SMS is now sent directly from `requestPhoneOtp` via Moolre/Hubtel.
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "gone",
      message:
        "Supabase Auth SMS hook is retired. SBBS uses first-party OTP via /lib/actions/auth.",
    },
    { status: 410 },
  );
}
