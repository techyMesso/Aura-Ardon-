"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { createWhatsAppLink } from "@/lib/utils";

interface ContactFormProps {
  whatsappNumber: string | null;
}

export function ContactForm({ whatsappNumber }: ContactFormProps) {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">(
    "idle"
  );
  const [feedback, setFeedback] = useState("");
  const configured = Boolean(
    createWhatsAppLink(whatsappNumber ?? "", "Contact")
  );

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
      setFeedback("Fill in every field before opening WhatsApp.");
      return;
    }

    const whatsappUrl = createWhatsAppLink(
      whatsappNumber ?? "",
      [
        "Hello Auro Ardon,",
        `Name: ${name}`,
        `Contact: ${contact}`,
        `Subject: ${subject}`,
        `Message: ${message}`
      ].join("\n")
    );

    if (!whatsappUrl) {
      setState("error");
      setFeedback("WhatsApp is not configured yet.");
      return;
    }

    const popup = window.open("about:blank", "_blank");
    if (!popup) {
      setState("error");
      setFeedback("Allow pop-ups in your browser and try again.");
      return;
    }
    popup.opener = null;

    setState("sending");
    setFeedback("Opening WhatsApp...");
    await new Promise(resolve => window.setTimeout(resolve, 150));
    popup.location.href = whatsappUrl;
    setState("success");
    setFeedback("WhatsApp is open. Send the message there to finish.");
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 font-sans text-[14px]">
      <label className="block">
        <span className="mb-1.5 block text-text">Name</span>
        <input
          name="name"
          type="text"
          autoComplete="name"
          required
          className="input-luxe"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-text">Phone</span>
        <input
          name="contact"
          type="text"
          autoComplete="tel"
          required
          className="input-luxe"
        />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-text">Piece or order number</span>
        <input name="subject" type="text" required className="input-luxe" />
      </label>

      <label className="block">
        <span className="mb-1.5 block text-text">Message</span>
        <textarea
          name="message"
          rows={5}
          required
          className="w-full rounded-[2px] border border-text/20 bg-paper px-3.5 py-2.5 text-[14px] leading-[1.5] text-text focus:border-brass focus:outline-none"
        />
      </label>

      <button
        type="submit"
        disabled={!configured || state === "sending"}
        className="btn-primary"
      >
        {state === "sending" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        {state === "sending"
          ? "Opening WhatsApp..."
          : configured
            ? "Message on WhatsApp"
            : "WhatsApp unavailable"}
      </button>

      {feedback ? (
        <p
          className="bg-stone px-4 py-3 text-[14px] text-text"
          role={state === "error" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback}
        </p>
      ) : null}
    </form>
  );
}
