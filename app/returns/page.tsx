export const metadata = {
  title: "Returns & Exchanges",
  description: "Auro Ardon's return and exchange policy for customer satisfaction",
};

export default function ReturnsPage() {
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
            Returns & <span className="gradient-text">Exchanges</span>
          </h1>
          <p className="text-lg text-muted">
            Shop with confidence — our hassle-free return policy
          </p>
        </header>

        <div className="space-y-12">
          {/* Overview */}
          <div>
            <h2 className="section-label mb-6">Our Promise</h2>
            <p className="text-muted">
              We want you to love your Auro Ardon purchase. If you're not completely satisfied, 
              we offer returns and exchanges within 7 days of delivery for most items.
            </p>
          </div>

          {/* Eligibility */}
          <div>
            <h2 className="section-label mb-6">What Can Be Returned</h2>
            <p className="text-muted">
              Most unworn, unused items with original tags and packaging are eligible for return 
              or exchange. Items must be in the same condition as received.
            </p>
          </div>

          {/* Non-returnable */}
          <div>
            <h2 className="section-label mb-6">Final Sale Items</h2>
            <p className="text-muted">
              The following items cannot be returned or exchanged due to hygiene reasons:
            </p>
            <ul className="list-disc list-inside space-y-2 mt-4 text-muted">
              <li>Lip care products (lip glosses, oils, balms)</li>
              <li>Earrings (for hygiene and safety reasons)</li>
              <li>Items marked as "final sale" or "clearance"</li>
              <li>Gift cards</li>
            </ul>
          </div>

          {/* Process */}
          <div>
            <h2 className="section-label mb-6">How to Return or Exchange</h2>
            <ol className="list-decimal list-inside space-y-2 mt-4 text-muted">
              <li>Contact us on WhatsApp within 7 days of receiving your order</li>
              <li>Provide your order number and reason for return/exchange</li>
              <li>We'll guide you through the packaging and drop-off process</li>
              <li>Once we receive the item, we'll process your refund or ship the exchange</li>
            </ol>
          </div>

          {/* Refunds */}
          <div>
            <h2 className="section-label mb-6">Refund Information</h2>
            <p className="text-muted">
              Refunds are issued to the original payment method within 3-5 business days 
              after we receive the returned item. Shipping fees are non-refundable unless 
              the return is due to our error (damaged or incorrect item).
            </p>
          </div>

          {/* Exchanges */}
          <div>
            <h2 className="section-label mb-6">Exchanges</h2>
            <p className="text-muted">
              Prefer a different size, color, or item? We'll happily exchange your purchase 
              for another item of equal or greater value (you'll pay any price difference).
            </p>
          </div>

          {/* Damaged Items */}
          <div>
            <h2 className="section-label mb-6">Damaged or Incorrect Items</h2>
            <p className="text-muted">
              If you receive a damaged, defective, or incorrect item, please contact us 
              immediately with photos. We'll arrange a replacement or full refund at no cost to you.
            </p>
          </div>
        </div>

        {/* Call to action */}
        <div className="mt-16 text-center">
          <p className="mb-6 text-lg text-muted">
            Have questions about a return or exchange? Our team is ready to help.
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