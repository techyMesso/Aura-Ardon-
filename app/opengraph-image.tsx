import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const runtime = "nodejs";
export const alt = `${SITE_NAME} — Nairobi Jewelry, Watches & Beauty Boutique`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          backgroundColor: "#1A1216",
          color: "#F5F2EF",
          padding: "72px 84px",
          border: "12px solid #2A1F24"
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between"
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 22,
              letterSpacing: "0.24em",
              textTransform: "uppercase",
              color: "#B8923E"
            }}
          >
            NAIROBI BOUTIQUE
          </div>
          <div
            style={{
              display: "flex",
              width: "52px",
              height: "52px",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #B8923E",
              color: "#B8923E",
              fontSize: 24,
              fontFamily: "Georgia, serif"
            }}
          >
            AA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              lineHeight: 1.0,
              fontFamily: "Georgia, serif",
              color: "#FFFFFF",
              letterSpacing: "-0.02em"
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              lineHeight: 1.3,
              color: "rgba(245, 242, 239, 0.85)",
              maxWidth: "880px"
            }}
          >
            Jewelry, watches &amp; beauty picks delivered across Nairobi today.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(184, 146, 62, 0.35)",
            paddingTop: "24px",
            fontSize: 22,
            color: "#B8923E"
          }}
        >
          <span>Order on WhatsApp</span>
          <span>Cash or M-Pesa on delivery</span>
        </div>
      </div>
    ),
    size
  );
}

