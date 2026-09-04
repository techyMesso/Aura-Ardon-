import Link from "next/link";
import { Camera, MessageCircle, PackageOpen } from "lucide-react";

export const metadata = {
  title: "Returns & Exchanges",
  description: "How to contact Auro Ardon about an order issue, return, or exchange request."
};

export default function ReturnsPage() {
  return (
    <section className="mx-auto max-w-5xl px-5 py-12 md:px-6 lg:px-10 lg:py-16">
      <header className="mx-auto max-w-2xl text-center">
        <p className="section-label">Order support</p>
        <h1 className="heading-display mt-3">Returns and exchanges</h1>
        <p className="mt-4 text-muted">Contact the store promptly so the condition of the item and the available resolution can be confirmed.</p>
      </header>

      <div className="mt-12 grid gap-5 md:grid-cols-3">
        <article className="rounded-[1.75rem] border border-border/60 bg-white/75 p-6 shadow-card">
          <MessageCircle className="h-5 w-5 text-bronze" aria-hidden />
          <h2 className="mt-5 font-serif text-2xl text-ink">Start with your order</h2>
          <p className="mt-2 text-sm leading-7 text-muted">Share your order reference, the item name, and the reason you need help.</p>
        </article>
        <article className="rounded-[1.75rem] border border-border/60 bg-white/75 p-6 shadow-card">
          <Camera className="h-5 w-5 text-bronze" aria-hidden />
          <h2 className="mt-5 font-serif text-2xl text-ink">Document any issue</h2>
          <p className="mt-2 text-sm leading-7 text-muted">For an incorrect or damaged item, keep the packaging and provide clear photos when you contact the store.</p>
        </article>
        <article className="rounded-[1.75rem] border border-border/60 bg-white/75 p-6 shadow-card">
          <PackageOpen className="h-5 w-5 text-bronze" aria-hidden />
          <h2 className="mt-5 font-serif text-2xl text-ink">Wait for instructions</h2>
          <p className="mt-2 text-sm leading-7 text-muted">Do not send an item before the store confirms eligibility and the correct return or exchange handoff.</p>
        </article>
      </div>

      <div className="mt-12 text-center">
        <p className="text-muted">Ready to discuss an order issue?</p>
        <Link href="/contact" className="btn-primary mt-5 min-h-12">Contact the store</Link>
      </div>
    </section>
  );
}
