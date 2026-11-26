import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Footer } from "@/components/storefront/footer";
import { StoreClosedBanner } from "@/components/storefront/store-closed-banner";
import { filterNonEmptyCategories } from "@/lib/catalog";
import { computeDeliveryEstimate } from "@/lib/delivery-estimate";
import { DEFAULT_STORE_CONFIG } from "@/lib/site";
import type { Category, Product } from "@/lib/types";

(globalThis as unknown as { React: typeof React }).React = React;

const watches: Category = {
  id: "cat-watches",
  name: "Watches",
  slug: "watches",
  parent_id: null,
  description: null,
  image_url: null,
  display_order: 1,
  created_at: "2026-01-01T00:00:00.000Z"
};

const accessories: Category = {
  id: "cat-empty",
  name: "Accessories",
  slug: "accessories",
  parent_id: null,
  description: null,
  image_url: null,
  display_order: 2,
  created_at: "2026-01-01T00:00:00.000Z"
};

describe("Phase 2 catalog, delivery countdown, footer, and store closed mode", () => {
  it("hides empty categories and inactive-only categories", () => {
    const products: Pick<Product, "category_id" | "active">[] = [
      { category_id: watches.id, active: true },
      { category_id: accessories.id, active: false }
    ];

    const visible = filterNonEmptyCategories([watches, accessories], products);
    expect(visible.map(c => c.slug)).toEqual(["watches"]);
  });

  it("computes same-day Nairobi countdown before EAT cutoff, next-day after cutoff, and Monday on Sunday", () => {
    // Wednesday 11:46 EAT (08:46 UTC) vs 14:00 cutoff -> 2h 14m remaining
    const wedMorning = new Date("2026-05-06T08:46:00.000Z");
    const sameDay = computeDeliveryEstimate({
      now: wedMorning,
      sameDayCutoff: "14:00",
      isStoreOpen: true
    });
    expect(sameDay.isSameDay).toBe(true);
    expect(sameDay.headline).toBe(
      "Order in 2h 14m for same-day delivery in Nairobi."
    );

    // Wednesday 15:30 EAT (12:30 UTC) -> next-day delivery
    const wedAfternoon = new Date("2026-05-06T12:30:00.000Z");
    const nextDay = computeDeliveryEstimate({
      now: wedAfternoon,
      sameDayCutoff: "14:00",
      isStoreOpen: true
    });
    expect(nextDay.isSameDay).toBe(false);
    expect(nextDay.headline).toContain("next-day");

    // Sunday 10:00 EAT (07:00 UTC) -> Monday delivery
    const sunday = new Date("2026-05-10T07:00:00.000Z");
    const monday = computeDeliveryEstimate({
      now: sunday,
      sameDayCutoff: "14:00",
      isStoreOpen: true
    });
    expect(monday.isSameDay).toBe(false);
    expect(monday.headline).toContain("Monday");

    // Store closed -> holiday banner message
    const closed = computeDeliveryEstimate({
      now: wedMorning,
      sameDayCutoff: "14:00",
      isStoreOpen: false,
      holidayBannerMessage: "Closed for Jamhuri Day — reopening Dec 13."
    });
    expect(closed.isSameDay).toBe(false);
    expect(closed.headline).toBe("Closed for Jamhuri Day — reopening Dec 13.");
  });

  it("renders StoreClosedBanner only when store is closed or banner message is set", () => {
    const hidden = renderToStaticMarkup(
      React.createElement(StoreClosedBanner, {
        isStoreOpen: true,
        holidayBannerMessage: ""
      })
    );
    expect(hidden).toBe("");

    const shown = renderToStaticMarkup(
      React.createElement(StoreClosedBanner, {
        isStoreOpen: false,
        holidayBannerMessage: "Studio holiday until Monday."
      })
    );
    expect(shown).toContain("Studio holiday until Monday.");
  });

  it("renders required footer links and hides empty social links", () => {
    const htmlNoSocials = renderToStaticMarkup(
      React.createElement(Footer, {
        categories: [watches],
        storeSettings: {
          ...DEFAULT_STORE_CONFIG,
          instagram_url: "",
          tiktok_url: ""
        }
      })
    );
    expect(htmlNoSocials).toContain('href="/about"');
    expect(htmlNoSocials).toContain('href="/how-to-order"');
    expect(htmlNoSocials).toContain('href="/shipping"');
    expect(htmlNoSocials).toContain('href="/returns"');
    expect(htmlNoSocials).toContain('href="/faq"');
    expect(htmlNoSocials).toContain('href="/privacy"');
    expect(htmlNoSocials).toContain('href="/terms"');
    expect(htmlNoSocials).toContain('href="/contact"');
    expect(htmlNoSocials).not.toContain("Instagram");
    expect(htmlNoSocials).not.toContain("TikTok");

    const htmlWithSocials = renderToStaticMarkup(
      React.createElement(Footer, {
        categories: [watches],
        storeSettings: {
          ...DEFAULT_STORE_CONFIG,
          instagram_url: "https://instagram.com/auroardon",
          tiktok_url: "https://tiktok.com/@auroardon"
        }
      })
    );
    expect(htmlWithSocials).toContain("Instagram");
    expect(htmlWithSocials).toContain("TikTok");
  });
});

