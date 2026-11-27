import { formatProductTitle } from "@/lib/catalog";
import type { Product } from "@/lib/types";

export const MAX_IMAGE_DIMENSION = 2000;
export const MIN_RECOMMENDED_IMAGE_DIMENSION = 800;
export const MAX_SQUARE_ASPECT_RATIO = 1.25;

export interface ImageDimensionAnalysis {
  width: number;
  height: number;
  aspectRatio: number;
  isTooSmall: boolean;
  isNotSquare: boolean;
  warnings: string[];
}

export function analyzeImageDimensions(
  width: number,
  height: number
): ImageDimensionAnalysis {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const aspectRatio = Math.max(safeW / safeH, safeH / safeW);
  const isTooSmall =
    Math.min(safeW, safeH) < MIN_RECOMMENDED_IMAGE_DIMENSION;
  const isNotSquare = aspectRatio > MAX_SQUARE_ASPECT_RATIO;

  const warnings: string[] = [];
  if (isTooSmall) {
    warnings.push(
      `Under ${MIN_RECOMMENDED_IMAGE_DIMENSION} px (${safeW}×${safeH}) — use at least 800×800 px for crisp product zoom.`
    );
  }
  if (isNotSquare) {
    warnings.push(
      `Not roughly square (${safeW}×${safeH}) — storefront cards crop to 1:1 square.`
    );
  }

  return {
    width: safeW,
    height: safeH,
    aspectRatio: Number(aspectRatio.toFixed(2)),
    isTooSmall,
    isNotSquare,
    warnings
  };
}

export function computeResizeDimensions(
  width: number,
  height: number,
  maxDimension = MAX_IMAGE_DIMENSION
): { width: number; height: number; resized: boolean } {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const longest = Math.max(safeW, safeH);

  if (longest <= maxDimension) {
    return { width: safeW, height: safeH, resized: false };
  }

  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(safeW * scale)),
    height: Math.max(1, Math.round(safeH * scale)),
    resized: true
  };
}

export interface CompressedImageResult {
  file: File;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  warnings: string[];
}

/**
 * Browser-side compression & resizing to WebP (max 2000px on longest edge).
 * Falls back safely to the original file if canvas encoding is unavailable.
 */
export async function compressImageToWebp(
  file: File,
  maxDimension = MAX_IMAGE_DIMENSION,
  quality = 0.85
): Promise<CompressedImageResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      file,
      width: 0,
      height: 0,
      originalWidth: 0,
      originalHeight: 0,
      warnings: []
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new window.Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`Unable to read image "${file.name}".`));
      el.src = objectUrl;
    });

    const originalWidth = img.naturalWidth || img.width;
    const originalHeight = img.naturalHeight || img.height;
    const analysis = analyzeImageDimensions(originalWidth, originalHeight);
    const target = computeResizeDimensions(
      originalWidth,
      originalHeight,
      maxDimension
    );

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return {
        file,
        width: originalWidth,
        height: originalHeight,
        originalWidth,
        originalHeight,
        warnings: analysis.warnings
      };
    }

    ctx.drawImage(img, 0, 0, target.width, target.height);

    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, "image/webp", quality)
    );

    if (!blob || blob.size === 0) {
      return {
        file,
        width: originalWidth,
        height: originalHeight,
        originalWidth,
        originalHeight,
        warnings: analysis.warnings
      };
    }

    const baseName = file.name.replace(/\.[^.]+$/, "") || "product-image";
    const webpFile = new File([blob], `${baseName}.webp`, {
      type: "image/webp",
      lastModified: Date.now()
    });

    return {
      file: webpFile,
      width: target.width,
      height: target.height,
      originalWidth,
      originalHeight,
      warnings: analysis.warnings
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const BRAND_ALT_SUFFIX_PATTERN =
  /\s*[—–-]\s*Auro\s+Ardon(?:\s+Nairobi(?:\s+boutique)?)?\s*$/i;

export function stripBrandAltSuffix(value: string): string {
  return value.replace(BRAND_ALT_SUFFIX_PATTERN, "").trim();
}

export function resolveProductImageAlt(
  product: Pick<Product, "title" | "image_alts"> & { images?: string[] },
  index: number,
  totalImages?: number
): string {
  const rawCustomAlt = product.image_alts?.[index]?.trim();
  if (rawCustomAlt) {
    const cleaned = stripBrandAltSuffix(rawCustomAlt);
    if (cleaned) return cleaned;
  }

  const displayTitle = formatProductTitle(product.title);
  const explicitTotal =
    typeof totalImages === "number" && totalImages > 0
      ? Math.floor(totalImages)
      : null;

  if (explicitTotal && explicitTotal > 1) {
    return `${displayTitle}, photo ${index + 1} of ${explicitTotal}`;
  }

  if (index > 0) {
    const inferredTotal = Math.max(
      index + 1,
      product.images?.filter(Boolean).length ?? index + 1
    );
    return `${displayTitle}, photo ${index + 1} of ${inferredTotal}`;
  }

  return displayTitle;
}

