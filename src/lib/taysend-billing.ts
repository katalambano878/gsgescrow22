const API_URL = (process.env.TAYSEND_API_URL || 'https://api.taysend.com').replace(/\/+$/, '');
const TIMEOUT_MS = 15_000;

export function taysendConfigured(): boolean {
  return Boolean(process.env.TAYSEND_API_KEY?.trim());
}

/** Live SMS balance from Taysend (server only). */
export async function getSmsBilling(): Promise<{ sms_left: number }> {
  const res = await fetch(`${API_URL}/v1/billing`, {
    headers: {
      Authorization: `Bearer ${process.env.TAYSEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('billing_failed');
  const body = await res.json();
  return { sms_left: Number(body.sms_left) || 0 };
}