import type { ProductReviewAggregate } from "@/lib/seo";

export const MAX_REVIEW_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Formats a verified customer's full name into a privacy-friendly display name
 * (e.g. "Amina Wanjiku" -> "Amina W.").
 */
export function formatReviewerDisplayName(fullName: string): string {
  const parts = fullName
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "Verified Buyer";
  if (parts.length === 1) return parts[0];
  const lastInitial = parts[parts.length - 1].charAt(0).toUpperCase();
  return `${parts[0]} ${lastInitial}.`;
}

/**
 * Computes aggregate rating strictly when at least 1 approved review exists.
 * Returns null when there are 0 reviews (so product cards & JSON-LD never show fake/0 ratings).
 */
export function computeApprovedReviewAggregate(
  reviews: ReadonlyArray<{ rating: number }>
): ProductReviewAggregate | null {
  if (!reviews.length) return null;
  let sum = 0;
  let validCount = 0;
  for (const review of reviews) {
    const val = Number(review.rating);
    if (Number.isFinite(val) && val >= 1 && val <= 5) {
      sum += val;
      validCount += 1;
    }
  }
  if (validCount === 0) return null;
  return {
    ratingValue: Math.round((sum / validCount) * 100) / 100,
    reviewCount: validCount
  };
}

export type DetectedImageFormat = "jpeg" | "png" | "webp";

/**
 * Validates actual file magic bytes — never trusts client Content-Type or filename extension.
 */
export function detectImageFormatFromBytes(
  buffer: Buffer
): DetectedImageFormat | null {
  if (buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "png";
  }

  // WebP: RIFF....WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "webp";
  }

  return null;
}

/**
 * Pure-JS fallback that strips EXIF, GPS, XMP, ICC, and comment metadata segments from JPEG/PNG/WebP buffers.
 */
export function stripMetadataSegmentsFallback(
  buffer: Buffer,
  format: DetectedImageFormat
): Buffer {
  if (format === "jpeg") {
    const chunks: Buffer[] = [buffer.subarray(0, 2)]; // SOI FF D8
    let offset = 2;
    while (offset + 4 <= buffer.length) {
      if (buffer[offset] !== 0xff) break;
      const marker = buffer[offset + 1];
      // Start of Scan (SOS FF DA) or EOI (FF D9): copy remainder verbatim
      if (marker === 0xda || marker === 0xd9) {
        chunks.push(buffer.subarray(offset));
        break;
      }
      // Standalone markers without length
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        chunks.push(buffer.subarray(offset, offset + 2));
        offset += 2;
        continue;
      }
      const segmentLength = buffer.readUInt16BE(offset + 2);
      if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
        break;
      }
      // Strip APP1..APP15 (0xE1..0xEF — EXIF, GPS, XMP, Adobe) and COM (0xFE)
      const isMetadataMarker =
        (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
      if (!isMetadataMarker) {
        chunks.push(buffer.subarray(offset, offset + 2 + segmentLength));
      }
      offset += 2 + segmentLength;
    }
    return Buffer.concat(chunks);
  }

  if (format === "png") {
    const chunks: Buffer[] = [buffer.subarray(0, 8)]; // PNG signature
    let offset = 8;
    const strippedTypes = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);
    while (offset + 12 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
      const totalChunkLen = 12 + length;
      if (offset + totalChunkLen > buffer.length) break;
      if (!strippedTypes.has(type)) {
        chunks.push(buffer.subarray(offset, offset + totalChunkLen));
      }
      offset += totalChunkLen;
      if (type === "IEND") break;
    }
    return Buffer.concat(chunks);
  }

  return buffer;
}

/**
 * Validates review photo bytes, enforces 5MB cap, strips ALL EXIF/GPS metadata,
 * and re-encodes via sharp to WebP (with pure-JS metadata stripping fallback).
 */
export async function sanitizeReviewPhoto(rawBuffer: Buffer): Promise<{
  buffer: Buffer;
  mimeType: string;
  extension: string;
}> {
  if (rawBuffer.length === 0) {
    throw new Error("Uploaded photo is empty.");
  }
  if (rawBuffer.length > MAX_REVIEW_PHOTO_BYTES) {
    throw new Error("Review photo must be 5 MB or smaller.");
  }

  const format = detectImageFormatFromBytes(rawBuffer);
  if (!format) {
    throw new Error("Only JPEG, PNG, or WebP images are supported.");
  }

  try {
    const sharpModule = await import("sharp");
    const sharpFn = sharpModule.default ?? sharpModule;
    const cleanWebp = await sharpFn(rawBuffer)
      .rotate() // auto-orient from EXIF before stripping all metadata
      .resize({
        width: 1400,
        height: 1400,
        fit: "inside",
        withoutEnlargement: true
      })
      .webp({ quality: 82 })
      .toBuffer();

    return {
      buffer: cleanWebp,
      mimeType: "image/webp",
      extension: "webp"
    };
  } catch {
    const stripped = stripMetadataSegmentsFallback(rawBuffer, format);
    const mimeType =
      format === "jpeg"
        ? "image/jpeg"
        : format === "png"
          ? "image/png"
          : "image/webp";
    const extension = format === "jpeg" ? "jpg" : format;
    return { buffer: stripped, mimeType, extension };
  }
}

