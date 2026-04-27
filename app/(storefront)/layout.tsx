import { Navbar } from "@/components/storefront/navbar";
import { Footer } from "@/components/storefront/footer";
import { WhatsAppFab } from "@/components/storefront/whatsapp-fab";
import { CartProvider } from "@/lib/cart";

/**
 * Storefront Layout
 *
 * Wraps all customer-facing pages (homepage, shop, product,
 * cart, checkout) with the shared Navbar and Footer.
 *
 * The admin and login pages live outside this route group,
 * so they get their own chrome and never see this layout.
 */
export default function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <CartProvider>
      <Navbar />
      {/* Push content below the fixed 72px navbar */}
      <main className="min-h-screen pt-[72px]">{children}</main>
      <Footer />
      <WhatsAppFab />

      {/* Add bottom padding on mobile so content isn't hidden behind sticky bar */}
      <div className="h-24 lg:h-0" />
    </CartProvider>
  );
}
