export const metadata = {
  title: "How to Order",
  description: "Step-by-step guide on how to place an order at Auro Ardon",
};

export default function HowToOrderPage() {
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
            How to <span className="gradient-text">Order</span>
          </h1>
          <p className="text-lg text-muted">
            Simple steps to purchase your favorite Auro Ardon pieces
          </p>
        </header>

        <div className="space-y-12">
          {/* Step 1 */}
          <div className="flex items-start gap-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne text-ink flex-shrink-0">
              1
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-xl text-ink">Browse Our Collection</h3>
              <p className="text-muted">
                Explore our jewelry, lip care, and hair accessories collections. Use the filters to narrow down by category, price, or featured items.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne text-ink flex-shrink-0">
              2
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-xl text-ink">Add to Cart</h3>
              <p className="text-muted">
                Found something you love? Click "Add to Cart" on any product page. You can continue shopping or proceed to checkout when ready.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne text-ink flex-shrink-0">
              3
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-xl text-ink">Checkout Securely</h3>
              <p className="text-muted">
                Enter your delivery details and choose between M-Pesa or Cash on Delivery. No account creation needed — we offer guest checkout for your convenience.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex items-start gap-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-champagne text-ink flex-shrink-0">
              4
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-xl text-ink">Track Your Order</h3>
              <p className="text-muted">
                After placing your order, you'll receive updates via WhatsApp. We'll notify you when your package is shipped and out for delivery.
              </p>
            </div>
          </div>
        </div>

        {/* Call to action */}
        <div className="mt-16 text-center">
          <p className="mb-6 text-lg text-muted">
            Ready to start shopping? Our team is here to help if you have any questions.
          </p>
          <a
            href="/shop"
            className="btn-primary"
          >
            Shop Now
          </a>
        </div>
      </div>
    </section>
  );
}