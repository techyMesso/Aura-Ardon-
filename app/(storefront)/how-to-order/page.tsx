import Link from "next/link";

export const metadata = {
  title: "How to order",
  description:
    "How to order from Auro Ardon online or on WhatsApp without creating an account."
};

export default function HowToOrderPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        How to order
      </h1>

      <div className="mt-8 space-y-6 font-sans text-[16px] leading-[1.5] text-text">
        <p>
          You do not need an account to buy from Auro Ardon. Add any in-stock piece to your bag and open the checkout screen.
        </p>
        <p>
          Enter your name, your Kenyan mobile number, and your Nairobi delivery area or landmark. If the order is a gift, check the gift option at checkout to include a note and hide prices on the packing slip.
        </p>
        <p>
          Submit your order directly on the site or tap Order on WhatsApp to send the prefilled order sheet to our studio desk.
        </p>
      </div>

      <div className="mt-8">
        <Link href="/shop" className="btn-primary">
          Shop new in
        </Link>
      </div>
    </section>
  );
}
