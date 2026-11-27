import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";

import { formatKES } from "@/components/storefront/price-kes";
import { formatProductTitle, getSafeCatalogImageUrl } from "@/lib/catalog";
import { getProductBySlug } from "@/lib/data";

export const runtime = "nodejs";
export const alt = "Auro Ardon product preview";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SATORI_SUPPORTED_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif"]);

let cachedFallbackDataUrl: string | null = null;

async function getLocalFallbackImage(): Promise<string | null> {
  if (cachedFallbackDataUrl) return cachedFallbackDataUrl;
  try {
    const fileBuffer = await readFile(path.join(process.cwd(), "public", "hero-jewelry.png"));
    cachedFallbackDataUrl = `data:image/png;base64,${fileBuffer.toString("base64")}`;
    return cachedFallbackDataUrl;
  } catch {
    return null;
  }
}

async function resolveOgImageSrc(rawUrl: string | null | undefined): Promise<string | null> {
  const safeUrl = getSafeCatalogImageUrl(rawUrl);
  if (safeUrl) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const response = await fetch(safeUrl, { signal: controller.signal });
      clearTimeout(timeout);
      const contentTypeHeader = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      if (response.ok && contentTypeHeader && SATORI_SUPPORTED_TYPES.has(contentTypeHeader)) {
        const buffer = Buffer.from(await response.arrayBuffer());
        return `data:${contentTypeHeader};base64,${buffer.toString("base64")}`;
      }
    } catch {
      // Fall back cleanly when remote image is WebP/AVIF or unreachable.
    }
  }
  return getLocalFallbackImage();
}

export default async function ProductOpenGraphImage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(decodeURIComponent(slug));
  const imageSrc = await resolveOgImageSrc(product?.images[0]);

  const title = product ? formatProductTitle(product.title) : "Auro Ardon";
  const price = product ? formatKES(product.price) : "";

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          backgroundColor: "#FFFFFF",
          color: "#1A1216",
          padding: "56px",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <div
          style={{
            display: "flex",
            width: "500px",
            height: "500px",
            backgroundColor: "#EFEBE7",
            overflow: "hidden",
            alignItems: "center",
            justifyContent: "center"
          }}
        >
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageSrc}
              alt={title}
              width={500}
              height={500}
              style={{ width: "500px", height: "500px", objectFit: "cover" }}
            />
          ) : (
            <div style={{ fontSize: 64, color: "#B8923E" }}>AA</div>
          )}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            width: "540px",
            height: "500px",
            paddingLeft: "40px"
          }}
        >
          <div style={{ fontSize: 24, color: "#1A1216" }}>Auro Ardon</div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div
              style={{
                fontSize: 54,
                lineHeight: 1.05,
                color: "#1A1216"
              }}
            >
              {title}
            </div>
            {price ? (
              <div
                style={{
                  fontSize: 32,
                  fontWeight: 500,
                  color: "#8A6A22"
                }}
              >
                {price}
              </div>
            ) : null}
          </div>

          <div style={{ fontSize: 20, color: "rgba(26, 18, 22, 0.6)" }}>
            Same-day delivery in Nairobi — Pay on delivery
          </div>
        </div>
      </div>
    ),
    size
  );
}
