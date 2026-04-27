"use client";

import { MessageCircle } from "lucide-react";

const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER;

export function WhatsAppFab() {
  if (!whatsappNumber) {
    return null;
  }

  return (
    <a
      href={`https://wa.me/${whatsappNumber}`}
      target="_blank"
      rel="noopener noreferrer"
      className="fixed bottom-5 right-5 z-50 inline-flex items-center gap-3 rounded-full bg-[#111111] px-4 py-3 text-sm font-semibold text-white shadow-[0_20px_50px_rgba(17,17,17,0.35)] transition hover:bg-[#1c1c1c] lg:bottom-8 lg:right-8"
      aria-label="Contact us on WhatsApp"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c49d52] text-[#111111]">
        <MessageCircle className="h-5 w-5" />
      </span>
      <span className="hidden sm:block">Order via WhatsApp</span>
    </a>
  );
}
