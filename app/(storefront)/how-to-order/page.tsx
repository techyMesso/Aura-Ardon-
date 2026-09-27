import Link from "next/link";
import { ArrowRight, Check, MessageCircle, ShoppingBag } from "lucide-react";

export const metadata = {
  title: "How to Order",
  description: "Place an Auro Ardon order online with cash on delivery or WhatsApp confirmation."
};

export default function HowToOrderPage() {
  const steps = [
    { number: "01", title: "Pick a piece", copy: "Browse the live catalog, open a product, and choose your quantity.", Icon: ShoppingBag },
    { number: "02", title: "Checkout in 30 seconds", copy: "Add your name, mobile number, delivery location, and any optional notes.", Icon: Check },
    { number: "03", title: "Pay on delivery or confirm on WhatsApp", copy: "Select the available ordering option and submit your order without creating an account.", Icon: MessageCircle }
  ];

  return (
    <section className="jewel-page">
      <header className="jewel-header">
        <p className="text-sm font-medium text-bronze">Ordering guide</p>
        <h1 className="heading-display mt-2">From piece to checkout</h1>
        <p className="mt-4 text-muted">A direct mobile-friendly path, with no account required.</p>
      </header>

      <div className="mt-8 grid gap-4 md:mt-12 md:grid-cols-3 md:gap-5">
        {steps.map(step => (
          <article key={step.number} className="border border-border/70 bg-card p-6 shadow-card">
            <div className="flex items-center justify-between">
              <step.Icon className="h-5 w-5 text-bronze" aria-hidden />
              <span className="font-serif text-2xl text-champagne">{step.number}</span>
            </div>
            <h2 className="mt-7 font-serif text-2xl text-ink">{step.title}</h2>
            <p className="mt-3 text-sm leading-7 text-muted">{step.copy}</p>
          </article>
        ))}
      </div>

      <div className="mt-12 flex flex-wrap justify-center gap-3">
        <Link href="/shop" className="btn-primary min-h-12">Start shopping <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        <Link href="/contact" className="btn-outline min-h-12">Ask a question</Link>
      </div>
    </section>
  );
}
