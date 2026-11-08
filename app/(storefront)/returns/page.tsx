import Link from "next/link";

export const metadata = {
  title: "Returns",
  description:
    "How to request an exchange or report a damaged item within 48 hours of delivery."
};

export default function ReturnsPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Returns and exchanges
      </h1>

      <div className="mt-8 space-y-6 font-sans text-[16px] leading-[1.5] text-text">
        <p>
          Inspect your piece on arrival. If an item arrives damaged or does not match what you ordered, message us within 48 hours with your order number and a clear photo.
        </p>
        <p>
          Unworn necklaces, bracelets, rings, watches, and sets in their original pouch can be exchanged within Nairobi. For hygiene reasons, earrings cannot be returned once opened unless faulty.
        </p>
      </div>

      <div className="mt-8">
        <Link href="/contact" className="btn-primary">
          Contact us
        </Link>
      </div>
    </section>
  );
}
