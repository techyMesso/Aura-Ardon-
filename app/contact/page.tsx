import { Mail, Phone, MapPin, Clock } from "lucide-react";

export const metadata = {
  title: "Contact Us | Auro Ardon",
  description: "Get in touch with Auro Ardon jewelry and beauty. Questions about orders, custom pieces, or delivery? Contact us by phone, email, or WhatsApp.",
};

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-10 text-center">
        <p className="section-label">Get in touch</p>
        <h1 className="heading-display mt-2">Contact us</h1>
        <p className="text-muted mt-4 max-w-xl mx-auto">
          Have questions about a piece, custom order, or delivery? We&apos;d love to hear from you.
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <div className="rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
          <h2 className="font-serif text-2xl text-ink mb-6">Send us a message</h2>
          <form className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Full name</label>
              <input
                type="text"
                required
                className="w-full rounded-2xl border border-border bg-white/60 px-4 py-3 text-ink focus:outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Email</label>
              <input
                type="email"
                required
                className="w-full rounded-2xl border border-border bg-white/60 px-4 py-3 text-ink focus:outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-2">Message</label>
              <textarea
                rows={5}
                required
                className="w-full rounded-2xl border border-border bg-white/60 px-4 py-3 text-ink focus:outline-none focus:ring-2 focus:ring-bronze/50"
              />
            </div>
            <button
              type="submit"
              className="btn-primary w-full justify-center py-4"
            >
              Send message
            </button>
          </form>
        </div>

        <div className="flex flex-col justify-between">
          <div className="rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
            <h2 className="font-serif text-2xl text-ink mb-6">Contact information</h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <MapPin className="mt-1 h-5 w-5 text-bronze" />
                <div>
                  <p className="font-medium text-ink">Address</p>
                  <p className="text-sm text-muted">Nairobi, Kenya</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Phone className="mt-1 h-5 w-5 text-bronze" />
                <div>
                  <p className="font-medium text-ink">Phone</p>
                  <p className="text-sm text-muted">+254 712 345 678</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Mail className="mt-1 h-5 w-5 text-bronze" />
                <div>
                  <p className="font-medium text-ink">Email</p>
                  <p className="text-sm text-muted">contact@auroardon.com</p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <Clock className="mt-1 h-5 w-5 text-bronze" />
                <div>
                  <p className="font-medium text-ink">Hours</p>
                  <p className="text-sm text-muted">Mon - Sat: 9am - 6pm</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-[2rem] border border-white/60 bg-white/70 p-8 shadow-luxe backdrop-blur">
            <h2 className="font-serif text-2xl text-ink mb-4">Follow us</h2>
            <p className="text-sm text-muted mb-4">
              Stay updated with new collections and studio stories.
            </p>
            <div className="flex gap-4">
              <a
                href="#"
                className="rounded-full h-10 w-10 flex items-center justify-center bg-sand/50 text-ink hover:bg-bronze hover:text-white transition"
                aria-label="Instagram"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.85-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
              </a>
              <a
                href="#"
                className="rounded-full h-10 w-10 flex items-center justify-center bg-sand/50 text-ink hover:bg-bronze hover:text-white transition"
                aria-label="Facebook"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
