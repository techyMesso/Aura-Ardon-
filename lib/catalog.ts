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
    return url.protocol === "https:" && (
      url.hostname === "supabase.co" || url.hostname.endsWith(".supabase.co")
    );
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

export function getCanonicalProductPath(
  product: Product,
  categories: CategoryMap
) {
  const category = resolveProductCategory(product, categories);
  if (!category) return null;

  return `/shop/${category.slug}/${product.slug || product.id}`;
}
