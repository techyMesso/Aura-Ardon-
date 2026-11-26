import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const revalidateCategoryCatalog = vi.fn();
const revalidateProductCatalog = vi.fn();
const categorySingle = vi.fn();
const categoryMaybeSingle = vi.fn();
const categoryInsert = vi.fn();
const categoryUpdate = vi.fn();
const productsUpdateEq = vi.fn();

vi.mock("@/lib/auth", () => ({ assertAdminRequest }));
vi.mock("@/lib/cache", () => ({
  revalidateCategoryCatalog,
  revalidateProductCatalog
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    from: (table: string) => {
      if (table === "products") {
        return {
          update: () => ({ eq: productsUpdateEq })
        };
      }
      return {
        insert: categoryInsert,
        update: categoryUpdate
      };
    }
  })
}));

describe("Admin category routes", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    assertAdminRequest.mockResolvedValue({ email: "admin@example.com" });
    categorySingle.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Watches",
        slug: "watches",
        description: null,
        image_url: null,
        parent_id: null,
        display_order: 1,
        created_at: "2026-01-01T00:00:00.000Z"
      },
      error: null
    });
    categoryMaybeSingle.mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Fine Watches",
        slug: "fine-watches",
        description: null,
        image_url: null,
        parent_id: null,
        display_order: 1,
        created_at: "2026-01-01T00:00:00.000Z"
      },
      error: null
    });
    categoryInsert.mockReturnValue({
      select: () => ({ single: categorySingle })
    });
    categoryUpdate.mockReturnValue({
      eq: () => ({
        select: () => ({ maybeSingle: categoryMaybeSingle })
      })
    });
    productsUpdateEq.mockResolvedValue({ error: null });
  });

  it("accepts null optional fields when creating a category", async () => {
    const { POST } = await import("@/app/api/admin/categories/route");

    const response = await POST(
      new Request("https://example.test/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Watches & Sets",
          slug: null,
          description: null,
          image_url: null,
          parent_id: null,
          display_order: 1
        })
      })
    );

    expect(response.status).toBe(201);
    expect(categoryInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Watches & Sets",
        slug: "watches-sets",
        description: null,
        image_url: null,
        parent_id: null
      })
    );
    expect(revalidateCategoryCatalog).toHaveBeenCalledOnce();
    expect(revalidateProductCatalog).toHaveBeenCalledOnce();
  });

  it("returns 401 on unauthorized category creation", async () => {
    assertAdminRequest.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    const { POST } = await import("@/app/api/admin/categories/route");

    const response = await POST(
      new Request("https://example.test/api/admin/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Watches", display_order: 0 })
      })
    );

    expect(response.status).toBe(401);
  });

  it("syncs denormalized products.category when renaming a category and rejects self-parenting", async () => {
    const { PATCH } = await import("@/app/api/admin/categories/[id]/route");
    const id = "11111111-1111-4111-8111-111111111111";

    const selfParentResponse = await PATCH(
      new Request(`https://example.test/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parent_id: id })
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(selfParentResponse.status).toBe(400);

    const renameResponse = await PATCH(
      new Request(`https://example.test/api/admin/categories/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Fine Watches", description: null })
      }),
      { params: Promise.resolve({ id }) }
    );

    expect(renameResponse.status).toBe(200);
    expect(productsUpdateEq).toHaveBeenCalledWith("category_id", id);
    expect(revalidateProductCatalog).toHaveBeenCalledOnce();
  });
});

