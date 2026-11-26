import { beforeEach, describe, expect, it, vi } from "vitest";

const assertAdminRequest = vi.fn();
const checkRateLimitMock = vi.fn();
const verifyDeliveredOrderForReviewMock = vi.fn();
const listAdminReviewsMock = vi.fn();
const revalidateReviewsMock = vi.fn();
const rpcMock = vi.fn();
const fromMock = vi.fn();
const storageUploadMock = vi.fn();
const storageRemoveMock = vi.fn();
const storageGetPublicUrlMock = vi.fn();

vi.mock("@/lib/auth", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    assertAdminRequest
  };
});

vi.mock("@/lib/rate-limit", () => ({
  getClientIp: () => "196.201.214.10",
  checkRateLimit: (...args: unknown[]) => checkRateLimitMock(...args)
}));

vi.mock("@/lib/data", () => ({
  verifyDeliveredOrderForReview: (...args: unknown[]) =>
    verifyDeliveredOrderForReviewMock(...args),
  listAdminReviews: (...args: unknown[]) => listAdminReviewsMock(...args)
}));

vi.mock("@/lib/cache", () => ({
  revalidateReviews: (...args: unknown[]) => revalidateReviewsMock(...args)
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminSupabaseClient: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: (table: string) => fromMock(table),
    storage: {
      from: () => ({
        upload: (...args: unknown[]) => storageUploadMock(...args),
        remove: (...args: unknown[]) => storageRemoveMock(...args),
        getPublicUrl: (...args: unknown[]) => storageGetPublicUrlMock(...args)
      })
    }
  })
}));

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const REVIEW_ID = "22222222-2222-4222-8222-222222222222";
const VALID_1X1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Phase 12 verified review submission & admin moderation routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    checkRateLimitMock.mockResolvedValue({
      ok: true,
      limit: 10,
      remaining: 9,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 0
    });
    storageUploadMock.mockResolvedValue({ error: null });
    storageRemoveMock.mockResolvedValue({ error: null });
    storageGetPublicUrlMock.mockReturnValue({
      data: {
        publicUrl:
          "https://scukquqkdivnodefqggf.supabase.co/storage/v1/object/public/review-photos/reviews/test.webp"
      }
    });
  });

  it("verifies delivered orders and rejects non-delivered or unknown orders via POST /api/reviews/verify-order", async () => {
    const { POST } = await import("@/app/api/reviews/verify-order/route");

    // 1. Not delivered -> 409
    verifyDeliveredOrderForReviewMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_delivered",
      message: "Reviews can only be submitted after your order has been delivered."
    });
    const notDeliveredRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/reviews/verify-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: "AA-7F3K2", phone: "0712345678" })
      })
    );
    expect(notDeliveredRes.status).toBe(409);

    // 2. Delivered order -> 200 with items (never exposing matchedPhone)
    verifyDeliveredOrderForReviewMock.mockResolvedValueOnce({
      ok: true,
      orderId: "order-1",
      orderNumber: "AA-7F3K2",
      matchedPhone: "+254712345678",
      reviewerDisplayName: "Amina W.",
      items: [
        {
          productId: PRODUCT_ID,
          title: "Auro Gold Watch",
          variantName: null,
          alreadyReviewed: false
        }
      ]
    });
    const okRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/reviews/verify-order", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderNumber: "aa-7f3k2", phone: "0712 345 678" })
      })
    );
    expect(okRes.status).toBe(200);
    const json = await okRes.json();
    expect(json.ok).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(json.matchedPhone).toBeUndefined();
  });

  it("enforces delivered-order checks, blocks honeypot bots, sanitizes photos, and inserts pending reviews via POST /api/reviews", async () => {
    const { POST } = await import("@/app/api/reviews/route");

    // 1. Honeypot filled -> rejected immediately without hitting verification or storage
    const botRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderNumber: "AA-7F3K2",
          phone: "0712345678",
          productId: PRODUCT_ID,
          rating: 5,
          comment: "Spam review from a bot",
          website: "https://spam.example"
        })
      })
    );
    expect(botRes.status).toBe(400);
    expect(verifyDeliveredOrderForReviewMock).not.toHaveBeenCalled();

    // 2. Non-delivered order with photo -> rejected BEFORE uploading photo to Storage
    verifyDeliveredOrderForReviewMock.mockResolvedValueOnce({
      ok: false,
      reason: "not_delivered",
      message: "Reviews can only be submitted after your order has been delivered."
    });
    const formNonDelivered = new FormData();
    formNonDelivered.set("orderNumber", "AA-7F3K2");
    formNonDelivered.set("phone", "0712345678");
    formNonDelivered.set("productId", PRODUCT_ID);
    formNonDelivered.set("rating", "5");
    formNonDelivered.set("comment", "Loved the quality and delivery!");
    formNonDelivered.set(
      "photo",
      new File([Buffer.from(VALID_1X1_PNG_BASE64, "base64")], "watch.png", {
        type: "image/png"
      })
    );

    const nonDeliveredRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/reviews", {
        method: "POST",
        body: formNonDelivered
      })
    );
    expect(nonDeliveredRes.status).toBe(409);
    expect(storageUploadMock).not.toHaveBeenCalled();

    // 3. Valid delivered order with PNG photo -> sanitizes, uploads, calls submit_verified_review RPC, returns 201 pending
    verifyDeliveredOrderForReviewMock.mockResolvedValueOnce({
      ok: true,
      orderId: "order-1",
      orderNumber: "AA-7F3K2",
      matchedPhone: "+254712345678",
      reviewerDisplayName: "Amina W.",
      items: [
        {
          productId: PRODUCT_ID,
          title: "Auro Gold Watch",
          variantName: null,
          alreadyReviewed: false
        }
      ]
    });
    rpcMock.mockResolvedValueOnce({
      data: {
        id: REVIEW_ID,
        status: "pending",
        rating: 5,
        created_at: "2026-05-10T12:00:00Z"
      },
      error: null
    });

    const formValid = new FormData();
    formValid.set("orderNumber", "AA-7F3K2");
    formValid.set("phone", "0712345678");
    formValid.set("productId", PRODUCT_ID);
    formValid.set("rating", "5");
    formValid.set("comment", "Beautiful craftsmanship and prompt rider delivery in Kilimani.");
    formValid.set(
      "photo",
      new File([Buffer.from(VALID_1X1_PNG_BASE64, "base64")], "watch.png", {
        type: "image/png"
      })
    );

    const createdRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/reviews", {
        method: "POST",
        body: formValid
      })
    );
    expect(createdRes.status).toBe(201);
    const createdJson = await createdRes.json();
    expect(createdJson.ok).toBe(true);
    expect(createdJson.review.status).toBe("pending");
    expect(storageUploadMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "submit_verified_review",
      expect.objectContaining({
        p_order_number: "AA-7F3K2",
        p_phone: "+254712345678",
        p_product_id: PRODUCT_ID,
        p_rating: 5,
        p_photo_url: expect.stringContaining("/review-photos/")
      })
    );

    // 4. If RPC fails after photo upload, cleans up orphaned Storage object
    verifyDeliveredOrderForReviewMock.mockResolvedValueOnce({
      ok: true,
      orderId: "order-1",
      orderNumber: "AA-7F3K2",
      matchedPhone: "+254712345678",
      reviewerDisplayName: "Amina W.",
      items: [
        {
          productId: PRODUCT_ID,
          title: "Auro Gold Watch",
          variantName: null,
          alreadyReviewed: false
        }
      ]
    });
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "You have already submitted a review for this item on this order." }
    });

    const formFail = new FormData();
    formFail.set("orderNumber", "AA-7F3K2");
    formFail.set("phone", "0712345678");
    formFail.set("productId", PRODUCT_ID);
    formFail.set("rating", "4");
    formFail.set("comment", "Duplicate race condition check.");
    formFail.set(
      "photo",
      new File([Buffer.from(VALID_1X1_PNG_BASE64, "base64")], "watch.png", {
        type: "image/png"
      })
    );

    const dupRes = await POST(
      new Request("https://aura-ardon.vercel.app/api/reviews", {
        method: "POST",
        body: formFail
      })
    );
    expect(dupRes.status).toBe(409);
    expect(storageRemoveMock).toHaveBeenCalledTimes(1);
  });

  it("authenticates admin moderation GET/PATCH routes and revalidates reviews cache on approval", async () => {
    const { GET } = await import("@/app/api/admin/reviews/route");
    const { PATCH } = await import("@/app/api/admin/reviews/[id]/route");

    // 1. Unauthenticated -> 401
    assertAdminRequest.mockRejectedValueOnce(new Error("UNAUTHORIZED"));
    const unauthRes = await GET(
      new Request("https://aura-ardon.vercel.app/api/admin/reviews?status=pending")
    );
    expect(unauthRes.status).toBe(401);

    // 2. Authenticated GET -> returns queue & counts
    assertAdminRequest.mockResolvedValueOnce({
      id: "owner-1",
      email: "aura.ardoncompany@gmail.com"
    });
    listAdminReviewsMock.mockResolvedValueOnce({
      reviews: [],
      counts: { pending: 0, approved: 0, rejected: 0, total: 0 }
    });
    const listRes = await GET(
      new Request("https://aura-ardon.vercel.app/api/admin/reviews?status=pending")
    );
    expect(listRes.status).toBe(200);
    expect(listAdminReviewsMock).toHaveBeenCalledWith("pending");

    // 3. Authenticated PATCH approve -> updates status, stamps moderator, calls revalidateReviews()
    assertAdminRequest.mockResolvedValueOnce({
      id: "owner-1",
      email: "aura.ardoncompany@gmail.com"
    });
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: {
        id: REVIEW_ID,
        product_id: PRODUCT_ID,
        status: "approved",
        moderated_by: "aura.ardoncompany@gmail.com"
      },
      error: null
    });
    const selectMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ update: updateMock });

    const approveRes = await PATCH(
      new Request(`https://aura-ardon.vercel.app/api/admin/reviews/${REVIEW_ID}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          status: "approved",
          moderationNote: "Verified buyer photo looks great"
        })
      }),
      { params: Promise.resolve({ id: REVIEW_ID }) }
    );
    expect(approveRes.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        moderated_by: "aura.ardoncompany@gmail.com",
        moderation_note: "Verified buyer photo looks great"
      })
    );
    expect(revalidateReviewsMock).toHaveBeenCalledTimes(1);
  });
});

