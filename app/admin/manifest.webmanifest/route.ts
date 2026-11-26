import { NextResponse } from "next/server";

import { SITE_NAME } from "@/lib/site";

export const runtime = "nodejs";

export function GET() {
  const manifest = {
    id: "/admin",
    name: `${SITE_NAME} Admin`,
    short_name: "AA Admin",
    description: `${SITE_NAME} Nairobi boutique operations, orders, riders, and alerts.`,
    lang: "en-KE",
    start_url: "/admin/orders",
    scope: "/admin",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#141114",
    theme_color: "#1A1216",
    categories: ["business", "productivity"],
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png"
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png"
      },
      {
        src: "/icon-192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ]
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    }
  });
}

