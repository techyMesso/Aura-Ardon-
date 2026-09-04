import { describe, expect, it } from "vitest";

import { validateCheckoutStock } from "@/lib/checkout-stock";

describe("validateCheckoutStock", () => {
  it("groups duplicate items and computes subtotal from server-side prices", () => {
    const result = validateCheckoutStock(
      [
        {
          id: "11111111-1111-1111-1111-111111111111",
          title: "Bracelet",
          price: 1200,
          stockQuantity: 5,
          active: true
        },
        {
          id: "22222222-2222-2222-2222-222222222222",
          title: "Earrings",
          price: 800,
          stockQuantity: 2,
          active: true
        }
      ],
      [
        { productId: "11111111-1111-1111-1111-111111111111", quantity: 1 },
        { productId: "11111111-1111-1111-1111-111111111111", quantity: 2 },
        { productId: "22222222-2222-2222-2222-222222222222", quantity: 1 }
      ]
    );

    expect(result.subtotal).toBe(4400);
    expect(result.itemSummary).toEqual([
      {
        productId: "11111111-1111-1111-1111-111111111111",
        title: "Bracelet",
        quantity: 3,
        unitPrice: 1200
      },
      {
        productId: "22222222-2222-2222-2222-222222222222",
        title: "Earrings",
        quantity: 1,
        unitPrice: 800
      }
    ]);
  });

  it("rejects out-of-stock items", () => {
    expect(() =>
      validateCheckoutStock(
        [
          {
            id: "11111111-1111-1111-1111-111111111111",
            title: "Bracelet",
            price: 1200,
            stockQuantity: 1,
            active: true
          }
        ],
        [{ productId: "11111111-1111-1111-1111-111111111111", quantity: 2 }]
      )
    ).toThrow("One or more items are not available in the requested quantity.");
  });
});
