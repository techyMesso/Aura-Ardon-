import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const textSearchMock = vi.fn();
const orMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createPublicServerSupabaseClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          textSearch: (...args: unknown[]) => ({
            limit: () => textSearchMock(...args)
          }),
          or: (...args: unknown[]) => ({
            limit: () => orMock(...args)
          })
        })
      })
    })
  })
}));

describe("GET /api/search", () => {
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://scukquqkdivnodefqggf.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon-key";
  });

  afterEach(() => {
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    if (prevAnon === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnon;
  });

  it("returns empty results for queries shorter than 2 characters without querying DB", async () => {
    const { GET } = await import("@/app/api/search/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/search?q=w"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results).toEqual([]);
    expect(textSearchMock).not.toHaveBeenCalled();
  });

  it("merges full-text and ilike matches and ranks title matches ahead of description matches", async () => {
    const descMatch = {
      id: "prod-2",
      title: "Honey Glow Balm",
      slug: "honey-glow-balm",
      description: "Great gift to pair with a watch.",
      category: "Lip Care",
      category_id: "c2",
      price: "350",
      stock_quantity: 5,
      material: "Shea butter",
      images: [],
      is_featured: false,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z"
    };
    const titleMatch = {
      id: "prod-1",
      title: "Nairobi Classic Watch",
      slug: "nairobi-classic-watch",
      description: "Slim timepiece.",
      category: "Watches",
      category_id: "c1",
      price: "1850",
      stock_quantity: 5,
      material: "Stainless steel",
      images: [],
      is_featured: true,
      active: true,
      created_at: "2026-01-01T00:00:00.000Z"
    };

    textSearchMock.mockResolvedValue({ data: [descMatch], error: null });
    orMock.mockResolvedValue({ data: [descMatch, titleMatch], error: null });

    const { GET } = await import("@/app/api/search/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/search?q=watch"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.results.map((p: { id: string }) => p.id)).toEqual([
      "prod-1",
      "prod-2"
    ]);
  });
});

