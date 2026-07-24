import { redirect } from "next/navigation";

/**
 * Short alias for /hub/transactions/{ref}.
 * Keeps SMS bodies inside GSM limits while still opening the right Hub deal.
 */
export const dynamic = "force-dynamic";

export default async function HubShortLinkPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  redirect(`/hub/transactions/${encodeURIComponent(ref)}`);
}
