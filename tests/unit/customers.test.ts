import { describe, expect, it } from "vitest";

import {
  buildCustomerWhatsAppUrl,
  buildOptedInCustomersCsv,
  isEligibleForBroadcastExport,
  normalizeCustomerTags
} from "@/lib/customers";
import type { Customer } from "@/lib/types";

function makeCustomer(overrides: Partial<Customer> = {}): Customer {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    phone: "254712345678",
    full_name: "Wanjiku Mwangi",
    names_used: ["Wanjiku Mwangi"],
    addresses_used: ["Westlands, Ring Road"],
    zones_used: ["Westlands"],
    last_zone: "Westlands",
    last_address: "Westlands, Ring Road",
    marketing_opt_in: true,
    marketing_opt_in_at: "2026-11-20T09:30:00.000Z",
    notes: "Prefers morning deliveries",
    tags: ["VIP", "Repeat"],
    is_flagged: false,
    is_blocked: false,
    order_count: 4,
    cancelled_count: 1,
    lifetime_value: 14500,
    last_order_at: "2026-11-25T10:00:00.000Z",
    anonymized_at: null,
    created_at: "2026-10-01T08:00:00.000Z",
    updated_at: "2026-11-25T10:00:00.000Z",
    ...overrides
  };
}

describe("Phase 7 customer CRM helpers", () => {
  it("normalizes, deduplicates case-insensitively, trims, and caps customer tags", () => {
    expect(
      normalizeCustomerTags([
        "  VIP ",
        "vip",
        "",
        "   ",
        "Gift buyer",
        "gift buyer",
        "A".repeat(40)
      ])
    ).toEqual(["VIP", "Gift buyer", "A".repeat(32)]);

    const many = Array.from({ length: 25 }, (_, i) => `Tag-${i}`);
    expect(normalizeCustomerTags(many)).toHaveLength(20);
  });

  it("enforces strict broadcast export eligibility (opted-in, not blocked, not anonymized)", () => {
    expect(isEligibleForBroadcastExport(makeCustomer())).toBe(true);
    expect(
      isEligibleForBroadcastExport(makeCustomer({ marketing_opt_in: false }))
    ).toBe(false);
    expect(isEligibleForBroadcastExport(makeCustomer({ is_blocked: true }))).toBe(
      false
    );
    expect(
      isEligibleForBroadcastExport(
        makeCustomer({ anonymized_at: "2026-11-26T12:00:00.000Z" })
      )
    ).toBe(false);
  });

  it("builds WhatsApp links for active customers and returns null for anonymized customers", () => {
    const activeUrl = buildCustomerWhatsAppUrl(makeCustomer());
    expect(activeUrl).toContain("https://wa.me/254712345678?text=");
    expect(activeUrl).toContain("Wanjiku");

    expect(
      buildCustomerWhatsAppUrl(
        makeCustomer({
          phone: "ANON-111111111111",
          full_name: "Deleted Customer",
          anonymized_at: "2026-11-26T12:00:00.000Z"
        })
      )
    ).toBeNull();
  });

  it("exports CSV strictly containing opted-in, non-blocked, non-anonymized customers", () => {
    const csv = buildOptedInCustomersCsv([
      makeCustomer({
        phone: "254712345678",
        full_name: 'Amina, "VIP" Hassan',
        last_zone: "Kilimani",
        tags: ["VIP", "Gift buyer"],
        order_count: 3,
        lifetime_value: 9200
      }),
      makeCustomer({
        id: "22222222-2222-4222-8222-222222222222",
        phone: "254700000001",
        full_name: "Not Opted In",
        marketing_opt_in: false
      }),
      makeCustomer({
        id: "33333333-3333-4333-8333-333333333333",
        phone: "254700000002",
        full_name: "Blocked Customer",
        marketing_opt_in: true,
        is_blocked: true
      }),
      makeCustomer({
        id: "44444444-4444-4444-8444-444444444444",
        phone: "ANON-444444444444",
        full_name: "Deleted Customer",
        marketing_opt_in: true,
        anonymized_at: "2026-11-26T12:00:00.000Z"
      })
    ]);

    const lines = csv.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("Phone (254...)");
    expect(lines[0]).toContain("Lifetime Value (KES)");
    expect(lines[1]).toContain("254712345678");
    expect(lines[1]).toContain('"Amina, ""VIP"" Hassan"');
    expect(lines[1]).toContain("VIP; Gift buyer");
    expect(lines[1]).toContain("9200.00");
    expect(csv).not.toContain("Not Opted In");
    expect(csv).not.toContain("Blocked Customer");
    expect(csv).not.toContain("Deleted Customer");
  });
});

