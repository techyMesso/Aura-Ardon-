import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as unknown as { React: typeof React }).React = React;

import {
  buildStorefrontFaqs,
  formatCutoffEatLabel,
  LEGAL_DRAFT_HTML_COMMENT,
  partitionDeliveryZones
} from "@/lib/policies";
import { DEFAULT_DELIVERY_ZONES, DEFAULT_STORE_CONFIG } from "@/lib/site";
import type { DeliveryZone, StoreSettings } from "@/lib/types";

const getStoreSettingsMock = vi.fn();
const listDeliveryZonesMock = vi.fn();

vi.mock("@/lib/data", () => ({
  getStoreSettings: (...args: unknown[]) => getStoreSettingsMock(...args),
  listDeliveryZones: (...args: unknown[]) => listDeliveryZonesMock(...args)
}));

const sampleSettings: StoreSettings = {
  id: true,
  ...DEFAULT_STORE_CONFIG,
  business_email: "hello@auroardon.co.ke",
  updated_at: "2026-05-01T10:00:00Z"
};

const sampleZones: DeliveryZone[] = DEFAULT_DELIVERY_ZONES.map((zone, idx) => ({
  id: `zone-${idx + 1}`,
  ...zone,
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-01T10:00:00Z"
}));

describe("Phase 13 policy and trust pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getStoreSettingsMock.mockResolvedValue(sampleSettings);
    listDeliveryZonesMock.mockResolvedValue(sampleZones);
  });

  it("formats EAT cutoff labels and partitions delivery zones cleanly", () => {
    expect(formatCutoffEatLabel("14:00")).toBe("2:00 pm EAT");
    expect(formatCutoffEatLabel("09:30")).toBe("9:30 am EAT");
    expect(formatCutoffEatLabel("12:00")).toBe("12:00 pm EAT");
    expect(formatCutoffEatLabel("invalid")).toBe("2:00 pm EAT");

    const partitioned = partitionDeliveryZones(sampleZones);
    expect(partitioned.nairobiZones.length).toBeGreaterThan(5);
    expect(partitioned.outsideNairobiZones).toHaveLength(1);
    expect(partitioned.minNairobiFee).toBe(150);
    expect(partitioned.maxNairobiFee).toBe(350);
  });

  it("renders dynamic delivery zone table from delivery_zones and removes contradictory fee-at-checkout wording", async () => {
    const { default: ShippingPage } = await import(
      "@/app/(storefront)/shipping/page"
    );
    const html = renderToStaticMarkup(await ShippingPage());

    expect(html).toContain("Westlands");
    expect(html).toContain("Karen");
    expect(html).toContain("Outside Nairobi (courier)");
    expect(html).toContain("2:00 pm EAT");
    expect(html).toContain("1–2 business days");
    expect(html).toContain("KES");
    expect(html).toContain("3,000");
    expect(html.toLowerCase()).not.toContain("confirmed at checkout");
    expect(html.toLowerCase()).not.toContain("fee is confirmed");
    expect(html).not.toContain("Ksh");
  });

  it("renders /privacy and /terms with visible DRAFT HTML comments and Kenya Data Protection Act 2019 coverage", async () => {
    const { default: PrivacyPage } = await import(
      "@/app/(storefront)/privacy/page"
    );
    const { default: TermsPage } = await import(
      "@/app/(storefront)/terms/page"
    );

    const privacyHtml = renderToStaticMarkup(await PrivacyPage());
    expect(privacyHtml).toContain(LEGAL_DRAFT_HTML_COMMENT);
    expect(privacyHtml).toContain("Data Protection Act, 2019");
    expect(privacyHtml).toContain("riders");
    expect(privacyHtml).toContain("WhatsApp");
    expect(privacyHtml).toContain("STOP");
    expect(privacyHtml).toContain("deletion");
    expect(privacyHtml).toContain("Office of the Data Protection Commissioner");

    const termsHtml = renderToStaticMarkup(await TermsPage());
    expect(termsHtml).toContain(LEGAL_DRAFT_HTML_COMMENT);
    expect(termsHtml).toContain("WhatsApp");
    expect(termsHtml).toContain("cash or M-Pesa");
    expect(termsHtml).toContain("48 hours");
    expect(termsHtml).toContain("Republic of Kenya");
  });

  it("renders /returns with exchange window, hygiene rules, 48-hour photo damage window, and refund options", async () => {
    const { default: ReturnsPage } = await import(
      "@/app/(storefront)/returns/page"
    );
    const html = renderToStaticMarkup(await ReturnsPage());

    expect(html).toContain("7 days");
    expect(html).toContain("original packaging");
    expect(html.toLowerCase()).toContain("earrings");
    expect(html.toLowerCase()).toContain("lip");
    expect(html.toLowerCase()).toContain("unopened");
    expect(html).toContain("48 hours");
    expect(html.toLowerCase()).toContain("photo");
    expect(html).toContain("M-Pesa reversal or store credit");
  });

  it("builds and renders /faq covering all 7 required topics plus FAQPage JSON-LD", async () => {
    const faqs = buildStorefrontFaqs(sampleSettings, sampleZones);
    expect(faqs).toHaveLength(7);

    const combinedText = faqs.map(f => `${f.question} ${f.answer}`).join(" ").toLowerCase();
    expect(combinedText).toContain("whatsapp");
    expect(combinedText).toContain("cash or via m-pesa on delivery");
    expect(combinedText).toContain("2:00 pm eat");
    expect(combinedText).toContain("track");
    expect(combinedText).toContain("exchanged");
    expect(combinedText).toContain("gift");
    expect(combinedText).toContain("discount code");

    const { default: FaqPage } = await import("@/app/(storefront)/faq/page");
    const html = renderToStaticMarkup(await FaqPage());
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain("How do discount codes work?");
    expect(html).not.toContain("Ksh");
  });

  it("keeps /about honest with TODO(owner) slots and zero invented stats or testimonials", async () => {
    const { default: AboutPage } = await import("@/app/(storefront)/about/page");
    const html = renderToStaticMarkup(await AboutPage());

    expect(html).toContain("TODO(owner)");
    expect(html).toContain("Auro Ardon");
    expect(html).toContain("Nairobi");
    expect(html).toContain("cash or M-Pesa");
    expect(html.toLowerCase()).not.toContain("5-star");
    expect(html.toLowerCase()).not.toContain("10,000+ happy customers");
  });
});

