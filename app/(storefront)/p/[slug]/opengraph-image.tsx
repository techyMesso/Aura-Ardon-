import { ImageResponse } from "next/og";

import { formatKES } from "@/components/storefront/price-kes";
import { getSafeCatalogImageUrl } from "@/lib/catalog";
import { getProductBySlug } from "@/lib/data";
import { getOptionalSiteUrl } from "@/lib/env";

export const runtime = "nodejs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function ProductOpenGraphImage({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await getProductBySlug(decodeURIComponent(slug));
  const siteUrl = getOptionalSiteUrl() ?? "https://aura-ardon.vercel.app";

  const rawImage = getSafeCatalogImageUrl(product?.images[0]);
  const imageUrl = rawImage
    ? rawImage.startsWith("http")
      ? rawImage
      : `${siteUrl}${rawImage}`
    : `${siteUrl}/hero-jewelry.png`;

  const title = product?.title ?? "Auro Ardon";
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
            backgroundColor: "#FFFFFF",
            overflow: "hidden"
          }}
        >
          <img
            src={imageUrl}
            alt={title}
            width={500}
            height={500}
            style={{ width: "500px", height: "500px", objectFit: "cover" }}
          />
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
                  color: "#B8923E"
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
