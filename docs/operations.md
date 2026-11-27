# Operations & Monitoring Guide

## Runtime & Health Endpoints
- **Deployment platform:** Vercel (Next.js 15 App Router, `output: "standalone"` also supported for container builds).
- **Liveness & DB Health Probe:** `GET /api/health` — returns HTTP `200` with `{ ok: true, db: "connected" }` when the app and Supabase PostgreSQL are reachable, or HTTP `503` on failure.
- **Readiness Probe:** `GET /api/ready` — verifies required environment variables and live Supabase connectivity.

---

## Uptime Monitoring (Required Before Launch)
Configure an external uptime monitor (e.g., **Better Stack Uptime**, **UptimeRobot**, or **Checkly**) with two checks:

| Check | URL | Interval | Expected Response | Alert Threshold |
| --- | --- | --- | --- | --- |
| **Storefront Home** | `https://aura-ardon.vercel.app/` | Every 1–3 minutes | HTTP `200` + body contains `Auro Ardon` | Alert after 2 consecutive failures |
| **API & Database Health** | `https://aura-ardon.vercel.app/api/health` | Every 1 minute | HTTP `200` + JSON contains `"ok":true` | Alert after 2 consecutive failures |

- **Alert channels:** Owner email (`ORDER_NOTIFY_EMAIL`) and optional SMS/WhatsApp/Push webhook.
- **Recovery check:** Auto-resolve incident after 2 consecutive HTTP `200` responses.

---

## Error Tracking (Sentry with PII Scrubbing)
- Client, server, and edge errors are reported to Sentry when `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` are configured.
- `sendDefaultPii` is explicitly set to `false`, and `lib/sentry-scrub.ts` strips Kenyan phone numbers (`+2547...`, `07...`, `01...`), customer addresses, names, emails, cookies, IP addresses, and auth headers before any event is transmitted.

---

## Structured Logging
- `lib/logger.ts` emits structured JSON logs to `stdout`/`stderr` with automatic redaction of secrets (`pass`, `secret`, `token`, `key`, `authorization`, `cookie`) **and** customer PII (`phone`, `address`, `landmark`, `location`, `email`, `customer_name`).
- Structured `info` events are emitted for all core operational actions:
  - Orders: `order.placed`, `order.status_updated`, `order.cancelled`, `order.returned`
  - Payments & Credit Notes: `payment.recorded`, `credit_note.issued`
  - Stock: `stock.adjusted`, `stock.variant_adjusted`
- Set `LOG_LEVEL=info` in production.

---

## Backups & Recovery
See [docs/BACKUP.md](./BACKUP.md) for Supabase PITR configuration, the automated nightly `pg_dump` workflow (`.github/workflows/nightly-backup.yml`, 30-day retention), and tested restore steps.

---

## Branch Protection & CI Gates
In GitHub Repository → **Settings → Branches → Branch protection rules** for `main`:
1. Enable **Require a pull request before merging**.
2. Enable **Require status checks to pass before merging** and mark these checks required:
   - `Validate (typecheck, lint, unit & integration, build)`
   - `Playwright E2E (mobile + desktop)`
3. Enable **Require branches to be up to date before merging**.

---

## Cache Revalidation
- `POST /api/revalidate` accepts authentication exclusively via `x-revalidate-secret` or `Authorization: Bearer <secret>` headers (never query parameters).
- Product, category, review, and settings edits in `/admin` automatically revalidate ISR tags (`products`, `featured-products`, `categories`, `reviews`, `store-settings`, `delivery-zones`).
