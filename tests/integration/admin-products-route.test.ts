import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const revalidateProductCatalog = vi.fn();
const categoryMaybeSingle = vi.fn();
const productSingle = vi.fn();
const productInsert = vi.fn();

vi.mock("@/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    assertAdminRequest
  };
});
vi.mock("@/lib/cache", () => ({ revalidateProductCatalog }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "categories") {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: categoryMaybeSingle })
          })
        };
      }
      return { insert: productInsert };
    }
  })
}));

function createProductRequest(
  categoryId = "11111111-1111-4111-8111-111111111111",
  overrides: Record<string, unknown> = {}
) {
  return new Request("https://example.test/api/admin/products", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Sculptural cuff",
      description: "A polished cuff designed for a confident finishing touch.",
      price: 3200,
      stock_quantity: 4,
      category_id: categoryId,
      material: "Gold plated steel",
      images: ["https://example.test/cuff.jpg"],
      image_alts: ["Sculptural gold-plated steel cuff bracelet"],
      status: "active",
      active: true,
      is_featured: true,
      ...overrides
    })
  });
}

describe("POST /api/admin/products", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({
      id: "owner-1",
      email: "admin@example.com",
      app_metadata: { role: "owner" }
    });
    categoryMaybeSingle.mockResolvedValue({
      data: { id: "11111111-1111-4111-8111-111111111111", name: "Bracelets" },
      error: null
    });
    productSingle.mockResolvedValue({ data: { id: "product-1" }, error: null });
    productInsert.mockReturnValue({
      select: () => ({ single: productSingle })
    });
  });

  it("validates the selected category and saves both its ID and display name", async () => {
    const { POST } = await import("@/app/api/admin/products/route");

    const response = await POST(createProductRequest());

    expect(response.status).toBe(201);
    expect(productInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        category_id: "11111111-1111-4111-8111-111111111111",
        category: "Bracelets",
        image_alts: ["Sculptural gold-plated steel cuff bracelet"],
        status: "active"
      })
    );
    expect(revalidateProductCatalog).toHaveBeenCalledOnce();
  });

  it("rejects an invalid category ID before writing a product", async () => {
    const { POST } = await import("@/app/api/admin/products/route");

    const response = await POST(createProductRequest("not-a-uuid"));

    expect(response.status).toBe(400);
    expect(productInsert).not.toHaveBeenCalled();
  });

  it("requires descriptive alt text for every uploaded image", async () => {
    const { POST } = await import("@/app/api/admin/products/route");

    const response = await POST(
      createProductRequest("11111111-1111-4111-8111-111111111111", {
        image_alts: [""]
      })
    );

    expect(response.status).toBe(400);
    expect(productInsert).not.toHaveBeenCalled();
  });
});
