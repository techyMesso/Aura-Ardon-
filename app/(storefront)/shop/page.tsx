import { Gem } from "lucide-react";
import Link from "next/link";

import { listPublicProducts } from "@/lib/data";
import { ShopPageClient } from "@/components/storefront/shop-page-client";

export const metadata = {
  title: "Shop All Products | Auro Ardon",
  description: "Browse our complete collection of handcrafted jewelry, lip care, and hair accessories from Nairobi.",
};

export default async function ShopPage() {
  const products = await listPublicProducts();

  if (!products.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-4xl border border-dashed border-bronze/30 bg-white/50 px-6 py-24 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-champagne/30 to-bronze/20">
          <Gem className="h-7 w-7 text-bronze" />
        </div>
        <div>
          <p className="font-serif text-2xl text-ink">No products available yet</p>
          <p className="mt-2 text-sm text-muted">
            Check back soon for our handcrafted jewelry, lip care, and hair accessories.
          </p>
        </div>
        <Link href="/" className="btn-outline mt-4">
          Back to Home
        </Link>
      </div>
    );
  }

  return <ShopPageClient products={products} />;
}
