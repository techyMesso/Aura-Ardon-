import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";

const themeScript = `(() => { try { const saved = localStorage.getItem("auro-ardon-theme"); const theme = saved === "dark" || saved === "light" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(theme); document.documentElement.style.colorScheme = theme; } catch {} })();`;

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400", "500", "600", "700"]
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

// ─── Default SEO metadata ─────────────────────────────────
export const metadata: Metadata = {
  title: {
    default:  "Auro Ardon | African Modern Luxury Jewelry & Beauty",
    template: "%s | Auro Ardon",
  },
  description:
    "Shop premium handcrafted jewelry and accessories from Nairobi. Order through WhatsApp or cash on delivery.",
  keywords: [
    "African jewelry Nairobi",
    "stainless necklaces Kenya",
    "African bracelets",
    "rings and earrings Nairobi",
    "giftable jewelry sets Kenya",
    "WhatsApp shopping Kenya",
  ],
  openGraph: {
    type:     "website",
    locale:   "en_KE",
    siteName: "Auro Ardon",
  },
};

// ─── Root Layout ──────────────────────────────────────────
// Deliberately minimal: just fonts + globals.
// Each sub-layout (storefront, admin) adds its own chrome.
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable} bg-background font-sans text-foreground antialiased`}>
        {children}
      </body>
    </html>
  );
}
