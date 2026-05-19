import { Container, Section, Eyebrow } from "@/components/ui/container";
import { BuyerWizard } from "@/components/buyer/buyer-wizard";
import { MarketingNav } from "@/components/marketing/nav";

export const metadata = { title: "Start a protected purchase" };

export default async function BuyPage({
  searchParams,
}: {
  searchParams: Promise<{
    seller?: string;
    sellerName?: string;
    sellerPhone?: string;
    sellerEmail?: string;
    item?: string;
    itemLink?: string;
    price?: string;
    delivery?: string;
    listingId?: string;
  }>;
}) {
  const sp = await searchParams;
  return (
    <>
      <MarketingNav />
      <Section className="bg-paper min-h-[80vh]">
        <Container size="lg">
          <Eyebrow>Buyer wizard</Eyebrow>
          <h1 className="font-display text-4xl sm:text-5xl font-bold mt-4 tracking-tight">
            Three steps. One safe deal.
          </h1>
          <p className="mt-4 text-lg text-[var(--muted)] max-w-2xl">
            Buying a product or booking a service? Tell us the details, who you&rsquo;re paying, and
            where to deliver or where the work happens. We&rsquo;ll generate a protected payment
            link.
          </p>
          <div className="mt-10">
            <BuyerWizard
              prefill={{
                sellerHandle: sp.seller,
                sellerName: sp.sellerName,
                sellerPhone: sp.sellerPhone,
                sellerEmail: sp.sellerEmail,
                itemDescription: sp.item,
                itemLink: sp.itemLink,
                productCedis: sp.price,
                deliveryCedis: sp.delivery,
              }}
            />
          </div>
        </Container>
      </Section>
    </>
  );
}
