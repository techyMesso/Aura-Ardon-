import { revalidatePath, revalidateTag } from "next/cache";

import { logger } from "@/lib/logger";

function safelyRevalidate(tags: string[]) {
  for (const tag of tags) {
    try {
      revalidateTag(tag);
    } catch (error) {
      // A committed write must not be reported as failed because cache refresh failed.
      logger.warn?.("Storefront cache tag could not be revalidated", {
        tag,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

function safelyRevalidatePaths(paths: string[]) {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (error) {
      logger.warn?.("Route path could not be revalidated", {
        path,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
}

export function revalidateProductCatalog() {
  safelyRevalidate(["products", "featured-products"]);
}

export function revalidateCategoryCatalog() {
  safelyRevalidate(["categories"]);
}

export function revalidateStoreSettings() {
  safelyRevalidate(["store-settings"]);
  safelyRevalidatePaths(["/", "/privacy", "/terms", "/shipping", "/faq", "/about"]);
}

export function revalidateDeliveryZones() {
  safelyRevalidate(["delivery-zones"]);
  safelyRevalidatePaths([
    "/checkout",
    "/shipping",
    "/faq",
    "/admin/riders",
    "/admin/settings"
  ]);
}

export function revalidateReviews() {
  safelyRevalidate(["reviews", "products", "featured-products"]);
}
