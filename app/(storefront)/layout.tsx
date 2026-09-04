import { Navbar } from "@/components/storefront/navbar";
import { Footer } from "@/components/storefront/footer";
import { WhatsAppFab } from "@/components/storefront/whatsapp-fab";
import { CartProvider } from "@/lib/cart";
import { listCategories } from "@/lib/data";

/**
 * Storefront Layout
 *
 * Wraps all customer-facing pages (homepage, shop, product,
 * cart, checkout) with the shared Navbar and Footer.
 *
 * The admin and login pages live outside this route group,
 * so they get their own chrome and never see this layout.
 */
export default async function StorefrontLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const categories = await listCategories();

  return (
    <CartProvider categories={categories}>
      <Navbar categories={categories} />
      {/* Push content below the fixed 72px navbar */}
      <main className="min-h-screen pt-[72px]">{children}</main>
      <Footer categories={categories} />
      <WhatsAppFab />

      {/* Add bottom padding on mobile so content isn't hidden behind sticky bar */}
      <div className="h-24 lg:h-0" />
    </CartProvider>
  );
}
