import Link from "next/link";

import { getStoreSettings, listDeliveryZones } from "@/lib/data";
import { formatCutoffEatLabel, partitionDeliveryZones } from "@/lib/policies";
import { buildPageMetadata } from "@/lib/seo";
import { formatCurrency } from "@/lib/utils";

export const revalidate = 300;

export const metadata = buildPageMetadata({
  title: "Delivery & Zone Fees",
  description:
    "Transparent Nairobi rider delivery fees by zone, same-day EAT dispatch cutoff, free delivery threshold, and 1–2 business day courier shipping across Kenya.",
  pathname: "/shipping"
});

export default async function ShippingPage() {
  const [settings, zones] = await Promise.all([
    getStoreSettings(),
    listDeliveryZones()
  ]);

  const cutoffLabel = formatCutoffEatLabel(settings.same_day_cutoff);
  const { nairobiZones, outsideNairobiZones } = partitionDeliveryZones(zones);
  const freeThreshold = settings.free_delivery_threshold;

  return (
    <section className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.16em] text-price">
        Nairobi &amp; Nationwide Kenya
      </p>
      <h1 className="mt-2 font-serif text-[40px] font-normal leading-[1.12] tracking-[-0.01em] text-text md:text-[64px]">
        Delivery &amp; zone fees
      </h1>
      <p className="mt-4 max-w-2xl font-sans text-[16px] leading-[1.55] text-muted">
        Every delivery fee is fixed by zone as shown in the table below — no guesswork and no surprise charges. Pay cash or M-Pesa when your parcel arrives.
      </p>

      {/* Key delivery highlights */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border border-text/12 bg-paper p-5">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-price">
            Same-day Nairobi cutoff
          </p>
          <p className="mt-2 font-serif text-[26px] leading-[1.15] tracking-[-0.01em] text-text">
            {cutoffLabel}
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-muted">
            Orders confirmed before {cutoffLabel} ({settings.business_hours}) dispatch the same day by rider. Later orders dispatch next business day.
          </p>
        </div>

        <div className="border border-text/12 bg-paper p-5">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-price">
            Outside Nairobi courier
          </p>
          <p className="mt-2 font-serif text-[26px] leading-[1.15] tracking-[-0.01em] text-text">
            1–2 business days
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-muted">
            Upcountry towns across Kenya ship via trusted parcel courier with WhatsApp dispatch updates.
          </p>
        </div>

        <div className="border border-text/12 bg-stone p-5">
          <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.14em] text-[#7A5D1D] dark:text-price">
            Free delivery
          </p>
          <p className="mt-2 font-serif text-[26px] leading-[1.15] tracking-[-0.01em] text-text">
            {freeThreshold > 0
              ? `Orders ${formatCurrency(freeThreshold)}+`
              : "Fixed zone rates"}
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-muted">
            {freeThreshold > 0
              ? `Spend ${formatCurrency(freeThreshold)} or more on items and your delivery fee automatically drops to KES 0 at checkout.`
              : "Standard fixed zone delivery rates apply across all zones listed below."}
          </p>
        </div>
      </div>

      {/* Dynamic Zone/Fee Table from delivery_zones */}
      <div className="mt-10 space-y-8">
        <div>
          <h2 className="font-serif text-[28px] font-normal leading-[1.12] tracking-[-0.01em] text-text">
            Nairobi rider zones
          </h2>
          <p className="mt-1.5 font-sans text-[14px] text-muted">
            Hand-delivered by our Nairobi riders. You can inspect your order on arrival and pay cash or M-Pesa on delivery.
          </p>

          <div className="mt-4 overflow-x-auto border border-text/12 bg-paper">
            <table className="w-full border-collapse text-left font-sans text-[14px]">
              <thead>
                <tr className="border-b border-text/12 bg-stone/70 text-[12px] uppercase tracking-[0.12em] text-muted">
                  <th scope="col" className="px-4 py-3 font-medium">
                    Delivery zone
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Estimated timing
                  </th>
                  <th scope="col" className="px-4 py-3 text-right font-medium">
                    Fee (KES)
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-text/10">
                {nairobiZones.map(zone => (
                  <tr key={zone.id}>
                    <td className="px-4 py-3 font-medium text-text">
                      {zone.name}
                    </td>
                    <td className="px-4 py-3 text-muted">
                      Same-day rider (orders confirmed before {cutoffLabel})
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-text">
                      {formatCurrency(zone.fee)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {outsideNairobiZones.length > 0 ? (
          <div>
            <h2 className="font-serif text-[28px] font-normal leading-[1.12] tracking-[-0.01em] text-text">
              Outside Nairobi (nationwide courier)
            </h2>
            <p className="mt-1.5 font-sans text-[14px] text-muted">
              We dispatch parcels to major towns across Kenya via courier partners. Specify your town/county and preferred pickup office or drop-off address at checkout.
            </p>

            <div className="mt-4 overflow-x-auto border border-text/12 bg-paper">
              <table className="w-full border-collapse text-left font-sans text-[14px]">
                <thead>
                  <tr className="border-b border-text/12 bg-stone/70 text-[12px] uppercase tracking-[0.12em] text-muted">
                    <th scope="col" className="px-4 py-3 font-medium">
                      Delivery option
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Estimated timing
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-medium">
                      Fee (KES)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-text/10">
                  {outsideNairobiZones.map(zone => (
                    <tr key={zone.id}>
                      <td className="px-4 py-3 font-medium text-text">
                        {zone.name}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        1–2 business days via courier
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-text">
                        {formatCurrency(zone.fee)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-10 space-y-4 border-t border-text/12 pt-8 font-sans text-[15px] leading-[1.6] text-text">
        <h2 className="font-serif text-[26px] font-normal leading-[1.15] tracking-[-0.01em] text-text">
          How handover works
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-muted">
          <li>
            Once you confirm your order on WhatsApp, we pack and inspect your pieces at our Nairobi studio ({settings.business_hours}).
          </li>
          <li>
            When your rider sets off, we send you their name and phone number on WhatsApp along with your live tracking link.
          </li>
          <li>
            Inspect your pieces at handover and settle your total in cash or via M-Pesa on delivery.
          </li>
        </ul>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/shop" className="btn-primary">
          Shop collection
        </Link>
        <Link href="/track" className="btn-outline">
          Track an order
        </Link>
        <Link href="/returns" className="btn-outline">
          Returns &amp; exchanges
        </Link>
      </div>
    </section>
  );
}
