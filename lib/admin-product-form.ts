import type { Category, Product } from "@/lib/types";

export function getProductFormCategories(categories: Category[]) {
  return [...categories].sort(
    (left, right) => left.display_order - right.display_order || left.name.localeCompare(right.name)
  );
}

export function getInitialProductCategoryId(
  product: Product | null | undefined,
  categories: Category[]
) {
  if (!product) return "";

  if (product.category_id && categories.some(category => category.id === product.category_id)) {
    return product.category_id;
  }

  const legacyCategory = product.category.trim().toLocaleLowerCase();
  return categories.find(category => category.name.trim().toLocaleLowerCase() === legacyCategory)?.id ?? "";
}

export function getCategoryFormMessage(categories: Category[]) {
  return categories.length ? null : "Create a category before adding a product";
}
