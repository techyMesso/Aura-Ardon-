import Link from "next/link";
import { MapPin, PackageCheck, ReceiptText } from "lucide-react";

export const metadata = {
  title: "Shipping & Delivery",
  description: "How Auro Ardon confirms delivery locations, fees, and order totals."
};

export default function ShippingPage() {
  return (
    <section className="jewel-page">
      <header className="jewel-header">
        <p className="text-sm font-medium text-bronze">Delivery information</p>
        <h1 className="heading-display mt-2">Clear details before dispatch</h1>
        <p className="mt-4 text-muted">Delivery is coordinated from Nairobi using the location you provide at checkout.</p>
      </header>

      <div className="mt-8 grid gap-4 md:mt-12 md:grid-cols-3 md:gap-5">
        <article className="border border-border/70 bg-card p-6 shadow-card">
          <MapPin className="h-5 w-5 text-bronze" aria-hidden />
          <h2 className="mt-5 font-serif text-2xl text-ink">Share your location</h2>
          <p className="mt-2 text-sm leading-7 text-muted">Enter an estate, building, campus gate, pickup point, or another clear delivery reference.</p>
        </article>
        <article className="border border-border/70 bg-card p-6 shadow-card">
          <ReceiptText className="h-5 w-5 text-bronze" aria-hidden />
          <h2 className="mt-5 font-serif text-2xl text-ink">Fee shown with the order</h2>
          <p className="mt-2 text-sm leading-7 text-muted">The checkout response supplies the saved subtotal, shipping fee, and final total. The storefront does not invent a delivery charge.</p>
        </article>
        <article className="border border-border/70 bg-card p-6 shadow-card">
          <PackageCheck className="h-5 w-5 text-bronze" aria-hidden />
          <h2 className="mt-5 font-serif text-2xl text-ink">Confirm the handoff</h2>
          <p className="mt-2 text-sm leading-7 text-muted">Use checkout notes for delivery directions. The store can confirm any additional details directly.</p>
        </article>
      </div>

      <div className="mt-12 text-center">
        <p className="text-muted">Need to confirm whether your location is currently served?</p>
        <Link href="/contact" className="btn-primary mt-5 min-h-12">Contact the store</Link>
      </div>
    </section>
  );
}
