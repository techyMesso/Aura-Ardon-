import { Navbar } from "@/components/storefront/navbar";
import { Footer } from "@/components/storefront/footer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
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
      <div className="min-h-dvh min-w-0 overflow-x-hidden pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
        <main className="min-h-dvh min-w-0 pt-[72px]">{children}</main>
        <Footer categories={categories} />
      </div>
      <WhatsAppFab />
      <MobileBottomNav />
    </CartProvider>
  );
}
