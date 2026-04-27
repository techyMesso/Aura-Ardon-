import type { Metadata } from "next";
import { Cormorant_Garamond, Manrope } from "next/font/google";

import "./globals.css";

// ─── Display / Serif font ─────────────────────────────────
// Used for all headings, hero text, and brand mark.
const display = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

// ─── Body / Sans font ─────────────────────────────────────
// Used for all body text, buttons, nav links, labels.
const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
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
    "lip gloss Nairobi",
    "hair accessories Kenya",
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
    <html lang="en" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
      <body className="font-sans bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
