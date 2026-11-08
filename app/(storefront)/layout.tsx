import { CartDrawer } from "@/components/storefront/cart-drawer";
import { Footer } from "@/components/storefront/footer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { Navbar } from "@/components/storefront/navbar";
import { SearchCommandPalette } from "@/components/storefront/search-command-palette";
import { StorefrontUIProvider } from "@/components/storefront/storefront-context";
import { CartProvider } from "@/lib/cart";
import { listCategories, listPublicProducts } from "@/lib/data";

export default async function StorefrontLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const [categories, products] = await Promise.all([
    listCategories(),
    listPublicProducts()
  ]);

  return (
    <CartProvider categories={categories}>
      <StorefrontUIProvider products={products}>
        <Navbar categories={categories} />
        <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
          <Footer categories={categories} />
        </div>
        <CartDrawer />
        <SearchCommandPalette />
        <MobileBottomNav />
      </StorefrontUIProvider>
    </CartProvider>
  );
}
