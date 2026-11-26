import { CartDrawer } from "@/components/storefront/cart-drawer";
import { Footer } from "@/components/storefront/footer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { Navbar } from "@/components/storefront/navbar";
import { SearchCommandPalette } from "@/components/storefront/search-command-palette";
import { StoreClosedBanner } from "@/components/storefront/store-closed-banner";
import { StorefrontUIProvider } from "@/components/storefront/storefront-context";
import { CartProvider } from "@/lib/cart";
import { filterNonEmptyCategories } from "@/lib/catalog";
import {
  getStoreSettings,
  listCategories,
  listPublicProductIndex
} from "@/lib/data";

export default async function StorefrontLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const [categories, products, storeSettings] = await Promise.all([
    listCategories(),
    listPublicProductIndex(),
    getStoreSettings()
  ]);

  const activeCategories = filterNonEmptyCategories(categories, products);

  const publicSettings = {
    isStoreOpen: storeSettings.is_store_open,
    holidayBannerMessage: storeSettings.holiday_banner_message,
    whatsappNumber:
      storeSettings.whatsapp_number ||
      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
      "",
    sameDayCutoff: storeSettings.same_day_cutoff,
    businessHours: storeSettings.business_hours,
    freeDeliveryThreshold: storeSettings.free_delivery_threshold
  };

  return (
    <CartProvider categories={activeCategories} catalogProducts={products}>
      <StorefrontUIProvider products={products} storeSettings={publicSettings}>
        <Navbar categories={activeCategories} />
        <StoreClosedBanner
          isStoreOpen={storeSettings.is_store_open}
          holidayBannerMessage={storeSettings.holiday_banner_message}
        />
        <div className="flex min-h-dvh min-w-0 flex-col overflow-x-hidden pb-[calc(var(--mobile-bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
          <main id="main-content" className="min-w-0 flex-1">
            {children}
          </main>
          <Footer categories={activeCategories} storeSettings={storeSettings} />
        </div>
        <CartDrawer />
        <SearchCommandPalette />
        <MobileBottomNav />
      </StorefrontUIProvider>
    </CartProvider>
  );
}
