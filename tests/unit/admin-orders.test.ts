import { describe, expect, it } from "vitest";

import {
  buildAdminOrderSearchFilter,
  getAllowedOrderStatuses,
  isValidOrderStatusTransition
} from "@/lib/admin-orders";

describe("admin order filters", () => {
  it("searches customer names and phone numbers", () => {
    expect(buildAdminOrderSearchFilter("Amina 0700")).toBe(
      'customer_name.ilike."%Amina 0700%",customer_phone.ilike."%Amina 0700%"'
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
});
