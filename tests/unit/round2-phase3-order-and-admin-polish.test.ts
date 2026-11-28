import { describe, expect, it } from "vitest";

import { checkOrderAddressSanity, NON_NAIROBI_TOWNS } from "@/lib/address-sanity";
import { resolveOrderPaymentDisplay } from "@/lib/admin-orders";
import { getCatalogQualityWarnings } from "@/lib/admin-product-filters";
import {
  buildSetupChecklist,
  countUniqueProductsWithCatalogWarnings
} from "@/lib/setup-checklist";
import type { Product } from "@/lib/types";

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: overrides.id ?? "prod-1",
    title: overrides.title ?? "Classic Gold Tone Watch",
    slug: overrides.slug ?? "classic-gold-tone-watch",
    description: overrides.description ?? "A timeless Nairobi dress watch.",
    category: overrides.category ?? "Watches",
    category_id: overrides.category_id === undefined ? "cat-1" : overrides.category_id,
    price: overrides.price ?? "4500.00",
    cost_price: overrides.cost_price === undefined ? "2200.00" : overrides.cost_price,
    stock_quantity: overrides.stock_quantity ?? 5,
    material: overrides.material ?? "Stainless steel",
    finish: overrides.finish === undefined ? "Brushed gold" : overrides.finish,
    size_label: overrides.size_label === undefined ? "40mm case" : overrides.size_label,
    in_the_box:
      overrides.in_the_box === undefined ? "Watch, gift box" : overrides.in_the_box,
    images: overrides.images ?? ["https://example.com/1.jpg", "https://example.com/2.jpg"],
    image_alts: overrides.image_alts ?? ["Front dial", "Side profile"],
    is_featured: overrides.is_featured ?? false,
    active: overrides.active ?? true,
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-11-01T10:00:00Z"
  };
}

describe("Round 2 Phase 3 — 3.1 Payment status display rules", () => {
  it("shows muted 'Not applicable' for cancelled orders with no payments (with or without voided invoice credit note)", () => {
    const unpaidPendingCancel = resolveOrderPaymentDisplay({
      orderStatus: "cancelled",
      paymentStatus: "PENDING",
      amountPaid: 0,
      creditedAmount: 0,
      creditNoteCount: 0
    });
    expect(unpaidPendingCancel.state).toBe("not_applicable");
    expect(unpaidPendingCancel.label).toBe("Not applicable");
    expect(unpaidPendingCancel.className).toContain("text-muted");

    const cancelledConfirmedWithVoidInvoice = resolveOrderPaymentDisplay({
      orderStatus: "CANCELLED",
      paymentStatus: "PENDING",
      amountPaid: 0,
      creditedAmount: 3500,
      creditNoteCount: 1,
      invoiceStatus: "void",
      orderTotal: 3500
    });
    expect(cancelledConfirmedWithVoidInvoice.state).toBe("not_applicable");
    expect(cancelledConfirmedWithVoidInvoice.label).toBe("Not applicable");
  });

  it("shows 'Refunded' or 'Credited' for returned or credited orders based on credit notes and collected payments", () => {
    const paidReturned = resolveOrderPaymentDisplay({
      orderStatus: "returned",
      paymentStatus: "PAID",
      amountPaid: 4500,
      creditedAmount: 4500,
      creditNoteCount: 1,
      invoiceStatus: "void",
      orderTotal: 4500
    });
    expect(paidReturned.state).toBe("refunded");
    expect(paidReturned.label).toBe("Refunded");

    const unpaidReturnedWithCreditNote = resolveOrderPaymentDisplay({
      orderStatus: "returned",
      paymentStatus: "PENDING",
      amountPaid: 0,
      creditedAmount: 4500,
      creditNoteCount: 1,
      invoiceStatus: "void",
      orderTotal: 4500
    });
    expect(unpaidReturnedWithCreditNote.state).toBe("credited");
    expect(unpaidReturnedWithCreditNote.label).toBe("Credited");

    const deliveredUnpaidWithCreditNote = resolveOrderPaymentDisplay({
      orderStatus: "delivered",
      paymentStatus: "PENDING",
      amountPaid: 0,
      creditedAmount: 1500,
      creditNoteCount: 1,
      invoiceStatus: "unpaid",
      orderTotal: 4500
    });
    expect(deliveredUnpaidWithCreditNote.state).toBe("credited");
    expect(deliveredUnpaidWithCreditNote.label).toBe("Credited");

    const cancelledPaidWithCreditNote = resolveOrderPaymentDisplay({
      orderStatus: "cancelled",
      paymentStatus: "PAID",
      amountPaid: 4500,
      creditedAmount: 4500,
      creditNoteCount: 1
    });
    expect(cancelledPaidWithCreditNote.state).toBe("refunded");
    expect(cancelledPaidWithCreditNote.label).toBe("Refunded");
  });

  it("shows 'Pending payment' only for active, unpaid orders, and 'Paid' / 'Partially paid' when paid", () => {
    for (const activeStatus of ["pending", "confirmed", "dispatched", "delivered"] as const) {
      const unpaid = resolveOrderPaymentDisplay({
        orderStatus: activeStatus,
        paymentStatus: "PENDING",
        amountPaid: 0,
        creditedAmount: 0
      });
      expect(unpaid.state).toBe("pending");
      expect(unpaid.label).toBe("Pending payment");
    }

    const partial = resolveOrderPaymentDisplay({
      orderStatus: "delivered",
      paymentStatus: "PENDING",
      amountPaid: 1500,
      invoiceStatus: "partially_paid",
      orderTotal: 4500
    });
    expect(partial.state).toBe("partially_paid");
    expect(partial.label).toBe("Partially paid");

    const paid = resolveOrderPaymentDisplay({
      orderStatus: "delivered",
      paymentStatus: "PAID",
      amountPaid: 4500,
      invoiceStatus: "paid",
      orderTotal: 4500
    });
    expect(paid.state).toBe("paid");
    expect(paid.label).toBe("Paid");
  });
});

