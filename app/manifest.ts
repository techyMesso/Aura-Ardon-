import type { MetadataRoute } from "next";

import { SITE_CONFIG } from "@/lib/site-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_CONFIG.brandName} Nairobi`,
    short_name: SITE_CONFIG.brandName,
    description: SITE_CONFIG.brandLine,
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#1A1216",
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
      }
    ]
  };
}
