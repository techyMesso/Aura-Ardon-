import { notFound } from "next/navigation";
import Image from "next/future/image";
import Link from "next/link";
import { Check } from "lucide-react";

import { getProductBySlug, listCategories } from "@/lib/data";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";
import { ProductDetailClient } from "./product-detail-client";

interface ProductPageProps {
  params: Promise<{ category: string; product: string }>;
}

export async function generateStaticParams() {
  const categories = await listCategories();
  const params: Array<{ category: string; product: string }> = [];
  
  for (const cat of categories) {
    const { createServerSupabaseClient } = await import("@/lib/supabase/server");
    const supabase = await createServerSupabaseClient();
    const { data: products } = await supabase
      .from("products")
      .select("slug,category_id")
      .eq("category_id", cat.id);
    
    if (products) {
      for (const p of products) {
        if (p.slug) {
          params.push({ category: cat.slug, product: p.slug });
        }
      }
    }
  }
  
  return params;
}

export async function generateMetadata({ params }: ProductPageProps) {
  const { product: slug } = await params;
  const product = await getProductBySlug(slug);
  
  if (!product) {
    return { title: "Product Not Found" };
  }
  
  return {
    title: `${product.title} | Auro Ardon`,
    description: product.description.slice(0, 160),
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { category: _cat, product: slug } = await params;
  const product = await getProductBySlug(slug);
  
  if (!product) {
    notFound();
  }
  
  return <ProductDetailClient product={product} />;
}