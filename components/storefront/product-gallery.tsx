"use client";

import { useState } from "react";

import { ProductTile } from "@/components/storefront/product-tile";
import type { Product } from "@/lib/types";

interface ProductGalleryProps {
  products: Product[];
  mode?: "default" | "compact";
  priorityCount?: number;
  columns?: 3 | 4;
}

export function ProductGallery({
  products,
  priorityCount = 0,
  columns = 4
}: ProductGalleryProps) {
  const [status, setStatus] = useState("");

  const gridClass =
    columns === 3
      ? "grid grid-cols-2 gap-4 md:grid-cols-3"
      : "grid grid-cols-2 gap-4 lg:grid-cols-4";

  return (
    <>
      <div className={gridClass}>
        {products.map((product, index) => (
          <ProductTile
            key={product.id}
            product={product}
            priority={index < priorityCount}
            sizes={
              columns === 3
                ? "(max-width: 767px) 50vw, 33vw"
                : "(max-width: 1023px) 50vw, 25vw"
            }
            onStatusChange={setStatus}
          />
        ))}
      </div>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {status}
      </p>
    </>
  );
}
