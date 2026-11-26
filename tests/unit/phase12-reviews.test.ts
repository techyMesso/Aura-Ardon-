import { describe, expect, it } from "vitest";

import {
  computeApprovedReviewAggregate,
  detectImageFormatFromBytes,
  formatReviewerDisplayName,
  MAX_REVIEW_PHOTO_BYTES,
  sanitizeReviewPhoto,
  stripMetadataSegmentsFallback
} from "@/lib/reviews";
import { buildProductJsonLd } from "@/lib/seo";
import type { Product } from "@/lib/types";

const SAMPLE_PRODUCT: Product = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Auro Classic Gold Watch",
  slug: "auro-classic-gold-watch",
  description: "Brushed gold-tone timepiece built for everyday Nairobi wear.",
  category: "Watches",
  category_id: "22222222-2222-4222-8222-222222222222",
  price: "4500.00",
  stock_quantity: 5,
  material: "Stainless steel",
  images: ["https://scukquqkdivnodefqggf.supabase.co/storage/v1/object/public/products/watch.webp"],
  is_featured: true,
  active: true,
  status: "active",
  created_at: "2026-05-01T10:00:00Z"
};

// Minimal valid 1x1 red PNG
const VALID_1X1_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

function buildPngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); // synthetic CRC ok for pure-JS chunk parser tests
  return Buffer.concat([length, typeBuf, data, crc]);
}

describe("Phase 12 real verified reviews helpers", () => {
  it("formats customer names into privacy-friendly reviewer display names", () => {
    expect(formatReviewerDisplayName("Amina Wanjiku")).toBe("Amina W.");
    expect(formatReviewerDisplayName("  Brian   Otieno  Ochieng ")).toBe("Brian O.");
    expect(formatReviewerDisplayName("Faith")).toBe("Faith");
    expect(formatReviewerDisplayName("   ")).toBe("Verified Buyer");
  });

  it("computes approved review aggregates and returns null when there are 0 reviews", () => {
    expect(computeApprovedReviewAggregate([])).toBeNull();
    expect(computeApprovedReviewAggregate([{ rating: 0 }, { rating: 6 }])).toBeNull();

    expect(
      computeApprovedReviewAggregate([{ rating: 5 }, { rating: 4 }, { rating: 5 }])
    ).toEqual({
      ratingValue: 4.67,
      reviewCount: 3
    });
  });

  it("includes aggregateRating in Product JSON-LD ONLY when at least one approved review exists", () => {
    const withoutReviews = buildProductJsonLd({
      product: SAMPLE_PRODUCT,
      category: null,
      productUrl: "https://aura-ardon.vercel.app/p/auro-classic-gold-watch",
      reviewStats: null
    });
    expect("aggregateRating" in withoutReviews).toBe(false);

    const withZeroReviews = buildProductJsonLd({
      product: SAMPLE_PRODUCT,
      category: null,
      productUrl: "https://aura-ardon.vercel.app/p/auro-classic-gold-watch",
      reviewStats: { ratingValue: 0, reviewCount: 0 }
    });
    expect("aggregateRating" in withZeroReviews).toBe(false);

    const withApprovedReviews = buildProductJsonLd({
      product: SAMPLE_PRODUCT,
      category: null,
      productUrl: "https://aura-ardon.vercel.app/p/auro-classic-gold-watch",
      reviewStats: computeApprovedReviewAggregate([{ rating: 5 }, { rating: 4 }])
    });
    expect(withApprovedReviews.aggregateRating).toEqual({
      "@type": "AggregateRating",
      ratingValue: 4.5,
      reviewCount: 2
    });
  });

  it("detects real image magic bytes and rejects disguised files", () => {
    const jpegHeader = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01
    ]);
    const pngBuf = Buffer.from(VALID_1X1_PNG_BASE64, "base64");
    const webpHeader = Buffer.concat([
      Buffer.from("RIFF", "ascii"),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from("WEBP", "ascii"),
      Buffer.from("VP8 ", "ascii")
    ]);
    const fakeHtml = Buffer.from("<html><script>alert(1)</script></html>", "utf8");

    expect(detectImageFormatFromBytes(jpegHeader)).toBe("jpeg");
    expect(detectImageFormatFromBytes(pngBuf)).toBe("png");
    expect(detectImageFormatFromBytes(webpHeader)).toBe("webp");
    expect(detectImageFormatFromBytes(fakeHtml)).toBeNull();
  });

  it("strips EXIF/GPS metadata segments in pure-JS fallback for JPEG and PNG", () => {
    // Synthetic JPEG with APP1 EXIF containing GPS marker + SOS + EOI
    const exifPayload = Buffer.from("Exif\0\0GPS_NAIROBI_SECRET", "ascii");
    const app1Length = Buffer.alloc(2);
    app1Length.writeUInt16BE(exifPayload.length + 2, 0);
    const jpegWithExif = Buffer.concat([
      Buffer.from([0xff, 0xd8]), // SOI
      Buffer.from([0xff, 0xe1]), // APP1
      app1Length,
      exifPayload,
      Buffer.from([0xff, 0xda, 0x00, 0x08, 0x01, 0x02, 0xff, 0xd9]) // SOS + EOI
    ]);

    const cleanedJpeg = stripMetadataSegmentsFallback(jpegWithExif, "jpeg");
    expect(cleanedJpeg.includes(Buffer.from("GPS_NAIROBI_SECRET", "ascii"))).toBe(false);
    expect(cleanedJpeg[0]).toBe(0xff);
    expect(cleanedJpeg[1]).toBe(0xd8);

    // Synthetic PNG with injected tEXt & eXIf chunks
    const basePng = Buffer.from(VALID_1X1_PNG_BASE64, "base64");
    const textChunk = buildPngChunk("tEXt", Buffer.from("GPS\0-1.2921,36.8219", "ascii"));
    const exifChunk = buildPngChunk("eXIf", Buffer.from("SECRET_CAMERA_SERIAL", "ascii"));
    // Insert right after PNG signature (8 bytes)
    const pngWithMeta = Buffer.concat([
      basePng.subarray(0, 8),
      textChunk,
      exifChunk,
      basePng.subarray(8)
    ]);

    const cleanedPng = stripMetadataSegmentsFallback(pngWithMeta, "png");
    expect(cleanedPng.includes(Buffer.from("GPS", "ascii"))).toBe(false);
    expect(cleanedPng.includes(Buffer.from("SECRET_CAMERA_SERIAL", "ascii"))).toBe(false);
  });

  it("sanitizes valid review photos and rejects empty, oversized, or non-image uploads", async () => {
    await expect(sanitizeReviewPhoto(Buffer.alloc(0))).rejects.toThrow("empty");
    await expect(
      sanitizeReviewPhoto(Buffer.alloc(MAX_REVIEW_PHOTO_BYTES + 1))
    ).rejects.toThrow("5 MB");
    await expect(
      sanitizeReviewPhoto(Buffer.from("not an image file at all", "utf8"))
    ).rejects.toThrow("JPEG, PNG, or WebP");

    const pngBuf = Buffer.from(VALID_1X1_PNG_BASE64, "base64");
    const sanitized = await sanitizeReviewPhoto(pngBuf);
    expect(sanitized.buffer.length).toBeGreaterThan(0);
    expect(["image/webp", "image/png"]).toContain(sanitized.mimeType);
    expect(["webp", "png"]).toContain(sanitized.extension);
  });
});

