import { revalidateTag } from "next/cache";

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

export function revalidateProductCatalog() {
  safelyRevalidate(["products", "featured-products"]);
}

export function revalidateCategoryCatalog() {
  safelyRevalidate(["categories"]);
}
