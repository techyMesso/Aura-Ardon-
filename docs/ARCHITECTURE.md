# Auro Ardon Jewelry — Scalable Production Architecture

## Request Path & System Topology

```text
┌────────────────────────────────────────────────────────────────────────────┐
│                             Browser / Client                               │
│  • React Cart Context + localStorage (`auro-ardon-cart`)                   │
│  • Client-generated `Idempotency-Key` + `submittingRef` double-tap guard   │
└───────────────┬──────────────────────────────────────────┬─────────────────┘
                │                                          │
                │ 1. Static / ISR Pages & Images           │ 2. Dynamic Writes & Status
                ▼                                          ▼
┌─────────────────────────────────────────┐  ┌───────────────────────────────┐
│        Vercel Edge Network / CDN        │  │  Vercel Serverless Functions  │
│  • `/_next/static/*` (immutable cache)  │  │  • `POST /api/checkout`       │
│  • `/_next/image` optimizer             │  │  • `GET /api/orders/status/*` │
│  • ISR pages (`revalidate = 300`):      │  │  • `POST /api/revalidate`     │
│    - `/`                                │  │  • `POST /api/admin/*`        │
│    - `/shop`                            │  └───────┬───────────────┬───────┘
│    - `/shop/[category]`                 │          │               │
│    - `/p/[slug]` (canonical PDP)        │          │               │
└───────────────┬─────────────────────────┘          │               │
                │                                    │               │
                │ Cache Miss / Revalidate            │ Rate Limit    │ PostgREST / RPC
                ▼                                    ▼               ▼
┌─────────────────────────────────────────┐  ┌───────────────┐  ┌────────────────────────────┐
│      Supabase Storage Public CDN        │  │ Upstash Redis │  │ Supabase API & Supavisor   │
│  • Public bucket: `product-images`      │  │  `@upstash/   │  │ Connection Pooler          │
│  • Served via `next/image` with         │  │   ratelimit`  │  │  • Stateless HTTPS clients │
│    WebP / AVIF optimization             │  │  • Sliding    │  │  • `create_checkout_order` │
└─────────────────────────────────────────┘  │    window     │  │    transactional RPC with  │
                                             └───────────────┘  │    advisory lock & RLS     │
                                                                └──────────────┬─────────────┘
                                                                               │
                                                                               ▼
                                                                ┌────────────────────────────┐
                                                                │     Supabase Postgres      │
                                                                │  • `categories` (RLS read) │
                                                                │  • `products` (RLS read)   │
                                                                │  • `orders` & `order_items`│
                                                                └────────────────────────────┘
```

### Key Architectural Pillars

1. **CDN & Image Optimization (`next/image` + Supabase Storage)**
   - Product and category images are served from the public `product-images` Supabase Storage bucket and transformed at the Vercel Edge via `next/image` (`formats: ["image/avif", "image/webp"]`).
   - Only the hero image on `/` and the first row (`priorityCount={4}`) on `/shop` use `priority`; all other product cards, category cards, thumbnails, and cart images use `loading="lazy"` with responsive `sizes`.
   - Static bundles under `/_next/static/*` use Next.js default `public, max-age=31536000, immutable` caching.

2. **Multi-Layer Catalog Caching (ISR + Next.js Data Cache)**
   - Storefront catalog pages (`/`, `/shop`, `/shop/[category]`, `/p/[slug]`) export `revalidate = 300` (5-minute ISR) and pre-generate known category/product slugs via `generateStaticParams()`. Legacy `/shop/[category]/[product]` URLs permanently redirect to `/p/[slug]`.
   - Catalog queries in `lib/data.ts` (`listCategories`, `listPublicProducts`, `listPublicProductIndex`, `listFeaturedProducts`, `listProductsByCategory`, `getProductBySlug`) are wrapped in `unstable_cache` with tag-based invalidation (`"products"`, `"categories"`, `"featured-products"`). Upstream Supabase errors throw inside the cached loader so transient failures are never cached as empty arrays.
   - Transactional routes (`/cart`, `/checkout`, `/orders/[token]`, `/admin/*`, and `/api/*`) remain strictly dynamic (`force-dynamic` / uncached).

3. **Connection Pooling, Stateless Backend & RLS Security**
   - All database traffic uses `@supabase/supabase-js` and `@supabase/ssr` over HTTPS (PostgREST + RPC), routing through Supabase's managed Supavisor connection pooler.
   - Server and service-role Supabase clients (`lib/supabase/server.ts`, `lib/supabase/admin.ts`) are instantiated per request with `persistSession: false`.
   - Direct anonymous `INSERT`/`UPDATE`/`DELETE` on `orders` and `order_items` is revoked; both `public.create_checkout_order` and `public.update_admin_order` are `SECURITY DEFINER` RPCs restricted exclusively to `service_role` with deterministic `ORDER BY p.id ASC FOR UPDATE` row locking (preventing `40P01` deadlocks) and automatic stock restoration on cancellation.

4. **Distributed Rate Limiting (Upstash Redis)**
   - `lib/rate-limit.ts` uses `@upstash/ratelimit` (`Ratelimit.slidingWindow` with `ephemeralCache: false`) backed by `@upstash/redis`.
   - Protected endpoints:
     - `POST /api/checkout`: **5 requests / 10 min per IP** (`checkout:ip:<ip>`) + **5 requests / 10 min per normalized phone** (`checkout:phone:<phone>`).
     - WhatsApp order handoff (`paymentMethod: "WHATSAPP"` in `POST /api/checkout`): **5 requests / 10 min per IP + phone** (`whatsapp-handoff:<ip>:<phone>`).
     - `POST /api/revalidate`: **30 requests / 1 min per IP** (`revalidate:<ip>`).
     - `GET /api/orders/status/[token]`: **30 requests / 5 min per IP** (`order-status:<ip>`).
     - `POST /api/admin/login`: **5 requests / 10 min per IP** (`admin-login:<ip>`).
   - **Graceful Degradation**: When `UPSTASH_REDIS_REST_URL` or `UPSTASH_REDIS_REST_TOKEN` is missing in local development (or if Upstash is unreachable), `checkRateLimit` logs a `console.warn` and fails open rather than crashing requests.

---

## Required Environment Variables

| Variable | Scope | Required | Description |
| :--- | :--- | :--- | :--- |
| `NEXT_PUBLIC_SITE_URL` | Public | Production | Canonical URL (`https://aura-ardon.vercel.app`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Yes | Supabase project URL (`https://<project-ref>.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Yes | Supabase anonymous public API key |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Public | Yes | Merchant WhatsApp number in international digits (e.g. `2547...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server | Yes | Supabase service role key (used only in server routes/RPC) |
| `ADMIN_EMAIL` | Server | Yes | Authorized admin email for `/admin` |
| `ORDER_STATUS_TOKEN_SECRET` | Server | Yes | HMAC secret used to sign customer order status tokens |
| `REVALIDATE_SECRET` | Server | Production | Shared secret for `POST /api/revalidate` webhook authentication |
| `UPSTASH_REDIS_REST_URL` | Server | Production | Upstash Redis REST URL (from Vercel Marketplace integration) |
| `UPSTASH_REDIS_REST_TOKEN` | Server | Production | Upstash Redis REST token (from Vercel Marketplace integration) |
| `SENTRY_DSN` | Server | Optional | Sentry DSN for error reporting |

---

## Triggering Cache Revalidation (`POST /api/revalidate`)

Catalog mutations performed through the built-in `/admin` dashboard automatically call `revalidateProductCatalog()`. To also invalidate the Vercel Data Cache immediately when rows in `public.products` or `public.categories` are edited directly in Supabase Studio or via SQL:

### 1. Manual `curl` Trigger

```bash
curl -X POST "https://aura-ardon.vercel.app/api/revalidate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${REVALIDATE_SECRET}" \
  -d '{"tags": ["products", "categories"]}'
```

### 2. Supabase Database Webhook Setup

1. In the **Supabase Dashboard**, navigate to **Database → Webhooks** and click **Create a new hook**.
2. Configure the webhook:
   - **Name**: `revalidate_storefront_catalog`
   - **Table**: `public.products` (create a second hook for `public.categories` if desired)
   - **Events**: Check `INSERT`, `UPDATE`, and `DELETE`
   - **Type**: `HTTP Request`
   - **Method**: `POST`
   - **URL**: `https://aura-ardon.vercel.app/api/revalidate`
   - **HTTP Headers**:
     - `Content-Type`: `application/json`
     - `x-revalidate-secret`: `<your-REVALIDATE_SECRET-value>`
3. Save the webhook. Supabase will send standard webhook payloads (`{ "type": "UPDATE", "table": "products", "record": { "slug": "..." } }`), which `POST /api/revalidate` inspects to invalidate `"products"`, `"categories"`, `"featured-products"`, and the specific product/category slug tags.
