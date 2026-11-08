import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidateProductCatalog = vi.fn();
const revalidateCategoryCatalog = vi.fn();

vi.mock("@/lib/cache", () => ({
  revalidateProductCatalog,
  revalidateCategoryCatalog
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

async function loadRoute() {
  return import("@/app/api/revalidate/route");
}

describe("POST /api/revalidate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.REVALIDATE_SECRET = "test-revalidate-secret";
  });

  it("rejects requests with an invalid secret", async () => {
    const { POST } = await loadRoute();
    const request = new NextRequest("https://example.test/api/revalidate", {
      method: "POST",
      headers: {
        "x-revalidate-secret": "wrong-secret"
      }
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(revalidateProductCatalog).not.toHaveBeenCalled();
    expect(revalidateCategoryCatalog).not.toHaveBeenCalled();
  });

  it("revalidates product and category tags on Supabase webhook payload", async () => {
    const { POST } = await loadRoute();
    const request = new NextRequest("https://example.test/api/revalidate", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-revalidate-secret": "test-revalidate-secret"
      },
      body: JSON.stringify({
        type: "UPDATE",
        table: "categories",
        schema: "public"
      })
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.revalidated).toBe(true);
    expect(revalidateProductCatalog).toHaveBeenCalledTimes(1);
    expect(revalidateCategoryCatalog).toHaveBeenCalledTimes(1);
  });
});
