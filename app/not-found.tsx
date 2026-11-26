import Link from "next/link";

import { filterNonEmptyCategories } from "@/lib/catalog";
import {
  getStoreSettings,
  listCategories,
  listPublicProductIndex
} from "@/lib/data";
import { createWhatsAppLink } from "@/lib/utils";

export default async function RootNotFound() {
  const [categories, products, settings] = await Promise.all([
    listCategories(),
    listPublicProductIndex(),
    getStoreSettings()
  ]);

  const activeCategories = filterNonEmptyCategories(categories, products);
  const whatsappUrl = createWhatsAppLink(
    settings.whatsapp_number,
    "Hi Auro Ardon! I need help finding a page on your site."
  );

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-16 text-text">
      <div className="w-full max-w-xl border border-text/15 bg-paper p-8 sm:p-10">
        <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em] text-brass">
          404 · Auro Ardon
        </p>
        <h1 className="mt-2 font-serif text-[36px] font-normal leading-[1.05] text-text">
          Page not found
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-[1.6] text-muted">
          The page you requested doesn&apos;t exist. Return to the boutique or reach us on WhatsApp.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/shop" className="btn-primary">
            Shop all pieces
          </Link>
          <Link href="/" className="btn-outline">
            Back home
          </Link>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline"
            >
              WhatsApp us
            </a>
          ) : null}
        </div>
        {activeCategories.length > 0 ? (
          <div className="mt-6 flex flex-wrap gap-2 border-t border-text/12 pt-5">
            {activeCategories.map(category => (
              <Link
                key={category.id}
                href={`/shop/${category.slug}`}
                className="rounded-[2px] border border-text/20 bg-stone px-3 py-1.5 text-[13px] text-text hover:border-brass hover:text-brass"
              >
                {category.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </main>
  );
}

