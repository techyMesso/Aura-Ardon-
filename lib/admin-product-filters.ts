import type { Product } from "@/lib/types";

export const LOW_STOCK_THRESHOLD = 5;

export type ProductActiveFilter = "all" | "active" | "inactive";
export type ProductFeaturedFilter = "all" | "featured" | "not-featured";
export type ProductStockFilter = "all" | "in-stock" | "low-stock" | "out-of-stock";
export type ProductStockStatus = Exclude<ProductStockFilter, "all">;

export interface ProductListFilters {
  search: string;
  category: string;
  active: ProductActiveFilter;
  featured: ProductFeaturedFilter;
  stock: ProductStockFilter;
}

export const DEFAULT_PRODUCT_LIST_FILTERS: ProductListFilters = {
  search: "",
  category: "all",
  active: "all",
  featured: "all",
  stock: "all"
};

export function getProductStockStatus(quantity: number): ProductStockStatus {
  if (quantity <= 0) return "out-of-stock";
  if (quantity <= LOW_STOCK_THRESHOLD) return "low-stock";
  return "in-stock";
}

export function filterProducts(products: Product[], filters: ProductListFilters) {
  const search = filters.search.trim().toLocaleLowerCase();

  return products.filter((product) => {
    if (search && !product.title.toLocaleLowerCase().includes(search)) return false;
    if (filters.category !== "all" && product.category !== filters.category) return false;
    if (filters.active === "active" && !product.active) return false;
    if (filters.active === "inactive" && product.active) return false;
    if (filters.featured === "featured" && !product.is_featured) return false;
    if (filters.featured === "not-featured" && product.is_featured) return false;

    return filters.stock === "all" || getProductStockStatus(product.stock_quantity) === filters.stock;
  });
}

export interface CatalogQualityWarnings {
  missingCategory: Product[];
  missingSecondImage: Product[];
  shortName: Product[];
  missingFinishSizeInTheBox: Product[];
  hasWarnings: boolean;
}

const BEAUTY_CATEGORY_PATTERN =
  /\b(beauty|lip|gloss|lipgloss|cosmetic|cosmetics|makeup|skincare|skin\s*care|balm|fragrance|perfume)\b/i;

export function isBeautyCategoryProduct(product: Product): boolean {
  const categoryName = product.category?.trim() ?? "";
  if (categoryName && BEAUTY_CATEGORY_PATTERN.test(categoryName)) {
    return true;
  }
  const materialOrTitle = `${product.material ?? ""} ${product.title ?? ""}`;
  return /\b(beauty|lip\s*gloss|lipgloss|cosmetic|cosmetics|makeup|skincare|lip\s*care|lip\s*oil|lip\s*balm)\b/i.test(
    materialOrTitle
  );
}

export function getCatalogQualityWarnings(
  products: Product[]
): CatalogQualityWarnings {
  const activeProducts = products.filter(product => product.active);

  const missingCategory = activeProducts.filter(
    product => !product.category_id
  );
  const missingSecondImage = activeProducts.filter(
    product => (product.images?.filter(Boolean).length ?? 0) < 2
  );
  const shortName = activeProducts.filter(
    product => (product.title?.trim().length ?? 0) < 8
  );
  const missingFinishSizeInTheBox = activeProducts.filter(
    product =>
      !isBeautyCategoryProduct(product) &&
      (!product.finish?.trim() ||
        !product.size_label?.trim() ||
        !product.in_the_box?.trim())
  );

  return {
    missingCategory,
    missingSecondImage,
    shortName,
    missingFinishSizeInTheBox,
    hasWarnings:
      missingCategory.length > 0 ||
      missingSecondImage.length > 0 ||
      shortName.length > 0 ||
      missingFinishSizeInTheBox.length > 0
  };
}

