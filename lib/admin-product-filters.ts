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