describe("Round 2 Phase 3 — 3.2 Address sanity hint matcher", () => {
  it("flags every non-Nairobi town when assigned to a Nairobi delivery zone", () => {
    for (const town of NON_NAIROBI_TOWNS) {
      const warning = checkOrderAddressSanity({
        deliveryZoneName: "Westlands",
        isOutsideNairobi: false,
        deliveryAddress: `Milimani Estate, ${town}`
      });
      expect(warning, `Expected warning for town ${town}`).not.toBeNull();
      expect(warning?.matchedTowns).toContain(town);
      expect(warning?.hasPoBox).toBe(false);
    }
  });

  it("flags P.O. Box variants on Nairobi delivery zones", () => {
    for (const raw of ["P.O. Box 12345-00100", "PO Box 88 Nairobi", "P.O Box 402"]) {
      const warning = checkOrderAddressSanity({
        deliveryZoneName: "CBD",
        isOutsideNairobi: false,
        deliveryAddress: raw
      });
      expect(warning).not.toBeNull();
      expect(warning?.hasPoBox).toBe(true);
      expect(warning?.matches).toContain("P.O. Box");
    }
  });

  it("does not trigger when delivery zone is Outside Nairobi or for Nairobi road names", () => {
    expect(
      checkOrderAddressSanity({
        deliveryZoneName: "Outside Nairobi (courier)",
        isOutsideNairobi: true,
        deliveryAddress: "Nyali Centre, Mombasa"
      })
    ).toBeNull();

    expect(
      checkOrderAddressSanity({
        deliveryZoneName: "Outside Nairobi (courier)",
        isOutsideNairobi: null,
        deliveryAddress: "P.O. Box 45, Kisumu"
      })
    ).toBeNull();

    expect(
      checkOrderAddressSanity({
        deliveryZoneName: "Thika Road",
        isOutsideNairobi: false,
        deliveryAddress: "TRM Drive, Thika Road, Roysambu"
      })
    ).toBeNull();

    expect(
      checkOrderAddressSanity({
        deliveryZoneName: "South B",
        isOutsideNairobi: false,
        deliveryAddress: "Nextgen Mall, Mombasa Road, 2nd Floor"
      })
    ).toBeNull();

    expect(
      checkOrderAddressSanity({
        deliveryZoneName: "Kilimani",
        isOutsideNairobi: false,
        deliveryAddress: "Yaya Centre, Argwings Kodhek Road"
      })
    ).toBeNull();
  });
});

describe("Round 2 Phase 3 — 3.4 Setup checklist card", () => {
  it("tracks all 6 required items, links each to the right page, and marks complete when all 6 pass", () => {
    const complete = buildSetupChecklist({
      alertsConfigured: true,
      activeRidersCount: 2,
      activeProductsCount: 8,
      activeProductsMissingCostCount: 0,
      catalogWarningsProductCount: 0,
      deliveryFeesReviewed: true,
      legalReviewedAt: "2026-11-27T10:00:00Z"
    });

    expect(complete.totalCount).toBe(6);
    expect(complete.completedCount).toBe(6);
    expect(complete.progressPercent).toBe(100);
    expect(complete.isComplete).toBe(true);
    expect(complete.items.map(item => item.href)).toEqual([
      "/admin/settings?tab=alerts",
      "/admin/riders",
      "/admin/products",
      "/admin/products",
      "/admin/settings?tab=store#delivery-zones",
      "/admin/settings?tab=store#legal-pages"
    ]);

    const incomplete = buildSetupChecklist({
      alertsConfigured: false,
      activeRidersCount: 0,
      activeProductsCount: 5,
      activeProductsMissingCostCount: 2,
      catalogWarningsProductCount: 1,
      deliveryFeesReviewed: false,
      legalReviewedAt: null
    });

    expect(incomplete.completedCount).toBe(0);
    expect(incomplete.isComplete).toBe(false);
    expect(incomplete.progressPercent).toBe(0);
  });

  it("reuses existing catalog quality warnings and counts unique active products with warnings", () => {
    const prodOk = makeProduct({ id: "p-ok" });
    const prodMultiWarn = makeProduct({
      id: "p-warn",
      finish: null,
      in_the_box: null,
      images: ["https://example.com/only-one.jpg"],
      image_alts: []
    });

    const warnings = getCatalogQualityWarnings([prodOk, prodMultiWarn]);
    expect(warnings.hasWarnings).toBe(true);
    expect(countUniqueProductsWithCatalogWarnings(warnings)).toBe(1);
  });
});

