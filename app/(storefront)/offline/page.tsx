import Link from "next/link";

export const metadata = {
  title: "Offline"
};

export default function OfflinePage() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <h1 className="font-serif text-[40px] font-normal leading-[1.0] tracking-[-0.01em] text-text md:text-[64px]">
        You are offline.
      </h1>
      <p className="mt-4 font-sans text-[16px] leading-[1.5] text-muted">
        Reconnect to browse the current catalog or message us on WhatsApp to place an order.
      </p>
      <div className="mt-6">
        <Link href="/shop" className="btn-primary">
          Try again
        </Link>
      </div>
    </section>
  );
}
