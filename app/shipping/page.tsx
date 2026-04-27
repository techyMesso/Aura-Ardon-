export const metadata = {
  title: "Shipping & Delivery",
  description: "Information about shipping rates, delivery times, and delivery areas for Auro Ardon",
};

export default function ShippingPage() {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient gradients */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-20 -top-20 h-48 w-48 rounded-full bg-champagne/10 blur-3xl" />
        <div className="absolute -right-24 top-16 h-32 w-32 rounded-full bg-bronze/8 blur-3xl" />
      </div>

      <div className="mx-auto max-w-4xl px-6 py-24 lg:px-10">
        <header className="mb-12 text-center">
          <h1 className="mb-4 text-3xl font-bold text-ink">
            Shipping & <span className="gradient-text">Delivery</span>
          </h1>
          <p className="text-lg text-muted">
            Get your Auro Ardon pieces delivered across Kenya
          </p>
        </header>

        <div className="space-y-12">
          {/* Delivery Areas */}
          <div>
            <h2 className="section-label mb-6">Where We Deliver</h2>
            <p className="text-muted">
              We currently deliver to all major towns and cities in Kenya, including Nairobi, Mombasa, Kisumu, Nakuru, Eldoret, Thika, and more.
              If you're unsure whether we deliver to your location, please contact us on WhatsApp.
            </p>
          </div>

          {/* Shipping Rates */}
          <div>
            <h2 className="section-label mb-6">Shipping Rates</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">Nairobi Metropolitan Area</span>
                </div>
                <div>
                  <p className="text-sm text-muted">
                    <span className="font-semibold">Free</span> on orders above KSh 5,000. Standard fee KSh 250 for orders below.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">Outside Nairobi</span>
                </div>
                <div>
                  <p className="text-sm text-muted">
                    <span className="font-semibold">Free</span> on orders above KSh 8,000. Standard fee KSh 500 for orders below.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Delivery Times */}
          <div>
            <h2 className="section-label mb-6">Delivery Times</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">Processing Time</span>
                </div>
                <div>
                  <p className="text-sm text-muted">
                    1-2 business days for order processing and packaging.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">Delivery Time</span>
                </div>
                <div>
                  <p className="text-sm text-muted">
                    Nairobi: 1-2 business days after processing<br />
                    Outside Nairobi: 2-4 business days after processing
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cash on Delivery */}
          <div>
            <h2 className="section-label mb-6">Cash on Delivery (COD)</h2>
            <p className="text-muted">
              We offer Cash on Delivery for eligible orders within Kenya. Please have the exact amount ready when your package arrives, or confirm directly with us on WhatsApp if you need help before dispatch.
            </p>
          </div>

          {/* Tracking */}
          <div>
            <h2 className="section-label mb-6">Order Tracking</h2>
            <p className="text-muted">
              All orders are tracked via WhatsApp. You'll receive updates when your order is confirmed, packaged, shipped, and out for delivery.
              If you haven't received updates, please check your WhatsApp or contact us directly.
            </p>
          </div>
        </div>

        {/* Call to action */}
        <div className="mt-16 text-center">
          <p className="mb-6 text-lg text-muted">
            Have more questions about shipping? We're here to help.
          </p>
          <a
            href="/contact"
            className="btn-primary"
          >
            Contact Us
          </a>
        </div>
      </div>
    </section>
  );
}
