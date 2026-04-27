import { notFound } from "next/navigation";
import { Gem } from "lucide-react";
import Link from "next/link";

import { listCategories, listProductsByCategory } from "@/lib/data";
import { ProductGallery } from "@/components/storefront/product-gallery";

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  const categories = await listCategories();
  return categories.map((cat) => ({ category: cat.slug }));
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { category: slug } = await params;
  const categories = await listCategories();
  const category = categories.find((c) => c.slug === slug);

  if (!category) {
    return { title: "Category Not Found" };
  }

  return {
    title: `${category.name} | Auro Ardon Shop`,
    description: category.description || `Shop our ${category.name} collection - handcrafted ${category.name.toLowerCase()} from Nairobi.`,
  };
}

// Well-known category slugs used throughout the site. If DB is empty we still render the page.
const KNOWN_CATEGORIES: Record<string, { name: string; description: string }> = {
  jewelry: { name: "Jewelry", description: "Handcrafted stainless steel and African beaded jewelry" },
  "lip-care": { name: "Lip Care", description: "Nourishing lip glosses, oils and balms" },
  "hair-accessories": { name: "Hair Accessories", description: "Stylish pushbacks, hair bands, clips and flower clips" },
};

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category: slug } = await params;
  const categories = await listCategories();
  const dbCategory = categories.find((c) => c.slug === slug);
  const fallback = KNOWN_CATEGORIES[slug];

  // Only 404 when the slug is neither in the DB nor a known category.
  if (!dbCategory && !fallback) {
    notFound();
  }

  const category = dbCategory ?? {
    id: "",
    name: fallback!.name,
    slug,
    parent_id: null,
    description: fallback!.description,
    image_url: null,
    display_order: 0,
    created_at: "",
  };

  const products = await listProductsByCategory(slug);

  return (
    <div>
      <div className="mb-8 flex items-center gap-2 text-sm text-muted">
        <Link href="/shop" className="hover:text-bronze">Shop</Link>
        <span>/</span>
        <span className="text-ink">{category.name}</span>
      </div>

      {products.length > 0 ? (
        <>
          <p className="mb-6 text-sm text-muted">
            {products.length} {products.length === 1 ? "piece" : "pieces"} in {category.name}
          </p>
          <ProductGallery products={products} />
        </>
      ) : (
        <div className="flex flex-col items-center justify-center gap-5 rounded-4xl border border-dashed border-bronze/30 bg-white/50 px-6 py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-champagne/30 to-bronze/20">
            <Gem className="h-7 w-7 text-bronze" />
          </div>
          <div>
            <p className="font-serif text-2xl text-ink">No {category.name} available</p>
            <p className="mt-2 text-sm text-muted">
              We&apos;re currently restocking this category. Check back soon!
            </p>
          </div>
          <Link href="/shop" className="btn-outline mt-4">
            Browse All Products
          </Link>
        </div>
      )}
    </div>
  );
}