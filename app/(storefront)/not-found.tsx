import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { Section } from "@/components/storefront/section";
import { filterNonEmptyCategories } from "@/lib/catalog";
import {
  getStoreSettings,
  listCategories,
  listPublicProductIndex
} from "@/lib/data";
import { createWhatsAppLink } from "@/lib/utils";

export default async function StorefrontNotFound() {
  const [categories, products, settings] = await Promise.all([
    listCategories(),
    listPublicProductIndex(),
    getStoreSettings()
  ]);

  const activeCategories = filterNonEmptyCategories(categories, products);
  const whatsappUrl = createWhatsAppLink(
    settings.whatsapp_number,
    "Hi Auro Ardon! I landed on a missing page and need help finding a piece."
  );

  return (
    <Section containerClassName="max-w-2xl">
      <div className="border border-text/15 bg-paper p-8 sm:p-10">
        <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em] text-brass">
          404 · Auro Ardon Nairobi
        </p>
        <h1 className="mt-2 font-serif text-[36px] font-normal leading-[1.05] tracking-[-0.01em] text-text sm:text-[44px]">
          Piece or page not found
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-[1.6] text-muted">
          The page or piece you are looking for may have moved or sold out. Explore our current collections below or message us on WhatsApp.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/shop" className="btn-primary">
            Shop all pieces
          </Link>
          {whatsappUrl ? (
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-outline inline-flex items-center gap-2"
            >
              <MessageCircle className="h-4 w-4" aria-hidden />
              Ask on WhatsApp
            </a>
          ) : null}
        </div>

        {activeCategories.length > 0 ? (
          <div className="mt-8 border-t border-text/12 pt-6">
            <p className="font-sans text-[12px] uppercase tracking-[0.14em] text-muted">
              Browse categories
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeCategories.map(category => (
                <Link
                  key={category.id}
                  href={`/shop/${category.slug}`}
                  className="rounded-[2px] border border-text/20 bg-stone px-3.5 py-2 font-sans text-[13px] text-text transition-colors hover:border-brass hover:text-brass"
                >
                  {category.name}
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Section>
  );
}
