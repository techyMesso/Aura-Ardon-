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

export interface CatalogPriceRange {
  id: string;
  label: string;
  min: number;
  max: number;
}

export function computeCatalogPriceRanges(
  products: Pick<Product, "price">[]
): CatalogPriceRange[] {
  const allOption: CatalogPriceRange = {
    id: "all",
    label: "All prices",
    min: 0,
    max: Number.POSITIVE_INFINITY
  };

  const prices = products
    .map(product => Number(product.price))
    .filter(price => Number.isFinite(price) && price > 0)
    .sort((a, b) => a - b);

  if (prices.length === 0) {
    return [allOption];
  }

  const min = prices[0];
  const max = prices[prices.length - 1];

  if (min === max) {
    return [allOption];
  }

  let q1 = Math.round(prices[Math.floor(prices.length / 3)]);
  let q2 = Math.round(prices[Math.floor((prices.length * 2) / 3)]);

  if (q1 <= min || q1 >= max) {
    q1 = Math.max(min + 1, Math.round(min + (max - min) / 3));
  }
  if (q2 <= q1 || q2 >= max) {
    q2 = Math.max(q1 + 1, Math.round(min + ((max - min) * 2) / 3));
  }

  const fmt = (value: number) => Math.round(value).toLocaleString("en-KE");

  if (q2 >= max) {
    return [
      allOption,
      { id: "bucket-1", label: `Up to KES ${fmt(q1)}`, min: 0, max: q1 },
      {
        id: "bucket-2",
        label: `Over KES ${fmt(q1)}`,
        min: q1,
        max: Number.POSITIVE_INFINITY
      }
    ];
  }

  return [
    allOption,
    { id: "bucket-1", label: `Up to KES ${fmt(q1)}`, min: 0, max: q1 },
    {
      id: "bucket-2",
      label: `KES ${fmt(q1)} – ${fmt(q2)}`,
      min: q1,
      max: q2
    },
    {
      id: "bucket-3",
      label: `Over KES ${fmt(q2)}`,
      min: q2,
      max: Number.POSITIVE_INFINITY
    }
  ];
}

export function normalizeMaterialKey(
  value: string | null | undefined
): string {
  if (!value) return "";
  return value
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

export interface MaterialChip {
  key: string;
  label: string;
  count: number;
}

export function computeMaterialChips(
  products: Pick<Product, "material">[],
  maxChips = 8
): MaterialChip[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const product of products) {
    const key = normalizeMaterialKey(product.material);
    if (!key) continue;

    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      const label = key.charAt(0).toUpperCase() + key.slice(1);
      counts.set(key, { label, count: 1 });
    }
  }

  return Array.from(counts.entries())
    .map(([key, { label, count }]) => ({ key, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, maxChips);
}


