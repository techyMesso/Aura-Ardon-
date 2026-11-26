import type { MetadataRoute } from "next";

import { productHref } from "@/lib/catalog";
import { listCategories, listPublicProducts } from "@/lib/data";
import { resolveSiteUrl } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = resolveSiteUrl();
  const [categories, products] = await Promise.all([
    listCategories(),
    listPublicProducts()
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { path: "", changeFrequency: "daily", priority: 1 },
    { path: "/shop", changeFrequency: "daily", priority: 0.9 },
    { path: "/about", changeFrequency: "monthly", priority: 0.6 },
    { path: "/how-to-order", changeFrequency: "monthly", priority: 0.6 },
    { path: "/shipping", changeFrequency: "monthly", priority: 0.6 },
    { path: "/returns", changeFrequency: "monthly", priority: 0.6 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.6 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.6 }
  ].map(({ path, changeFrequency, priority }) => ({
    url: `${siteUrl}${path}`,
    changeFrequency: changeFrequency as MetadataRoute.Sitemap[number]["changeFrequency"],
    priority
  }));

  // Include only categories with at least one active product
  const activeCategoryIds = new Set(
    products
      .map(product => product.category_id)
      .filter((id): id is string => Boolean(id))
  );

  const categoryRoutes: MetadataRoute.Sitemap = categories
    .filter(category => activeCategoryIds.has(category.id))
    .map(category => ({
      url: `${siteUrl}/shop/${category.slug}`,
      changeFrequency: "weekly",
      priority: 0.8
    }));

  const productRoutes: MetadataRoute.Sitemap = products.map(product => ({
    url: `${siteUrl}${productHref(product)}`,
    lastModified: product.created_at ? new Date(product.created_at) : undefined,
    changeFrequency: "weekly",
    priority: 0.8
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
