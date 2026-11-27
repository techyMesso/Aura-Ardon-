import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/admin/orders"
}));

import { OrderManager } from "@/components/admin/order-manager";
import { PriceKES } from "@/components/storefront/price-kes";
import { checkOrderAddressSanity, NON_NAIROBI_TOWNS } from "@/lib/address-sanity";
import { resolveOrderPaymentDisplay } from "@/lib/admin-orders";
import {
  computeAverageOrderValue,
  formatOrdersCardHeadline
} from "@/lib/analytics";
import {
  getCategoryGridClassName,
  getCategoryTileAspectClassName,
  getCategoryTileSizes
} from "@/lib/catalog";
import { isTestInvoice } from "@/lib/invoices";
import { isTestOrderCustomerName } from "@/lib/test-orders";
import type { Order } from "@/lib/types";

(globalThis as unknown as { React: typeof React }).React = React;

function relativeLuminance(r: number, g: number, b: number): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number]
): number {
  const l1 = relativeLuminance(...fg);
  const l2 = relativeLuminance(...bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function parseRgbTriplet(css: string, selector: string, token: string): [number, number, number] {
  const blockRe = new RegExp(`${selector.replace(".", "\\.")}\\s*\\{([\\s\\S]*?)\\}`, "m");
  const blockMatch = css.match(blockRe);
  if (!blockMatch) {
    throw new Error(`Missing CSS block for ${selector}`);
  }
  const tokenRe = new RegExp(`${token}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+)\\s*;`);
  const tokenMatch = blockMatch[1].match(tokenRe);
  if (!tokenMatch) {
    throw new Error(`Missing token ${token} in ${selector}`);
  }
  return [Number(tokenMatch[1]), Number(tokenMatch[2]), Number(tokenMatch[3])];
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: "ord-p5-1",
    order_number: "AA-TEST1",
    channel: "whatsapp",
    status: "pending",
    is_test: true,
    customer_id: "cust-1",
    customer_name: "TEST Phase5 Buyer",
    customer_email: null,
    customer_phone: "254712345678",
    customer_location: "Westlands — Sarit",
    delivery_zone_id: "zone-1",
    delivery_zone_name: "Westlands",
    delivery_address: "Sarit Centre",
    town_county: null,
    notes: null,
    payment_method: "WHATSAPP",
    payment_status: "PENDING",
    order_status: "PENDING_CONFIRMATION",
    subtotal: "4500.00",
    shipping_fee: "200.00",
    total: "4700.00",
    rider_cost: null,
    dispatched_at: null,
    created_at: "2026-11-27T09:00:00.000Z",
    ...overrides
  };
}

describe("Round 2 Phase 5 — Unit tests: payment-status label rules", () => {
  it("labels cancelled orders with no payments as muted 'Not applicable'", () => {
    const unpaidCancelled = resolveOrderPaymentDisplay({
      orderStatus: "cancelled",
      paymentStatus: "PENDING",
      amountPaid: 0,
      creditedAmount: 0,
      creditNoteCount: 0
    });
    expect(unpaidCancelled.label).toBe("Not applicable");
    expect(unpaidCancelled.state).toBe("not_applicable");
    expect(unpaidCancelled.className).toContain("text-muted");

    const cancelledVoidedInvoice = resolveOrderPaymentDisplay({
      orderStatus: "CANCELLED",
      paymentStatus: "PENDING",
      amountPaid: 0,
      creditedAmount: 4700,
      creditNoteCount: 1,
      invoiceStatus: "void",
      orderTotal: 4700
    });
    expect(cancelledVoidedInvoice.label).toBe("Not applicable");
  });

  it("labels returned and credited orders as 'Refunded' or 'Credited' based on credit notes and payments", () => {
    expect(
      resolveOrderPaymentDisplay({
        orderStatus: "returned",
        paymentStatus: "PAID",
        amountPaid: 4700,
        creditedAmount: 4700,
        creditNoteCount: 1
      }).label
    ).toBe("Refunded");

    expect(
      resolveOrderPaymentDisplay({
        orderStatus: "returned",
        paymentStatus: "PENDING",
        amountPaid: 0,
        creditedAmount: 4700,
        creditNoteCount: 1
      }).label
    ).toBe("Credited");

    expect(
      resolveOrderPaymentDisplay({
        orderStatus: "delivered",
        paymentStatus: "PENDING",
        amountPaid: 0,
        creditedAmount: 1000,
        creditNoteCount: 1
      }).label
    ).toBe("Credited");
  });

  it("shows 'Pending payment' strictly on active unpaid orders and 'Partially paid' / 'Paid' when money was collected", () => {
    for (const status of ["pending", "confirmed", "dispatched", "delivered"] as const) {
      expect(
        resolveOrderPaymentDisplay({
          orderStatus: status,
          paymentStatus: "PENDING",
          amountPaid: 0,
          creditedAmount: 0
        }).label
      ).toBe("Pending payment");
    }

    expect(
      resolveOrderPaymentDisplay({
        orderStatus: "delivered",
        paymentStatus: "PENDING",
        amountPaid: 1500,
        orderTotal: 4700,
        invoiceStatus: "partially_paid"
      }).label
    ).toBe("Partially paid");

    expect(
      resolveOrderPaymentDisplay({
        orderStatus: "delivered",
        paymentStatus: "PAID",
        amountPaid: 4700,
        orderTotal: 4700,
        invoiceStatus: "paid"
      }).label
    ).toBe("Paid");
  });
});

describe("Round 2 Phase 5 — Unit tests: AOV calculation & Orders card clarity", () => {
  it("computes AOV = bookedRevenue / nonCancelledOrders and returns null when nonCancelledOrders <= 0", () => {
    expect(computeAverageOrderValue(0, 0)).toBeNull();
    expect(computeAverageOrderValue(12500, 0)).toBeNull();
    expect(computeAverageOrderValue(12500, -1)).toBeNull();
    expect(computeAverageOrderValue(Number.NaN, 2)).toBe(0);
    expect(computeAverageOrderValue(0, 2)).toBe(0);
    expect(computeAverageOrderValue(9000, 2)).toBe(4500);
    expect(computeAverageOrderValue(10000, 3)).toBe(3333.33);
  });

  it("formats Orders card headline so cancelled counts never contradict booked revenue", () => {
    expect(formatOrdersCardHeadline(1, 1)).toBe("1 order · 1 cancelled");
    expect(formatOrdersCardHeadline(4, 2)).toBe("4 orders · 2 cancelled");
    expect(formatOrdersCardHeadline(1, 0)).toBe("1 order");
    expect(formatOrdersCardHeadline(0, 0)).toBe("0 orders");
  });
});

describe("Round 2 Phase 5 — Unit tests: address sanity matcher", () => {
  it("matches every non-Nairobi town and P.O. Box on Nairobi zones (case-insensitively)", () => {
    expect(NON_NAIROBI_TOWNS).toHaveLength(12);
    for (const town of NON_NAIROBI_TOWNS) {
      const lowerRes = checkOrderAddressSanity({
        deliveryZoneName: "Kilimani",
        isOutsideNairobi: false,
        deliveryAddress: `Stage Plaza, ${town.toLowerCase()}`
      });
      expect(lowerRes, `Expected match for ${town}`).not.toBeNull();
      expect(lowerRes?.matchedTowns).toContain(town);
    }

    const combined = checkOrderAddressSanity({
      deliveryZoneName: "CBD",
      isOutsideNairobi: false,
      deliveryAddress: "P.O. Box 40100, Kisumu"
    });
    expect(combined).not.toBeNull();
    expect(combined?.hasPoBox).toBe(true);
    expect(combined?.matchedTowns).toContain("Kisumu");
    expect(combined?.matches).toEqual(["Kisumu", "P.O. Box"]);
  });

  it("ignores Outside Nairobi zones and Nairobi highways/roads named after other towns", () => {
    expect(
      checkOrderAddressSanity({
        deliveryZoneName: "Outside Nairobi (courier)",
        isOutsideNairobi: true,
        deliveryAddress: "P.O. Box 12, Mombasa"
      })
    ).toBeNull();

    for (const nairobiAddr of [
      "TRM Drive, Thika Road",
      "Nextgen Mall, Mombasa Rd",
      "Junction Mall, Naivasha Road",
      "Westgate Mall, Mwanzi Road"
    ]) {
      expect(
        checkOrderAddressSanity({
          deliveryZoneName: "Westlands",
          isOutsideNairobi: false,
          deliveryAddress: nairobiAddr
        }),
        `Unexpected warning for Nairobi address "${nairobiAddr}"`
      ).toBeNull();
    }
  });
});

describe("Round 2 Phase 5 — Unit tests: category grid column logic", () => {
  it("adapts grid columns, aspect ratios, and image sizes for 1, 2, 3, 4, and 5+ categories", () => {
    expect(getCategoryGridClassName(0)).toBe("grid-cols-1");
    expect(getCategoryGridClassName(1)).toBe("grid-cols-1");
    expect(getCategoryGridClassName(2)).toBe("grid-cols-2");
    expect(getCategoryGridClassName(3)).toBe("grid-cols-3");
    expect(getCategoryGridClassName(4)).toBe("grid-cols-2 lg:grid-cols-4");
    expect(getCategoryGridClassName(5)).toBe(
      "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    );
    expect(getCategoryGridClassName(8)).toBe(
      "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    );

    expect(getCategoryTileAspectClassName(1)).toContain("aspect-[16/7]");
    expect(getCategoryTileAspectClassName(2)).toBe("aspect-[4/3]");
    expect(getCategoryTileAspectClassName(3)).toBe("aspect-square");
    expect(getCategoryTileSizes(1)).toBe("100vw");
    expect(getCategoryTileSizes(2)).toBe("50vw");
    expect(getCategoryTileSizes(3)).toBe("33vw");
    expect(getCategoryTileSizes(4)).toContain("25vw");
  });
});

describe("Round 2 Phase 5 — Unit tests: test-order detection & admin TEST badge", () => {
  it("detects TEST-prefixed customer names and TEST-INV invoices without false positives", () => {
    for (const testName of [
      "TEST",
      "TEST Buyer",
      "  TEST-99",
      "TEST_QA",
      "TESTUser",
      "test",
      "test order",
      "test-1"
    ]) {
      expect(isTestOrderCustomerName(testName), `Expected test: "${testName}"`).toBe(
        true
      );
    }

    for (const realName of [
      "Amina Wanjiku",
      "Testa Kamau",
      "My Test Order",
      "Attestation",
      "",
      null,
      undefined
    ]) {
      expect(
        isTestOrderCustomerName(realName),
        `Expected non-test: "${String(realName)}"`
      ).toBe(false);
    }

    expect(isTestInvoice({ is_test: true, invoice_number: "INV-2026-0001" })).toBe(
      true
    );
    expect(isTestInvoice({ is_test: false, invoice_number: "TEST-INV-0001" })).toBe(
      true
    );
    expect(isTestInvoice({ is_test: false, invoice_number: "INV-2026-0001" })).toBe(
      false
    );
  });

  it("renders visible TEST badge and Not applicable payment status in OrderManager", () => {
    const html = renderToStaticMarkup(
      React.createElement(OrderManager, {
        initialOrders: [
          makeOrder({
            id: "ord-test-1",
            order_number: "AA-TEST1",
            customer_name: "TEST E2E Buyer",
            is_test: true,
            status: "pending"
          }),
          makeOrder({
            id: "ord-cancel-1",
            order_number: "AA-CANC1",
            customer_name: "Real Cancelled Buyer",
            is_test: false,
            status: "cancelled",
            order_status: "CANCELLED",
            payment_status: "PENDING",
            payment_amount_paid: 0
          })
        ],
        isOwner: true
      })
    );

    expect(html).toContain("AA-TEST1");
    expect(html).toContain(">TEST<");
    expect(html).toContain("Not applicable");
  });
});

describe("Round 2 Phase 5 — Unit contrast verification for light-theme prices", () => {
  it("parses app/globals.css tokens and verifies light-theme and dark-theme price contrast >= 4.5:1", () => {
    const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
    const lightPrice = parseRgbTriplet(css, ":root", "--price");
    const lightPaper = parseRgbTriplet(css, ":root", "--paper");
    const lightStone = parseRgbTriplet(css, ":root", "--stone");
    const darkPrice = parseRgbTriplet(css, "html.dark", "--price");
    const darkPaper = parseRgbTriplet(css, "html.dark", "--paper");

    expect(lightPrice).toEqual([138, 106, 34]); // #8A6A22
    expect(darkPrice).toEqual([184, 146, 62]); // #B8923E

    // Prices on white paper in light mode must meet WCAG AA >= 4.5:1
    expect(contrastRatio(lightPrice, lightPaper)).toBeGreaterThanOrEqual(4.5);
    // Gold small text on stone (#EFEBE7) uses #7A5D1D (122, 93, 29) >= 4.5:1
    expect(contrastRatio([122, 93, 29], lightStone)).toBeGreaterThanOrEqual(4.5);
    // Prices on dark paper in dark mode must meet WCAG AA >= 4.5:1
    expect(contrastRatio(darkPrice, darkPaper)).toBeGreaterThanOrEqual(4.5);

    const priceMarkup = renderToStaticMarkup(
      React.createElement(PriceKES, { amount: 3500 })
    );
    expect(priceMarkup).toContain("text-price");
    expect(priceMarkup).not.toContain("text-brass");
  });
});

