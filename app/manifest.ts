import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Auro Ardon Nairobi",
    short_name: "Auro Ardon",
    description:
      "Gold-tone stainless necklaces, bracelets, rings, earrings, watches, and gift sets delivered in Nairobi.",
    start_url: "/",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#1A1216",
    icons: [
      {
        src: "/hero-jewelry.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
