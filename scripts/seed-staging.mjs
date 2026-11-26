/**
 * Staging-only demo catalog seed script.
 *
 * Usage:
 *   npm run seed:staging -- --confirm-staging
 *   (or set ALLOW_STAGING_SEED=true)
 *
 * Refuses to run against production under all circumstances.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_PROJECT_REF = "bjasoyhcxubrkxrqurfr";

function loadDotEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    const val = line.slice(eqIndex + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

loadDotEnvLocal();

const confirmed =
  process.argv.includes("--confirm-staging") ||
  process.env.ALLOW_STAGING_SEED === "true";

if (process.env.NODE_ENV === "production") {
  console.error("REFUSED: seed-staging.mjs cannot run when NODE_ENV=production.");
  process.exit(1);
}

if (!confirmed) {
  console.error(
    "REFUSED: Pass --confirm-staging (or set ALLOW_STAGING_SEED=true) to confirm you are seeding a staging database."
  );
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Configure staging keys in .env.local first."
  );
  process.exit(1);
}

if (supabaseUrl.includes(PRODUCTION_PROJECT_REF)) {
  console.error(
    `REFUSED: NEXT_PUBLIC_SUPABASE_URL targets the production Supabase project (${PRODUCTION_PROJECT_REF}).`
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const DEMO_CATEGORIES = [
  {
    name: "Watches",
    slug: "watches",
    description: "Classic leather and stainless steel timepieces curated for everyday Nairobi style.",
    display_order: 1
  },
  {
    name: "Lip Care",
    slug: "lip-care",
    description: "Nourishing lip oils, glossy finishes, and hydrating everyday balms.",
    display_order: 2
  },
  {
    name: "Jewelry",
    slug: "jewelry",
    description: "Water-resistant gold-tone stainless steel cuffs, hoops, and giftable chains.",
    display_order: 3
  },
  {
    name: "Accessories",
    slug: "accessories",
    description: "Everyday finishing accents and gift-ready accessories.",
    display_order: 4
  }
];

const DEMO_PRODUCTS = [
  {
    title: "Nairobi Classic Leather Strap Watch",
    slug: "nairobi-classic-leather-strap-watch",
    categorySlug: "watches",
    categoryName: "Watches",
    description:
      "Slim gold-tone stainless steel bezel paired with a soft stitched strap. Ideal for office wear or evening gifting.",
    price: 1850,
    stock_quantity: 12,
    material: "Stainless steel case with faux-leather strap",
    finish: "Polished gold-tone",
    size_label: "34 mm dial · adjustable strap",
    water_resistance: "Splash resistant (3 ATM)",
    warranty: "6-month movement warranty",
    in_the_box: "Watch, gift pouch, and care card",
    care: "Keep away from direct water immersion and harsh perfume sprays.",
    images: [],
    is_featured: true,
    active: true
  },
  {
    title: "Men's Minimalist Chronograph Watch",
    slug: "mens-minimalist-chronograph-watch",
    categorySlug: "watches",
    categoryName: "Watches",
    description:
      "Clean matte dial with brushed metallic link bracelet designed for everyday durability and crisp formal styling.",
    price: 2450,
    stock_quantity: 2,
    material: "Brushed alloy and stainless steel clasp",
    finish: "Brushed gunmetal",
    size_label: "42 mm case",
    in_the_box: "Watch and presentation box",
    care: "Wipe with a dry microfiber cloth after wear.",
    images: [],
    is_featured: true,
    active: true
  },
  {
    title: "Gold-Tone Mesh Bracelet Watch",
    slug: "gold-tone-mesh-bracelet-watch",
    categorySlug: "watches",
    categoryName: "Watches",
    description:
      "Lightweight woven mesh strap with a refined sunray dial and magnetic-style clasp for quick adjustment.",
    price: 2200,
    stock_quantity: 0,
    material: "Gold-tone stainless steel mesh",
    finish: "Mirror gold polish",
    size_label: "32 mm dial",
    in_the_box: "Watch and velvet pouch",
    care: "Store dry in pouch when not in use.",
    images: [],
    is_featured: false,
    active: true
  },
  {
    title: "Honey Glow Hydrating Lip Oil",
    slug: "honey-glow-hydrating-lip-oil",
    categorySlug: "lip-care",
    categoryName: "Lip Care",
    description:
      "Non-sticky botanical lip oil delivering glass-like shine and lasting comfort in Nairobi's dry weather.",
    price: 450,
    stock_quantity: 25,
    material: "Jojoba oil, Vitamin E, cosmetic-grade sheen base",
    finish: "High-shine sheer tint",
    size_label: "6 ml",
    ingredients: "Simmondsia Chinensis (Jojoba) Seed Oil, Tocopheryl Acetate (Vitamin E), Shea Butter",
    net_weight: "6 ml",
    expiry_info: "12M after opening",
    in_the_box: "Sealed 6 ml lip oil applicator",
    care: "Store upright away from direct heat.",
    images: [],
    is_featured: true,
    active: true
  },
  {
    title: "Rose Velvet Mirror Lip Gloss",
    slug: "rose-velvet-mirror-lip-gloss",
    categorySlug: "lip-care",
    categoryName: "Lip Care",
    description:
      "Cushiony warm-rose gloss with buildable pigment and zero stickiness for effortless day-to-night wear.",
    price: 350,
    stock_quantity: 18,
    material: "Cosmetic-grade conditioning gloss",
    finish: "Rose mirror gloss",
    size_label: "5 ml",
    in_the_box: "Sealed 5 ml gloss tube",
    care: "Close tightly after each use.",
    images: [],
    is_featured: false,
    active: true
  },
  {
    title: "Shea & Berry Conditioning Lip Balm",
    slug: "shea-berry-conditioning-lip-balm",
    categorySlug: "lip-care",
    categoryName: "Lip Care",
    description:
      "Rich daily moisture balm infused with shea butter and a subtle berry tint.",
    price: 300,
    stock_quantity: 3,
    material: "Shea butter and vitamin E balm",
    finish: "Soft satin tint",
    size_label: "10 g",
    in_the_box: "Sealed balm tin",
    care: "Keep in a cool, dry place.",
    images: [],
    is_featured: false,
    active: true
  },
  {
    title: "Sculpted 18K Gold-Tone Cuff Bracelet",
    slug: "sculpted-18k-gold-tone-cuff-bracelet",
    categorySlug: "jewelry",
    categoryName: "Jewelry",
    description:
      "Statement open cuff crafted from tarnish-resistant stainless steel for solo wear or stack styling.",
    price: 1600,
    stock_quantity: 9,
    material: "316L stainless steel",
    finish: "18K gold PVD polish",
    size_label: "58 mm inner diameter · adjustable open cuff",
    in_the_box: "Cuff bracelet, pouch, and care card",
    care: "Wipe dry after contact with lotion or water.",
    images: [],
    is_featured: true,
    active: true
  },
  {
    title: "Layered Herringbone Chain Necklace",
    slug: "layered-herringbone-chain-necklace",
    categorySlug: "jewelry",
    categoryName: "Jewelry",
    description:
      "Fluid flat-snake chain that catches warm light cleanly along the collarbone.",
    price: 1950,
    stock_quantity: 7,
    material: "316L stainless steel",
    finish: "18K gold PVD",
    size_label: "42 cm + 5 cm extender",
    in_the_box: "Necklace and Auro Ardon gift pouch",
    care: "Lay flat when storing to prevent kinks.",
    images: [],
    is_featured: true,
    active: true
  }
];

async function run() {
  console.log(`Seeding staging database at ${supabaseUrl}...`);

  const { error: settingsError } = await supabase
    .from("store_settings")
    .upsert({ id: true }, { onConflict: "id", ignoreDuplicates: true });

  if (settingsError) {
    throw new Error(`Failed ensuring store_settings: ${settingsError.message}`);
  }

  const { data: categories, error: catError } = await supabase
    .from("categories")
    .upsert(DEMO_CATEGORIES, { onConflict: "slug" })
    .select("id, slug, name");

  if (catError) {
    throw new Error(`Failed seeding categories: ${catError.message}`);
  }

  const categoryIdBySlug = new Map(categories.map(cat => [cat.slug, cat.id]));

  const productRows = DEMO_PRODUCTS.map(({ categorySlug, categoryName, ...rest }) => ({
    ...rest,
    category: categoryName,
    category_id: categoryIdBySlug.get(categorySlug) ?? null
  }));

  const { data: products, error: prodError } = await supabase
    .from("products")
    .upsert(productRows, { onConflict: "slug" })
    .select("id, title, slug, stock_quantity");

  if (prodError) {
    throw new Error(`Failed seeding products: ${prodError.message}`);
  }

  console.log(`Seeded ${categories.length} categories and ${products.length} demo products in staging.`);
}

run().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

