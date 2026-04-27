# Auro Ardon Jewelry

Production-ready Next.js + Supabase storefront for a jewelry and accessories brand, with WhatsApp-assisted checkout, cash-on-delivery support, and a protected admin dashboard for catalog and order management.

## Overview

This project powers an e-commerce storefront built for simple, mobile-friendly ordering:

- Customers browse products by category
- Products can be added to a cart and checked out without account creation
- Orders are submitted through a transactional Supabase checkout flow
- Customers can choose `CASH_ON_DELIVERY` or `WHATSAPP`
- Admins manage products, categories, analytics, inventory, and orders from a protected dashboard

## Tech Stack

- `Next.js 15` with App Router
- `React 19`
- `TypeScript`
- `Tailwind CSS`
- `Supabase` for database, auth, and storage
- `Zod` for request validation
- `Vitest` for unit, integration, and stress tests

## Core Features

- Public storefront with category pages and product detail pages
- Cart and checkout experience optimized for lightweight ordering
- WhatsApp order confirmation links with encoded order details
- Transactional checkout RPC in Supabase to prevent overselling
- Idempotent checkout via `Idempotency-Key`
- Rate limiting on sensitive routes
- Magic-link based admin login tied to a single configured admin email
- Protected admin APIs for products, categories, orders, analytics, and image uploads
- Health and readiness endpoints for deployment platforms
- Structured JSON logging with basic secret redaction

## Project Structure

```text
app/
  (storefront)/           Public storefront pages
  admin/                  Admin dashboard pages
  api/                    Route handlers for checkout, admin, health, readiness
  auth/                   Supabase auth callback and signout routes
components/
  admin/                  Admin UI components
  storefront/             Storefront UI components
  auth/                   Login form
lib/
  supabase/               Browser, server, and admin Supabase clients
  auth.ts                 Admin session guards
  data.ts                 Public/admin data access helpers
  env.ts                  Required environment variable helpers
  logger.ts               Structured logger
supabase/
  schema.sql              Main schema + RLS + checkout RPC
  normalize-order-schema.sql
  add-safe-checkout-rpc.sql
tests/
  unit/                   Utility and business-rule tests
  integration/            API route tests
  stress/                 Checkout stress tests
docs/
  operations.md           Runtime and ops notes
```

## Environment Variables

Copy `.env.production.example` or `.env.local.example` and fill in the values.

### Required

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key used by browser/public server clients |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | WhatsApp number used to generate `wa.me` links |
| `ADMIN_EMAIL` | Only this email address can access the admin area |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for admin operations and secure checkout writes |
| `ORDER_STATUS_TOKEN_SECRET` | Secret used to sign order status tokens |

### Recommended production variables

| Variable | Purpose |
| --- | --- |
| `NODE_ENV` | Set to `production` |
| `NEXT_TELEMETRY_DISABLED` | Disable Next.js telemetry in production |
| `LOG_LEVEL` | Logging verbosity, typically `info` |
| `APP_ENV` | App environment label for logs |
| `SENTRY_DSN` | Optional Sentry DSN |
| `SENTRY_ENVIRONMENT` | Optional Sentry environment |
| `SENTRY_RELEASE` | Optional Sentry release version |

### Security model

- `NEXT_PUBLIC_*` variables are exposed to the client bundle by design
- Only the Supabase anon key should ever be public
- `SUPABASE_SERVICE_ROLE_KEY` must never be exposed in client components
- Server-only secrets are read through [lib/env.ts](./lib/env.ts)

## Supabase Setup

This app depends on both schema and policy configuration in Supabase.

### What must exist

- Tables: `categories`, `products`, `orders`, `order_items`
- Enums: `order_status`, `payment_method`, `payment_status`
- Storage bucket: `product-images`
- Public read policy for product images
- RLS policies for storefront reads
- RPC function: `create_checkout_order`

### Recommended setup path

Apply these SQL files in Supabase SQL Editor:

