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
    <section className="mx-auto max-w-5xl px-5 py-12 md:px-6 lg:px-10 lg:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <p className="section-label">Ordering guide</p>
        <h1 className="heading-display mt-3">From piece to checkout</h1>
        <p className="mt-4 text-muted">A direct mobile-friendly path, with no account required.</p>
      </header>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        {steps.map(step => (
          <article key={step.number} className="rounded-[1.75rem] border border-border/60 bg-white/75 p-6 shadow-card">
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
