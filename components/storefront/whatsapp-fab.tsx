"use client";

import { MessageCircle } from "lucide-react";
import { usePathname } from "next/navigation";

import { createWhatsAppLink } from "@/lib/utils";

export function WhatsAppFab() {
  const pathname = usePathname();
  const whatsappUrl = createWhatsAppLink(
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "",
    "Hello Auro Ardon, I would like help choosing a piece."
  );
  const isProductPage = /^\/shop\/[^/]+\/[^/]+\/?$/.test(pathname);

  if (!whatsappUrl || isProductPage || pathname === "/checkout") return null;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-[#111111] p-1.5 pr-4 text-sm font-semibold text-white shadow-[0_20px_50px_rgba(17,17,17,0.35)] transition hover:bg-[#1c1c1c] sm:right-5 lg:bottom-8 lg:right-8"
      aria-label="Contact Auro Ardon on WhatsApp"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c49d52] text-[#111111]">
        <MessageCircle className="h-5 w-5" aria-hidden />
      </span>
      <span className="hidden sm:block">WhatsApp us</span>
    </a>
  );
}
