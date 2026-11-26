# Auro Ardon — Architecture Overview

## Stack & Environments

- **Framework:** Next.js 15 (App Router, `output: "standalone"`), React 19, TypeScript, Tailwind CSS
- **Backend & Data:** Supabase (Postgres 17, Auth, Storage `product-images` bucket)
- **Rate Limiting:** Upstash Redis (`@upstash/ratelimit` sliding window; fails open in local dev when unset)
- **Testing:** Vitest (unit, integration, checkout concurrency stress tests)
- **Hosting:** Vercel (`https://aura-ardon.vercel.app`)
- **Environments:**
  - **Production Supabase:** `Aura & Ardon` (`bjasoyhcxubrkxrqurfr`, `eu-west-1`) — Production Vercel environment only
  - **Staging Supabase:** `Aura & Ardon Staging` (`scukquqkdivnodefqggf`, `eu-west-1`) — Preview deployments & local development

---

## Route Inventory

### Storefront (`app/(storefront)/*`)
| Route | Rendering | Notes |
| :--- | :--- | :--- |
| `/` | ISR (`revalidate = 300`) | Hero, category highlights, featured & new-in sections |
| `/shop`, `/shop/[category]` | ISR (`revalidate = 300`) | Catalog listing with URL-synced search, price, material, stock, and sort filters |
| `/shop/[category]/[product]` | Dynamic redirect | Permanent redirect to canonical `/p/[slug]` |
| `/p/[slug]` | ISR (`revalidate = 300`) | Canonical product detail page + dynamic `opengraph-image.tsx` |
| `/cart` | Dynamic (`force-dynamic`) | Full shopping bag page |
| `/checkout` | Dynamic (`force-dynamic`) | Checkout form & WhatsApp / pay-on-delivery confirmation |
| `/orders/[token]` | Dynamic (`force-dynamic`) | HMAC-signed order tracking page |
| `/about`, `/how-to-order`, `/shipping`, `/returns`, `/contact` | Static / ISR | Informational & policy pages |
| `error.tsx`, `not-found.tsx`, `loading.tsx` | App boundaries | Storefront error, 404, and loading states |

### Metadata & Asset Routes (`app/*`)
- `/robots.txt` (`app/robots.ts`), `/sitemap.xml` (`app/sitemap.ts`), `/manifest.webmanifest` (`app/manifest.ts`), `/icon` (`app/icon.tsx`), `/apple-icon` (`app/apple-icon.tsx`)

### Auth & Admin (`app/login`, `app/auth/*`, `app/admin/*`)
- `middleware.ts` protects `/admin/:path*`, redirects legacy `/admin/login` → `/login`, and validates the Supabase Auth session against `ADMIN_EMAIL`.
- Admin views: `/admin` (analytics overview), `/admin/products`, `/admin/products/new`, `/admin/products/[id]/edit`, `/admin/categories`, `/admin/orders`, `/admin/invoices`, `/admin/invoices/[id]`.

### API Routes (`app/api/*`)
- **Public / Health:** `GET /api/health` (app + DB connectivity), `GET /api/ready` (full env + DB readiness), `POST /api/checkout`, `GET /api/orders/status/[token]`, `POST /api/revalidate`
- **Admin:** `POST /api/admin/login`, `GET /api/admin/analytics`, CRUD under `/api/admin/categories`, `/api/admin/products`, `/api/admin/orders`, and `POST /api/admin/storage/upload`

---

## Layouts, Client State & Themes

- **Root layout (`app/layout.tsx`):** Loads `Bodoni_Moda` (`--font-display`) and `Geist` (`--font-body`), sets `metadataBase` from `SITE_URL` (`lib/site.ts`), and injects an inline theme initialization script (`auro-ardon-theme`) for flash-free light/dark mode.
- **Storefront layout (`app/(storefront)/layout.tsx`):** Wraps storefront pages in `CartProvider` (`lib/cart.tsx`) and `StorefrontUIProvider` (`components/storefront/storefront-context.tsx`).
- **Client state:** Cart (`auro-ardon-cart`), wishlist, and recently-viewed state currently use React Context backed by `localStorage` with live catalog reconciliation against `listPublicProductIndex()` (no Zustand installed yet).

---

## Database Schema, Migrations, RPCs & RLS

Migrations live under `supabase/migrations/` (with legacy setup scripts retained in `supabase/`):
- **Core tables:**
  - `public.categories` — hierarchical categories (`parent_id`, `slug`, `display_order`)
  - `public.products` — catalog items (`slug`, `category_id`, `price`, `stock_quantity`, detail specs, `images`, `active`, `is_featured`)
  - `public.orders` & `public.order_items` — idempotent order records and line snapshots
  - `public.store_settings` (Phase 0) — singleton store configuration row (business info, WhatsApp number, cutoffs, free-delivery threshold, open/closed banner, invoice copy, WhatsApp message templates)
  - `public.delivery_zones` (Phase 0) — Nairobi & courier delivery zones with authoritative fees and sort order
- **Transactional RPCs (`SECURITY DEFINER`, `service_role`-only):**
  - `public.create_checkout_order(...)` — advisory-locked idempotent order creation with deterministic `ORDER BY p.id ASC FOR UPDATE` row locking and atomic stock decrement
  - `public.update_admin_order(...)` — forward-only status transition enforcement and atomic stock restoration on cancellation
- **RLS posture:**
  - `categories` (`true`), `products` (`active = true`), `store_settings` (`true`), `delivery_zones` (`active = true`) allow public read via anon key.
  - Direct anonymous/authenticated writes to `orders`, `order_items`, `store_settings`, and `delivery_zones` are revoked; mutations run server-side using `SUPABASE_SERVICE_ROLE_KEY`.

---

## Caching, Configuration & Environment Validation

- **`lib/site.ts`:** Single source of truth for `SITE_URL` (from `NEXT_PUBLIC_SITE_URL`, defaulting to `https://aura-ardon.vercel.app`, never using `VERCEL_URL`), `SITE_NAME`, `DEFAULT_STORE_CONFIG`, and `DEFAULT_DELIVERY_ZONES`.
- **`lib/env.ts` + `lib/env-schema.mjs`:** Zod-validated environment schema enforced at build time (`next.config.mjs`) and server startup (`instrumentation.ts`).
- **Cache tags (`lib/cache.ts`, `lib/data.ts`):** `products`, `featured-products`, `categories`, `store-settings`, and `delivery-zones`. Admin writes revalidate tags immediately; `POST /api/revalidate` supports Supabase webhooks and manual revalidation via `Authorization: Bearer <REVALIDATE_SECRET>` or `x-revalidate-secret`.
