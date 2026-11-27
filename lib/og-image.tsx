import { ImageResponse } from "next/og";

import { SITE_NAME } from "@/lib/site";

export const OG_IMAGE_ALT = `${SITE_NAME} — Nairobi · Pay on delivery`;
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;
export const OG_IMAGE_CONTENT_TYPE = "image/png";
export const OG_TAGLINE =
  "Bold, giftable jewelry, watches & beauty essentials.";

let cachedBodoniModaFont: Promise<ArrayBuffer | null> | null = null;

async function loadBodoniModaFont(): Promise<ArrayBuffer | null> {
  if (cachedBodoniModaFont) {
    return cachedBodoniModaFont;
  }

  cachedBodoniModaFont = (async () => {
    try {
      const cssController = new AbortController();
      const cssTimer = setTimeout(() => cssController.abort(), 2000);
      const cssRes = await fetch(
        "https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400&display=swap",
        {
          signal: cssController.signal,
          headers: {
            // Request TrueType font format supported by Satori
            "User-Agent": "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)"
          }
        }
      );
      clearTimeout(cssTimer);
      if (!cssRes.ok) return null;

      const cssText = await cssRes.text();
      const fontUrlMatch = cssText.match(/url\((https?:\/\/[^)]+)\)/i);
      if (!fontUrlMatch?.[1]) return null;

      const fontController = new AbortController();
      const fontTimer = setTimeout(() => fontController.abort(), 2500);
      const fontRes = await fetch(fontUrlMatch[1], {
        signal: fontController.signal
      });
      clearTimeout(fontTimer);
      if (!fontRes.ok) return null;

      return await fontRes.arrayBuffer();
    } catch {
      return null;
    }
  })();

  return cachedBodoniModaFont;
}

export async function renderBrandOgImage() {
  const bodoniFont = await loadBodoniModaFont();

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background:
            "linear-gradient(135deg, #27131E 0%, #1A1216 58%, #2E1723 100%)",
          color: "#F5F2EF",
          padding: "72px 84px",
          border: "12px solid #351D29"
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
              width: "56px",
              height: "56px",
              alignItems: "center",
              justifyContent: "center",
              border: "2px solid #B8923E",
              color: "#B8923E",
              fontSize: 24,
              fontFamily: bodoniFont ? '"Bodoni Moda"' : "Georgia, serif"
            }}
          >
            AA
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
          <div
            style={{
              display: "flex",
              fontSize: 92,
              lineHeight: 1.08,
              fontFamily: bodoniFont ? '"Bodoni Moda"' : "Georgia, serif",
              color: "#FFFFFF",
              letterSpacing: "-0.01em"
            }}
          >
            {SITE_NAME}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 34,
              lineHeight: 1.32,
              color: "rgba(245, 242, 239, 0.88)",
              maxWidth: "880px"
            }}
          >
            {OG_TAGLINE}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid rgba(184, 146, 62, 0.4)",
            paddingTop: "24px",
            fontSize: 24,
            color: "#D8B360"
          }}
        >
          <span>Nairobi · Pay on delivery</span>
          <span>Order on WhatsApp</span>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      ...(bodoniFont
        ? {
            fonts: [
              {
                name: "Bodoni Moda",
                data: bodoniFont,
                weight: 400 as const,
                style: "normal" as const
              }
            ]
          }
        : {})
    }
  );
}

