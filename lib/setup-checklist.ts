import type { CatalogQualityWarnings } from "@/lib/admin-product-filters";

export type SetupChecklistItemId =
  | "alerts"
  | "riders"
  | "cost_prices"
  | "product_specs"
  | "delivery_fees"
  | "legal_pages"
  | "owner_mfa";

export interface SetupChecklistItem {
  id: SetupChecklistItemId;
  label: string;
  detail: string;
  href: string;
  completed: boolean;
}

export interface SetupChecklistInput {
  alertsConfigured: boolean;
  activeRidersCount: number;
  activeProductsCount: number;
  activeProductsMissingCostCount: number;
  catalogWarningsProductCount: number;
  deliveryFeesReviewed: boolean;
  legalReviewedAt: string | null;
  ownerMfaEnabled: boolean;
}

export interface SetupChecklistSummary {
  items: SetupChecklistItem[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  isComplete: boolean;
}

export function countUniqueProductsWithCatalogWarnings(
  warnings: CatalogQualityWarnings
): number {
  const ids = new Set<string>();
  for (const list of [
    warnings.missingCategory,
    warnings.missingSecondImage,
    warnings.missingAltText,
    warnings.shortName,
    warnings.missingFinishSizeInTheBox,
    warnings.misspellings.map(entry => entry.product)
  ]) {
    for (const product of list) {
      ids.add(product.id);
    }
  }
  return ids.size;
}

export function buildSetupChecklist(
  input: SetupChecklistInput
): SetupChecklistSummary {
  const missingCostCount = Math.max(0, input.activeProductsMissingCostCount);
  const specWarningCount = Math.max(0, input.catalogWarningsProductCount);
  const ridersCount = Math.max(0, input.activeRidersCount);
  const hasLegalReview = Boolean(input.legalReviewedAt && input.legalReviewedAt.trim());

  const items: SetupChecklistItem[] = [
    {
      id: "alerts",
      label: "Order alerts configured",
      detail: input.alertsConfigured
        ? "Email or push alerts are active for new orders."
        : "Set up email alerts or enable push notifications on your phone.",
      href: "/admin/settings?tab=alerts",
      completed: input.alertsConfigured
    },
    {
      id: "riders",
      label: "At least 1 active rider",
      detail:
        ridersCount >= 1
          ? `${ridersCount} active ${ridersCount === 1 ? "rider" : "riders"} ready for dispatch.`
          : "Add your delivery rider(s) for dispatch sheets and margin tracking.",
      href: "/admin/riders",
      completed: ridersCount >= 1
    },
    {
      id: "cost_prices",
      label: "Every active product has a cost price",
      detail:
        missingCostCount === 0
          ? input.activeProductsCount > 0
            ? `All ${input.activeProductsCount} active products have cost prices.`
            : "No active products missing a cost price."
          : `${missingCostCount} active ${missingCostCount === 1 ? "product is" : "products are"} missing a cost price for gross profit tracking.`,
      href: "/admin/products",
      completed: missingCostCount === 0
    },
    {
      id: "product_specs",
      label: "Every active product has complete specs",
      detail:
        specWarningCount === 0
          ? "No catalog quality or spec warnings on active products."
          : `${specWarningCount} active ${specWarningCount === 1 ? "product has" : "products have"} missing specs, images, or alt text.`,
      href: "/admin/products",
      completed: specWarningCount === 0
    },
    {
      id: "delivery_fees",
      label: "Delivery fees reviewed",
      detail: input.deliveryFeesReviewed
        ? "Delivery zones and fees have been reviewed."
        : "Review and save at least one delivery zone fee in Store Settings.",
      href: "/admin/settings?tab=store#delivery-zones",
      completed: input.deliveryFeesReviewed
    },
    {
      id: "legal_pages",
      label: "Legal pages reviewed",
      detail: hasLegalReview
        ? "Privacy Policy and Terms & Conditions marked as reviewed."
        : "Review /privacy and /terms and mark them reviewed in Store Settings.",
      href: "/admin/settings?tab=store#legal-pages",
      completed: hasLegalReview
    },
    {
      id: "owner_mfa",
      label: "Owner two-step login (MFA) enabled",
      detail: input.ownerMfaEnabled
        ? "Authenticator app TOTP factor is verified on your owner account."
        : "Enable TOTP two-step verification to protect store settings and orders.",
      href: "/admin?setupMfa=1",
      completed: input.ownerMfaEnabled
    }
  ];

  const completedCount = items.filter(item => item.completed).length;
  const totalCount = items.length;

  return {
    items,
    completedCount,
    totalCount,
    progressPercent: Math.round((completedCount / totalCount) * 100),
    isComplete: completedCount === totalCount
  };
}

