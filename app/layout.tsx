import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Geist } from "next/font/google";

import { buildCanonicalUrl, SITE_NAME, SITE_URL } from "@/lib/site";
import "./globals.css";

const themeScript = `(() => { try { const saved = localStorage.getItem("auro-ardon-theme"); const theme = saved === "dark" || saved === "light" ? saved : matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"; document.documentElement.classList.remove("light", "dark"); document.documentElement.classList.add(theme); document.documentElement.style.colorScheme = theme; } catch {} })();`;

const displayFont = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  weight: ["400"]
});

const bodyFont = Geist({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FFFFFF" },
    { media: "(prefers-color-scheme: dark)", color: "#141114" }
  ]
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Nairobi Jewelry, Watches & Beauty Boutique`,
    template: `%s | ${SITE_NAME}`
  },
  description:
    "Bold, giftable jewelry, watches, and beauty picks delivered across Nairobi the same day. Order on WhatsApp and pay cash or M-Pesa on delivery.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "32x32" },
      { url: "/icon", type: "image/png", sizes: "32x32" }
    ],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }]
  },
  openGraph: {
    type: "website",
    locale: "en_KE",
    siteName: SITE_NAME,
    url: SITE_URL,
    images: [
      {
        url: buildCanonicalUrl("/opengraph-image"),
        width: 1200,
        height: 630,
        alt: `${SITE_NAME} — Nairobi · Pay on delivery`
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    images: [buildCanonicalUrl("/twitter-image")]
  }
};

export default function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${displayFont.variable} ${bodyFont.variable} bg-paper font-sans text-text antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-[2px] focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
