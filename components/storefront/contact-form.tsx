"use client";

import { useState } from "react";
import { Loader2, MessageCircle } from "lucide-react";

import { createWhatsAppLink } from "@/lib/utils";

interface ContactFormProps {
  whatsappNumber: string | null;
}

export function ContactForm({ whatsappNumber }: ContactFormProps) {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [feedback, setFeedback] = useState("");
  const configured = Boolean(createWhatsAppLink(whatsappNumber ?? "", "Contact"));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const contact = String(formData.get("contact") ?? "").trim();
    const subject = String(formData.get("subject") ?? "").trim();
    const message = String(formData.get("message") ?? "").trim();

    if (!name || !contact || !subject || !message) {
      setState("error");
      setFeedback("Complete every field before opening WhatsApp.");
      return;
    }

    const whatsappUrl = createWhatsAppLink(
      whatsappNumber ?? "",
      [
        "Hello Auro Ardon, I am contacting you from the website.",
        `Name: ${name}`,
        `Contact: ${contact}`,
        `Subject: ${subject}`,
        `Message: ${message}`
      ].join("\n")
    );

    if (!whatsappUrl) {
      setState("error");
      setFeedback("WhatsApp messaging is not configured for this store yet.");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setState("error");
      setFeedback("Your browser blocked WhatsApp. Allow pop-ups and try again.");
      return;
    }
    popup.opener = null;

    setState("sending");
    setFeedback("Opening your prepared WhatsApp message...");
    await new Promise(resolve => window.setTimeout(resolve, 150));
    popup.location.href = whatsappUrl;
    setState("success");
    setFeedback("WhatsApp opened with your details. Tap send there to complete your message.");
  }

  return (
    <div className="rounded-[2rem] border border-white/60 bg-white/75 p-6 shadow-luxe backdrop-blur sm:p-8">
      <h2 className="font-serif text-3xl text-ink">Send a message</h2>
      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Full name</span>
          <input name="name" type="text" autoComplete="name" required className="input-luxe min-h-11" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Phone or email</span>
          <input name="contact" type="text" autoComplete="tel" required className="input-luxe min-h-11" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Subject</span>
          <input name="subject" type="text" required className="input-luxe min-h-11" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink">Message</span>
          <textarea name="message" rows={6} required className="input-luxe resize-y" />
        </label>
        <button
          type="submit"
          disabled={!configured || state === "sending"}
          className="btn-primary min-h-[52px] w-full"
        >
          {state === "sending" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MessageCircle className="h-4 w-4" aria-hidden />}
          {state === "sending" ? "Opening WhatsApp..." : configured ? "Continue in WhatsApp" : "Messaging unavailable"}
        </button>
        {feedback ? (
          <p
            className={`rounded-xl px-4 py-3 text-sm leading-6 ${
              state === "error" ? "bg-red-50 text-red-800" : state === "success" ? "bg-emerald-50 text-emerald-800" : "bg-sand/40 text-muted"
            }`}
            role={state === "error" ? "alert" : "status"}
            aria-live="polite"
          >
            {feedback}
          </p>
        ) : null}
      </form>
    </div>
  );
}
