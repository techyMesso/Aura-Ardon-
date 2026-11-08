import type { Metadata } from "next";
import { Bodoni_Moda, Geist } from "next/font/google";

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

export const metadata: Metadata = {
  title: {
    default: "Auro Ardon | Nairobi Jewelry",
    template: "%s | Auro Ardon"
  },
  description:
    "Gold-tone stainless necklaces, bracelets, rings, earrings, watches, and gift sets delivered in Nairobi. Pay on delivery or order on WhatsApp.",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    locale: "en_KE",
    siteName: "Auro Ardon"
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
