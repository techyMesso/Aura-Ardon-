"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";

import { Section } from "@/components/storefront/section";
import { useStorefrontUI } from "@/components/storefront/storefront-context";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { DEFAULT_WHATSAPP_NUMBER } from "@/lib/site";
import { createWhatsAppLink } from "@/lib/utils";

export default function StorefrontError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { categories } = useCart();
  const { storeSettings } = useStorefrontUI();

  useEffect(() => {
    console.error("Storefront error boundary", error);
  }, [error]);

  const whatsappUrl = createWhatsAppLink(
    storeSettings.whatsappNumber ||
      process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ||
      DEFAULT_WHATSAPP_NUMBER,
    "Hi Auro Ardon! I ran into a page error while browsing the store."
  );

  return (
    <Section containerClassName="max-w-2xl">
      <div className="border border-text/15 bg-paper p-8 sm:p-10">
        <p className="font-sans text-[12px] font-semibold uppercase tracking-[0.2em] text-brass">
          Auro Ardon Nairobi
        </p>
        <h1 className="mt-2 font-serif text-[36px] font-normal leading-[1.05] tracking-[-0.01em] text-text">
          Something went wrong
        </h1>
        <p className="mt-3 font-sans text-[15px] leading-[1.6] text-muted">
          We hit a temporary hiccup loading this page. Try again, jump back into the shop, or message us directly on WhatsApp.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button type="button" onClick={() => reset()}>
            Try again
          </Button>
          <Link href="/shop" className="btn-outline">
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
              WhatsApp support
            </a>
          ) : null}
        </div>

        {categories.length > 0 ? (
          <div className="mt-8 border-t border-text/12 pt-6">
            <p className="font-sans text-[12px] uppercase tracking-[0.14em] text-muted">
              Browse categories
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {categories.slice(0, 6).map(category => (
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
