import Link from "next/link";

export const metadata = {
  title: "Delivery",
  description:
    "Same-day Nairobi rider delivery and 1–2 day nationwide parcel dispatch across Kenya."
};

export default function ShippingPage() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        Delivery
      </h1>

      <div className="mt-8 space-y-6 font-sans text-[16px] leading-[1.5] text-text">
        <p>
          Orders placed before 2pm EAT are dispatched the same day by rider across Nairobi, including Westlands, Kilimani, Lavington, Kileleshwa, Karen, CBD, Parklands, Upper Hill, South B, South C, Lang&apos;ata, and Thika Road.
        </p>
        <p>
          Orders outside Nairobi ship via courier and arrive within 1 to 2 business days depending on your town.
        </p>
        <p>
          Your exact delivery fee is confirmed with your order total at checkout before our rider is dispatched.
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
