import type { MetadataRoute } from "next";

import { resolveSiteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = resolveSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/api/",
        "/checkout",
        "/cart",
        "/order/",
        "/orders/",
        "/i/",
        "/login"
      ]
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
