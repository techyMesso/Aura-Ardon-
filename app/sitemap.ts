import type { MetadataRoute } from "next";

import { productHref } from "@/lib/catalog";
import { listCategories, listPublicProducts } from "@/lib/data";
import { getOptionalSiteUrl } from "@/lib/env";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getOptionalSiteUrl() ?? "https://aura-ardon.vercel.app";
  const [categories, products] = await Promise.all([
    listCategories(),
    listPublicProducts()
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    "",
    "/shop",
    "/about",
    "/how-to-order",
    "/shipping",
    "/returns",
    "/contact"
  ].map(path => ({
    url: `${siteUrl}${path}`,
    changeFrequency: path === "" || path === "/shop" ? "daily" : "monthly",
    priority: path === "" ? 1 : path === "/shop" ? 0.9 : 0.6
  }));

  const categoryRoutes: MetadataRoute.Sitemap = categories.map(category => ({
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
