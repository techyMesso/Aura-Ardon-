import { describe, expect, it } from "vitest";

import {
  buildAdminOrderSearchFilter,
  canCancelOrderStatus,
  canReturnOrderStatus,
  getAllowedOrderStatuses,
  getNextValidCanonicalStatuses,
  isPendingOrderOverdue24h,
  isValidOrderStatusTransition
} from "@/lib/admin-orders";

describe("admin order filters", () => {
  it("searches order numbers, customer names, and phone numbers", () => {
    expect(buildAdminOrderSearchFilter("Amina 0700")).toBe(
      'order_number.ilike."%Amina 0700%",customer_name.ilike."%Amina 0700%",customer_phone.ilike."%Amina 0700%"'
    );
  });

  it("adds an exact order ID match for UUID searches", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";

    expect(buildAdminOrderSearchFilter(id)).toContain(`id.eq.${id}`);
  });

  it("escapes LIKE wildcards in customer searches", () => {
    expect(buildAdminOrderSearchFilter("A_100%")).toContain('"%A\\_100\\%%"');
  });
});

describe("admin order status transitions", () => {
  it("only permits forward fulfillment transitions or cancellation", () => {
    expect(getAllowedOrderStatuses("CONFIRMED")).toEqual([
      "CONFIRMED",
      "OUT_FOR_DELIVERY",
      "CANCELLED"
    ]);
    expect(isValidOrderStatusTransition("CONFIRMED", "OUT_FOR_DELIVERY")).toBe(true);
    expect(isValidOrderStatusTransition("DELIVERED", "CONFIRMED")).toBe(false);
  });

  it("enforces canonical next-status, cancel, and return eligibility rules", () => {
    expect(getNextValidCanonicalStatuses("pending")).toEqual(["confirmed"]);
    expect(getNextValidCanonicalStatuses("confirmed")).toEqual(["dispatched"]);
    expect(getNextValidCanonicalStatuses("dispatched")).toEqual(["delivered"]);
    expect(getNextValidCanonicalStatuses("delivered")).toEqual([]);
    expect(getNextValidCanonicalStatuses("cancelled")).toEqual([]);
    expect(getNextValidCanonicalStatuses("returned")).toEqual([]);

    expect(canCancelOrderStatus("pending")).toBe(true);
    expect(canCancelOrderStatus("confirmed")).toBe(true);
    expect(canCancelOrderStatus("dispatched")).toBe(true);
    expect(canCancelOrderStatus("delivered")).toBe(false);
    expect(canCancelOrderStatus("returned")).toBe(false);

    expect(canReturnOrderStatus("delivered")).toBe(true);
    expect(canReturnOrderStatus("returned")).toBe(true);
    expect(canReturnOrderStatus("dispatched")).toBe(false);
    expect(canReturnOrderStatus("cancelled")).toBe(false);
  });

  it("highlights pending orders older than 24 hours", () => {
    const now = Date.parse("2026-06-10T12:00:00.000Z");
    expect(
      isPendingOrderOverdue24h(
        {
          status: "pending",
          order_status: "PENDING_CONFIRMATION",
          created_at: "2026-06-09T11:59:00.000Z"
        },
        now
      )
    ).toBe(true);

    expect(
      isPendingOrderOverdue24h(
        {
          status: "pending",
          order_status: "PENDING_CONFIRMATION",
          created_at: "2026-06-09T12:30:00.000Z"
        },
        now
      )
    ).toBe(false);

    expect(
      isPendingOrderOverdue24h(
        {
          status: "confirmed",
          order_status: "CONFIRMED",
          created_at: "2026-06-01T00:00:00.000Z"
        },
        now
      )
    ).toBe(false);
  });
});
