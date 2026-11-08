import type { Category, Product } from "@/lib/types";

export type CategoryMap = ReadonlyMap<string, Category>;

export function toCatalogSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isSupportedCatalogImageUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return false;
    if (url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co")) {
      return true;
    }
    const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (configuredUrl) {
      const configuredHost = new URL(configuredUrl).hostname;
      return url.hostname === configuredHost;
    }
    return false;
  } catch {
    return false;
  }
}

export function getSafeCatalogImageUrl(value: string | null | undefined) {
  return value && isSupportedCatalogImageUrl(value) ? value : null;
}

export function createCategoryMap(categories: Category[]): CategoryMap {
  return new Map(categories.map(category => [category.id, category]));
}

export function resolveProductCategory(
  product: Product,
  categories: CategoryMap
) {
  if (!product.category_id) return null;
  return categories.get(product.category_id) ?? null;
}

export function productHref(product: Pick<Product, "id" | "slug">): string {
  const identifier = (product.slug || product.id).trim();
  return `/p/${encodeURIComponent(identifier)}`;
}

export function getCanonicalProductPath(
  product: Pick<Product, "id" | "slug">,
  _categories?: CategoryMap
) {
  void _categories;
  return productHref(product);
}

