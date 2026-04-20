"use client";

import Image from "next/future/image";
import Link from "next/link";
import { ArrowUpRight, ShoppingCart, Check } from "lucide-react";
import { useState } from "react";

import { CheckoutModal } from "@/components/storefront/checkout-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/types";

interface ProductGalleryProps {
  products: Product[];
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function ProductGallery({ products }: ProductGalleryProps) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const { addItem } = useCart();
  const [addedProductId, setAddedProductId] = useState<string | null>(null);

  const handleAddToCart = (product: Product, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    setAddedProductId(product.id);
    setTimeout(() => setAddedProductId(null), 2000);
  };

  return (
    <>
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const categorySlug = slugify(product.category || "jewelry");
          const isAdded = addedProductId === product.id;
          return (
            <article
              key={product.id}
              className="group overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 shadow-luxe backdrop-blur"
            >
              <Link href={`/shop/${categorySlug}/${product.slug || product.id}`}>
                <div className="relative aspect-[4/5] overflow-hidden">
<Image
  src={product.images[0] ?? "https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=1200&q=80"}
  alt={product.title}
  fill
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
  className="object-cover transition duration-700 group-hover:scale-105"
  loading="lazy"
/>
                </div>
              </Link>
              <div className="space-y-4 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link href={`/shop/${categorySlug}/${product.slug || product.id}`}>
                      <h3 className="font-serif text-3xl text-ink hover:text-bronze transition-colors">
                        {product.title}
                      </h3>
                    </Link>
                    <p className="mt-1 text-sm text-muted">{product.material}</p>
                  </div>
                  <ArrowUpRight className="h-5 w-5 text-bronze" />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{product.category}</Badge>
                  <Badge>{product.stock_quantity} in atelier</Badge>
                </div>
                <p className="text-sm leading-6 text-muted">{product.description}</p>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-lg font-semibold text-ink">
                    {formatCurrency(product.price)}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleAddToCart(product, e)}
                      disabled={product.stock_quantity < 1 || isAdded}
                      className={`flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] transition ${
                        isAdded
                          ? "bg-green-600 text-white"
                          : "border border-border/40 bg-white/60 text-ink hover:bg-sand/50"
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <Check className="mr-1 h-4 w-4" />
                          Added
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="mr-1 h-4 w-4" />
                          Cart
                        </>
                      )}
                    </button>
                    <Button
                      onClick={() => setSelectedProduct(product)}
                      disabled={product.stock_quantity < 1}
                    >
                      {product.stock_quantity < 1 ? "Sold out" : "Buy"}
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      <CheckoutModal
        open={Boolean(selectedProduct)}
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
      />
    </>
  );
}