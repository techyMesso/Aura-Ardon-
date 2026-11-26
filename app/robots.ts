import type { MetadataRoute } from "next";

import { getPublicSiteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getPublicSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/login", "/api/", "/orders/", "/checkout", "/cart"]
    },
    sitemap: `${siteUrl}/sitemap.xml`
  };
}

