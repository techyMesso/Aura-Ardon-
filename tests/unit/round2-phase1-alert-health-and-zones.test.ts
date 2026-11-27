import { describe, expect, it } from "vitest";

import {
  ALERT_HEALTH_WARNING_TEXT,
  evaluateAlertHealth,
  getNairobiDateKey,
  isAlertHealthDismissedForToday
} from "@/lib/alert-health";
import {
  createDeliveryZoneSchema,
  DELIVERY_ZONE_MAX_FEE,
  normalizeDeliveryZoneName,
  reorderDeliveryZonesSchema,
  updateDeliveryZoneSchema
} from "@/lib/delivery-zones";

describe("Round 2 Phase 1 — Alert health evaluation & dismiss-for-today", () => {
  it("reports inactive when Resend is unset and 0 push devices are subscribed", () => {
    const status = evaluateAlertHealth({
      resendConfigured: false,
      vapidConfigured: true,
      activePushDevices: 0
    });
    expect(status.hasActiveChannel).toBe(false);
    expect(ALERT_HEALTH_WARNING_TEXT).toBe(
      "You won't be notified about new orders. Set up email alerts or enable push on your phone."
    );
  });

  it("reports active when Resend is configured even with 0 push devices", () => {
    const status = evaluateAlertHealth({
      resendConfigured: true,
      vapidConfigured: false,
      activePushDevices: 0
    });
    expect(status.hasActiveChannel).toBe(true);
  });

  it("reports active when VAPID is configured and at least 1 push device is subscribed", () => {
    const status = evaluateAlertHealth({
      resendConfigured: false,
      vapidConfigured: true,
      activePushDevices: 1
    });
    expect(status.hasActiveChannel).toBe(true);
  });

  it("reports inactive if VAPID is not configured even when stale push rows exist", () => {
    const status = evaluateAlertHealth({
      resendConfigured: false,
      vapidConfigured: false,
      activePushDevices: 2
    });
    expect(status.hasActiveChannel).toBe(false);
  });

  it("dismisses only for the matching Nairobi date and reappears the next day", () => {
    const today = getNairobiDateKey(new Date("2026-11-27T10:00:00.000Z"));
    expect(today).toBe("2026-11-27");
    expect(isAlertHealthDismissedForToday("2026-11-27", today)).toBe(true);
    expect(isAlertHealthDismissedForToday("2026-11-26", today)).toBe(false);
    expect(isAlertHealthDismissedForToday(null, today)).toBe(false);

    // 22:30 UTC is already 01:30 EAT the next calendar day in Africa/Nairobi
    const nextNairobiDay = getNairobiDateKey(new Date("2026-11-27T22:30:00.000Z"));
    expect(nextNairobiDay).toBe("2026-11-28");
    expect(isAlertHealthDismissedForToday("2026-11-27", nextNairobiDay)).toBe(false);
  });
});

describe("Round 2 Phase 1 — Delivery zone validation schemas", () => {
  it("trims zone names and accepts integer KES fees from 0 to 10,000", () => {
    const freeZone = createDeliveryZoneSchema.safeParse({
      name: "  CBD Pickup  ",
      fee: 0
    });
    expect(freeZone.success).toBe(true);
    if (freeZone.success) {
      expect(freeZone.data.name).toBe("CBD Pickup");
      expect(freeZone.data.fee).toBe(0);
      expect(freeZone.data.active).toBe(true);
      expect(freeZone.data.is_outside_nairobi).toBe(false);
    }

    const maxZone = createDeliveryZoneSchema.safeParse({
      name: "Remote Express",
      fee: DELIVERY_ZONE_MAX_FEE,
      is_outside_nairobi: true
    });
    expect(maxZone.success).toBe(true);
  });

  it("rejects blank names, decimals, negative fees, and fees above 10,000", () => {
    expect(
      createDeliveryZoneSchema.safeParse({ name: "   ", fee: 200 }).success
    ).toBe(false);
    expect(
      createDeliveryZoneSchema.safeParse({ name: "Gigiri", fee: -50 }).success
    ).toBe(false);
    expect(
      createDeliveryZoneSchema.safeParse({ name: "Gigiri", fee: 250.5 }).success
    ).toBe(false);
    expect(
      createDeliveryZoneSchema.safeParse({ name: "Gigiri", fee: 10_001 }).success
    ).toBe(false);
    expect(
      createDeliveryZoneSchema.safeParse({ name: "Gigiri", fee: "200" }).success
    ).toBe(false);
  });

  it("requires at least one field when updating a zone", () => {
    expect(updateDeliveryZoneSchema.safeParse({}).success).toBe(false);
    expect(updateDeliveryZoneSchema.safeParse({ active: false }).success).toBe(true);
    expect(updateDeliveryZoneSchema.safeParse({ fee: 450 }).success).toBe(true);
  });

  it("rejects invalid or duplicate UUIDs in reorder payloads", () => {
    const idA = "14630fbd-15db-40b7-824e-b0fd83086f3b";
    const idB = "51f69b61-5f6b-4223-8462-d3e6bbd0d892";

    expect(
      reorderDeliveryZonesSchema.safeParse({ orderedIds: [idA, idB] }).success
    ).toBe(true);
    expect(
      reorderDeliveryZonesSchema.safeParse({ orderedIds: [idA, idA] }).success
    ).toBe(false);
    expect(
      reorderDeliveryZonesSchema.safeParse({ orderedIds: ["not-a-uuid"] }).success
    ).toBe(false);
  });

  it("normalizes zone names consistently for case-insensitive uniqueness", () => {
    expect(normalizeDeliveryZoneName("  Westlands ")).toBe("westlands");
    expect(normalizeDeliveryZoneName("WESTLANDS")).toBe("westlands");
  });
});