1. `supabase/normalize-order-schema.sql`
2. `supabase/add-safe-checkout-rpc.sql`

For fresh environments, you can instead use:

1. `supabase/schema.sql`

### RLS expectations

The schema is designed so that:

- Public users can read categories
- Public users can read active products
- Order creation is handled through the transactional checkout path
- Privileged admin operations run through the service-role client on the server

## Local Development

### Prerequisites

- Node.js 20+
- npm
- A Supabase project

### Install

```bash
npm ci
```

### Configure environment

```bash
cp .env.local.example .env.local
```

Then update `.env.local` with real values.

### Start the app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run typecheck
npm run lint
npm run test
npm run test:watch
npm run test:stress
```

## Checkout Flow

The checkout flow is intentionally strict because inventory and order creation are production-sensitive.

### Request path

`POST /api/checkout`

### Protections built in

- Zod payload validation
- Rate limiting
- Required `Idempotency-Key` header
- Transactional RPC for stock checks and writes
- Timeout protection around the database call
- Signed order status token generation

### Successful response includes

- `orderId`
- `subtotal`
- `shippingFee`
- `total`
- `whatsappUrl`
- `orderStatusToken`
- `replayed`

## Admin Access

Admin access is protected in two layers:

1. User must authenticate through Supabase magic link
2. Authenticated user email must match `ADMIN_EMAIL`

Relevant routes:

- `POST /api/admin/login`
- `GET /auth/callback`
- `/admin/*`

Admin APIs are protected through `assertAdminRequest()` in [lib/auth.ts](./lib/auth.ts).

## API Surface

### Public

- `POST /api/checkout`
- `GET /api/orders/status/[token]`
- `GET /api/health`
- `GET /api/ready`

### Admin

- `POST /api/admin/login`
- `GET|POST /api/admin/categories`
- `GET|PATCH|DELETE /api/admin/categories/[id]`
- `POST /api/admin/products`
- `PATCH|DELETE /api/admin/products/[id]`
- `GET /api/admin/orders`
- `GET|PATCH /api/admin/orders/[id]`
- `GET /api/admin/analytics`
- `POST /api/admin/storage/upload`

## Image Uploads

Admin product image uploads go through Supabase Storage:

- Bucket name: `product-images`
- File validation is enforced server-side
- Unsupported MIME types and oversized uploads are rejected
- Public URLs are returned after successful upload

## Health and Operations

Operational endpoints:

- `GET /api/health` for liveness
- `GET /api/ready` for readiness

Additional runtime notes are documented in [docs/operations.md](./docs/operations.md).

## Deployment

### Vercel

Before deploying to Vercel:

1. Add all required environment variables
2. Apply the required Supabase schema and RPC migrations
3. Confirm the admin email is correct
4. Confirm the WhatsApp number is production-ready
5. Run a production build locally:

```bash
npm run build
```

### Docker

This repo includes a multi-stage `Dockerfile` using Next.js standalone output.

Basic container flow:

```bash
docker build -t auro-ardon-jewelry .
docker run -p 3000:3000 --env-file .env.production auro-ardon-jewelry
```

## Testing

The test suite includes:

- Unit tests for utility logic
- Integration tests for checkout route behavior
- Stress tests for repeated checkout attempts

Run all tests:

```bash
npm run test
```

Run checkout stress tests only:

```bash
npm run test:stress
```

## Logging

The app emits structured JSON logs through [lib/logger.ts](./lib/logger.ts).

- `LOG_LEVEL` controls verbosity
- Sensitive keys such as `secret`, `token`, `key`, `authorization`, `cookie`, and `pass` are redacted

## Notes for Maintainers

- Keep service-role usage server-only
- Do not expose admin credentials or service keys in client code
- Keep Supabase schema changes in versioned SQL files under `supabase/`
- Treat checkout, inventory, and admin routes as production-critical code paths

## License

Private project. All rights reserved unless the repository owner states otherwise.
