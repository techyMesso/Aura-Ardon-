import Image from "next/future/image";

export const metadata = {
  title: "About Auro Ardon",
  description: "Learn about Auro Ardon, Nairobi-based African modern luxury jewelry and beauty brand",
};

export default function AboutPage() {
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
            About <span className="gradient-text">Auro Ardon</span>
          </h1>
          <p className="text-lg text-muted">
            African modern luxury — handcrafted in Nairobi, delivered worldwide
          </p>
        </header>

        <div className="grid gap-12 lg:grid-cols-2">
          {/* Story column */}
          <div>
            <h2 className="section-label mb-6">Our Story</h2>
            <p className="mb-6 leading-relaxed">
              Founded in the heart of Nairobi, Auro Ardon began as a passion project to celebrate African artistry through contemporary design. Our founder, inspired by the rich textures, patterns, and colors of African heritage, set out to create luxury accessories that honor tradition while speaking to the modern woman.
            </p>
            <p className="leading-relaxed">
              Each piece in our collection tells a story — from the brass workshops of Kenya to the beading cooperatives that have preserved their craft for generations. We believe true luxury lies in authenticity, which is why we work directly with local artisans to ensure every item is not only beautiful but meaningful.
            </p>
          </div>

          {/* Values column */}
          <div>
            <h2 className="section-label mb-6">Our Values</h2>
            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">1</span>
                </div>
                <div>
                  <h3 className="font-semibold text-ink">African Heritage</h3>
                  <p className="text-sm text-muted">
                    We draw inspiration from diverse African cultures, translating traditional motifs into contemporary luxury accessories that honor their origins.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">2</span>
                </div>
                <div>
                  <h3 className="font-semibold text-ink">Artisan Partnerships</h3>
                  <p className="text-sm text-muted">
                    We collaborate directly with skilled artisans across Kenya, ensuring fair wages and preserving traditional craftsmanship for future generations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">3</span>
                </div>
                <div>
                  <h3 className="font-semibold text-ink">Sustainable Luxury</h3>
                  <p className="text-sm text-muted">
                    From ethically sourced materials to eco-conscious packaging, we believe luxury should never come at the expense of our planet.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-champagne/20">
                  <span className="text-bronze font-bold">4</span>
                </div>
                <div>
                  <h3 className="font-semibold text-ink">Timeless Design</h3>
                  <p className="text-sm text-muted">
                    Our pieces are designed to transcend trends — investment pieces that become cherished heirlooms, worn and loved for years to come.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="my-16 flex h-1 w-56 mx-auto bg-border/40" />

        {/* Mission section */}
        <div className="text-center">
          <h2 className="section-label mb-6">Our Mission</h2>
          <p className="max-w-2xl mx-auto leading-relaxed text-muted">
            To elevate African craftsmanship to global luxury status by creating exceptional jewelry and beauty products that celebrate heritage, empower artisans, and adorn the modern woman with confidence and grace.
          </p>
        </div>
      </div>
    </section>
  );
}