# Auro Ardon — Production Launch Checklist (`LAUNCH.md`)

This runbook lists every account, configuration, migration, legal, content, and verification step for the store owner to complete before switching **Auro Ardon** live to customers.

> **Business model reminder:** Customers browse the store, place orders via **WhatsApp**, and pay **cash or M-Pesa on delivery**. No online payment gateway is active.
>
> **Safety rule:** Keep **Staging (`scukquqkdivnodefqggf`)** for testing and **Production (`bjasoyhcxubrkxrqurfr`)** strictly for live shoppers. Always push code to `main` and verify staging before running migrations on production.

---

## Pre-Launch Checklist

### 1. Buy the Custom Domain, Connect to Vercel, and Set `NEXT_PUBLIC_SITE_URL`
- [ ] Purchase your production domain (e.g., `auroardon.co.ke` or `auroardon.com`).
- [ ] In **Vercel Dashboard → Project `aura-ardon` → Settings → Domains**:
  - Add both the apex domain (`auroardon.co.ke`) and `www.auroardon.co.ke` (redirect `www` → apex or vice versa).
  - Configure the DNS `A` / `CNAME` records shown by Vercel at your registrar and wait for SSL certificates to provision.
- [ ] In **Vercel → Settings → Environment Variables (Production)**:
  - Set `NEXT_PUBLIC_SITE_URL` to your canonical `https://...` domain **with no trailing slash** (e.g., `https://auroardon.co.ke`).
  - Keep `https://aura-ardon.vercel.app` only until the custom domain is active; never rely on `VERCEL_URL`.
- [ ] In **Supabase Dashboard → Production (`bjasoyhcxubrkxrqurfr`) → Authentication → URL Configuration**:
  - Set **Site URL** to your production domain (`https://auroardon.co.ke`).
  - Add `https://auroardon.co.ke/**` to **Redirect URLs**.
- [ ] Trigger a fresh Production deployment after changing `NEXT_PUBLIC_SITE_URL` so `robots.txt`, `sitemap.xml`, canonical tags, Open Graph images, and JSON-LD all use the live domain.

---

### 2. Add All Production Environment Variables in Vercel
Configure these under **Vercel → Project `aura-ardon` → Settings → Environment Variables**. Keep **Production** pointed strictly at `bjasoyhcxubrkxrqurfr` and **Preview** pointed strictly at Staging (`scukquqkdivnodefqggf`).

#### A. Required Core Variables *(already present in Vercel — verify values match Production before launch)*
| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Production: `https://bjasoyhcxubrkxrqurfr.supabase.co` (Preview: staging URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Production Supabase anon/publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only | Production Supabase service role key (never expose to client) |
| `ADMIN_EMAIL` | Server-only | Owner login email (e.g., `aura.ardoncompany@gmail.com`) |
| `ORDER_STATUS_TOKEN_SECRET` | Server-only | Random 32+ char secret (`openssl rand -hex 32`) for order status/confirmation HMAC tokens |
| `NEXT_PUBLIC_SITE_URL` | Public | Canonical production URL (e.g., `https://auroardon.co.ke`) |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Public | Fallback WhatsApp digits without `+` (e.g., `254718038825`; overridden dynamically by Store Settings) |

#### B. Strongly Recommended for Production *(add in Vercel before launch)*
| Variable | Scope | Purpose |
| --- | --- | --- |
| `CRON_SECRET` | Server-only | Authorizes Vercel Cron calls to `/api/cron/auto-cancel-pending`, `/api/cron/daily-summary`, and `/api/cron/prune-events` (`openssl rand -hex 32`) |
| `REVALIDATE_SECRET` | Server-only | Authorizes `POST /api/revalidate` cache-invalidation webhooks (`openssl rand -hex 32`) |
| `UPSTASH_REDIS_REST_URL` | Server-only | Upstash Redis URL for distributed rate limiting (checkout, login, search, tracking, reviews) |
| `UPSTASH_REDIS_REST_TOKEN` | Server-only | Upstash Redis REST token |
| `RESEND_API_KEY` | Server-only | Resend API key for instant new-order emails and the 20:00 EAT daily summary email |
| `ORDER_NOTIFY_EMAIL` | Server-only | Owner email address receiving new-order alerts and daily summaries |
| `RESEND_FROM_EMAIL` | Server-only | Verified sender address in Resend (e.g., `Auro Ardon <orders@auroardon.co.ke>`) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public | Admin PWA Web Push public key (`npx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | Server-only | Admin PWA Web Push private key |
| `VAPID_SUBJECT` | Server-only | Contact mailto URI for Web Push (e.g., `mailto:aura.ardoncompany@gmail.com`) |
| `NEXT_PUBLIC_SENTRY_DSN` | Public | Sentry DSN for client + server error tracking (PII automatically scrubbed by `lib/sentry-scrub.ts`) |
| `SENTRY_DSN` | Server-only | Optional server/edge override for Sentry DSN |
| `LOG_LEVEL` | Server-only | Set to `info` in production |
| `APP_ENV` | Server-only | Set to `production` |

#### C. Optional Security & Feature Overrides
| Variable | Scope | Default / Purpose |
| --- | --- | --- |
| `OWNER_MFA_REQUIRED` | Server-only | Default `true` — requires TOTP MFA (`aal2`) for owner accounts on `/admin` |
| `ADMIN_SESSION_SECRET` | Server-only | Optional dedicated HMAC key for admin inactivity cookie (falls back to `ORDER_STATUS_TOKEN_SECRET`) |
| `ADMIN_IDLE_TIMEOUT_MINUTES` | Server-only | Optional admin inactivity timeout in minutes (default `30`) |
| `AFRICAS_TALKING_SMS_ENABLED` | Server-only | Default `false` — leave `false` unless you want automated customer SMS on order status updates |
| `AFRICAS_TALKING_API_KEY` | Server-only | Africa's Talking API key (only if SMS enabled) |
| `AFRICAS_TALKING_USERNAME` | Server-only | Africa's Talking username (only if SMS enabled) |
| `AFRICAS_TALKING_SENDER_ID` | Server-only | Registered Kenyan SMS sender ID (only if SMS enabled) |
| `AFRICAS_TALKING_SANDBOX` | Server-only | `false` in production (only if SMS enabled) |

#### D. GitHub Actions Secrets *(Repository → Settings → Secrets and variables → Actions)*
- [ ] `PROD_DATABASE_URL`, `PROD_SUPABASE_URL`, `PROD_SUPABASE_SERVICE_ROLE_KEY` — enables automated nightly `pg_dump` backups with 30-day retention (`.github/workflows/nightly-backup.yml`).
- [ ] `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY` — enables live staging-DB integration & RLS checks on PRs (`.github/workflows/ci-cd.yml`).
- [ ] In **GitHub → Settings → Branches → Branch protection rules** for `main`, require status check **`Validate & E2E`** before merging PRs.

---

### 3. Run Migrations on Production, Create the Owner Account, and Enable MFA
- [ ] **Take a fresh pre-migration backup** of Production (`bjasoyhcxubrkxrqurfr`) first (see `docs/BACKUP.md`).
- [ ] **Push your branch to GitHub** (`git push origin main`) so all commits from Phases 0–16 are live in the repo.
- [ ] **Apply all 15 roadmap migrations in strict chronological order** against Production (`bjasoyhcxubrkxrqurfr`) using `supabase db push` (or the Supabase SQL Editor in order):
  1. `supabase/migrations/20261126000000_baseline_schema.sql`
  2. `supabase/migrations/20261126010000_phase0_store_settings_and_delivery_zones.sql`
  3. `supabase/migrations/20261126020000_phase2_specs_and_search.sql`
  4. `supabase/migrations/20261126030000_phase3_whatsapp_ordering.sql`
  5. `supabase/migrations/20261126040000_phase4_lifecycle_returns_ledger.sql`
  6. `supabase/migrations/20261126050000_phase5_invoices_payments_credit_notes.sql`
  7. `supabase/migrations/20261126060000_phase6_discounts_and_sale_pricing.sql`
  8. `supabase/migrations/20261126070000_phase7_customers_crm_and_anonymisation.sql`
  9. `supabase/migrations/20261126080000_phase8_product_management.sql`
  10. `supabase/migrations/20261126090000_phase9_delivery_and_riders.sql`
  11. `supabase/migrations/20261126100000_phase10_notifications_and_push.sql`
  12. `supabase/migrations/20261126110000_phase11_analytics_and_events.sql`
  13. `supabase/migrations/20261126120000_phase12_real_reviews.sql`
  14. `supabase/migrations/20261126140000_phase14_security_roles_and_audit.sql`
  15. `supabase/migrations/20261126140100_phase14_private_rls_helpers.sql`
- [ ] **Verify production database health:**
  - Run `select * from public.check_stock_integrity();` (must return **0 rows**).
  - Open **Supabase Dashboard → Advisors → Security Advisor** and confirm **0 errors and 0 warnings**.
- [ ] **Create / verify the Owner Auth account** (`aura.ardoncompany@gmail.com`) in **Supabase → Authentication → Users**, and ensure a matching active `role = 'owner'` row exists in `public.admin_users`:
  ```sql
  insert into public.admin_users (user_id, email, role, active)
  select id, lower(email), 'owner', true
  from auth.users
  where lower(email) = lower('aura.ardoncompany@gmail.com')
  on conflict (user_id) do update set role = 'owner', active = true;
  ```
- [ ] **Sign in at `/login` and enrol TOTP MFA** (Google Authenticator / 1Password / Authy) when prompted — verify the account upgrades to `aal2` and can access `/admin/settings`, `/admin/users`, and `/admin/audit`.
- [ ] *(Optional)* Invite any staff members under `/admin/users` with role `staff` and verify they cannot access `/admin/settings`, `/admin/discounts`, `/admin/audit`, `/admin/users`, or cost/profit data.
- [ ] **Configure external uptime monitoring** (Better Stack / UptimeRobot) on `https://<your-domain>/` and `https://<your-domain>/api/health` (see `docs/operations.md`).

---

### 4. Fill In Store Settings, Delivery Zones & Fees, Templates, and Business Details
Sign in to `/admin/settings` (and `/admin/riders`) as the owner and verify every field:
- [ ] **Store identity & contact:** Site name (`Auro Ardon`), WhatsApp number (`254718038825` or updated studio number), official support email (`business_email`), physical studio address (`business_address`), business hours (`Mon–Sat, 9am–7pm EAT`), same-day cutoff (`14:00`), and optional KRA PIN (`kra_pin` — printed on invoices only if filled in).
- [ ] **Operations & thresholds:** Store Open toggle (`is_store_open = true`), free delivery threshold (`free_delivery_threshold`, default `KES 3,000`; set `0` to disable), pending auto-cancel hours (`48`), default low-stock threshold (`3`).
- [ ] **Delivery zones & real fees:** Review all 16 seeded zones (`Westlands`, `Kilimani`, `Lavington`, `Kileleshwa`, `Parklands`, `CBD`, `Upper Hill`, `South B`, `South C`, `Lang'ata`, `Karen`, `Runda`, `Kasarani`, `Thika Road`, `Embakasi`, `Outside Nairobi (courier)`) — replace placeholder fees with your actual rider/courier prices so `/shipping` and `/checkout` stay 100% in sync.
- [ ] **Riders & zone costs:** Add your active Nairobi riders in `/admin/riders` and set internal rider costs per zone for delivery-margin tracking.
- [ ] **WhatsApp message templates:** Review and customize the `confirmed`, `dispatched`, `delivered`, `cancelled`, and `back_in_stock` templates in `/admin/settings`.
- [ ] **Admin PWA & Push notifications:** Open `/admin` on your phone, tap **Add to Home Screen**, and enable push notifications in `/admin/settings` to confirm test alerts arrive.

---

### 5. Review & Publish Privacy/Terms Drafts, Returns Policy, and About Page (`TODO(owner)`)
Every `TODO(owner)` and legal draft marker currently in the codebase is listed below:

- [ ] **Privacy Policy (`app/(storefront)/privacy/page.tsx` & `lib/policies.ts`):**
  - Review the Kenya Data Protection Act, 2019 (Cap. 411C) draft copy with a legal advisor if needed.
  - Confirm registered business name, physical address, dedicated privacy email (via Store Settings), 7-year accounting retention period with your accountant, and 14-day privacy request response timeline.
  - Once approved, remove the `DRAFT` notice and `LEGAL_DRAFT_HTML_COMMENT` from `/privacy`.
- [ ] **Terms & Conditions (`app/(storefront)/terms/page.tsx` & `lib/policies.ts`):**
  - Confirm official registered business name / certificate number and governing law / dispute resolution wording.
  - Once approved, remove the `DRAFT` notice and `LEGAL_DRAFT_HTML_COMMENT` from `/terms`.
- [ ] **Returns & Exchanges (`app/(storefront)/returns/page.tsx` & `lib/policies.ts`):**
  - Confirm `EXCHANGE_WINDOW_DAYS` (currently `7` days), `REFUND_METHOD_COPY` (M-Pesa reversal vs store credit), refund turnaround time, and whether delivery fees are deducted on non-faulty exchanges.
- [ ] **About Page (`app/(storefront)/about/page.tsx` & `lib/policies.ts`):**
  - Drop a real Nairobi studio or team photograph into `/public/` and set `ABOUT_OWNER_SLOTS.studioPhotoPath`.
  - Add your authentic founder story paragraphs in `ABOUT_OWNER_SLOTS.brandStoryParagraphs`.
- [ ] **Store config defaults (`lib/site.ts`):**
  - Confirm `business_email`, `kra_pin`, and delivery fees are configured in `/admin/settings` (or updated in defaults).

---

### 6. Audit Product Catalog, Photos, Alt Text, Specs, and Categories
In `/admin/products` and `/admin/categories`:
- [ ] Replace any placeholder/stock product photos with crisp, real photographs of your physical inventory (uploads automatically strip EXIF/GPS metadata and generate thumbnails).
- [ ] Check the **Catalog Completeness** indicator on every active product:
  - Assigned to an active category (empty categories are automatically hidden on the storefront).
  - At least 2 product photos + descriptive **alt text** on every image.
  - Accurate **KES** retail price, optional `compare_at_price` (for Sale badge), and owner-only `cost_price` (for profit analytics).
  - Real opening **stock quantity** (and per-variant stock/SKU for multi-option items).
  - Category-appropriate specs filled in (jewelry/watches: material, finish, size, care, in-the-box, water resistance/warranty; lip care/beauty: ingredients, net weight/volume, expiry/shelf life).
- [ ] Keep unfinished items in **`draft`** status until ready; confirm no test/dummy products exist in Production.

---

### 7. Test a Real Order End-to-End on Your Phone
Perform one full live test order on a real mobile phone (iOS Safari or Android Chrome) over mobile data:
- [ ] Browse `/` → category page → product page → **Add to bag** → **Checkout**.
- [ ] Verify delivery zone fee, free-delivery threshold, and total in **KES** match `/shipping`.
- [ ] Submit order → confirm order saves as `pending`, stock decreases by 1, and WhatsApp opens natively (`https://wa.me/...`) with the exact pre-filled message.
- [ ] Verify you receive the new-order email (Resend) and/or Admin PWA push alert.
- [ ] Open `/admin/orders` → **Confirm** the order → verify immutable invoice (`INV-YYYY-NNNN`) is auto-issued and `/i/[token]` + A4/80mm PDF download work cleanly.
- [ ] Assign a rider → mark **Dispatched** → check `/track` with the order number + phone number.
- [ ] Record a **Cash** or **M-Pesa** payment on the invoice (verify receipt switches title from `Invoice` to `Receipt` and status to `Paid`).
- [ ] Mark **Delivered** → check `/admin` analytics and Daily Cash-Up report match the order.
- [ ] *(Clean up test data)* Cancel a second throwaway test order before delivery and verify stock is restored to its exact starting count and `select * from public.check_stock_integrity();` returns 0 discrepancies.

---

### 8. Run a Backup Restore Drill on Staging
- [ ] Follow `docs/BACKUP.md`:
  - Either enable **Supabase PITR** (on Pro plans) OR configure the 3 GitHub Secrets and trigger **GitHub Actions → Nightly Database Backup → Run workflow**.
  - Verify the `.dump` file appears in the private `db-backups` bucket in Supabase Storage.
  - Download the `.dump` file and run a test `pg_restore` into **Staging (`scukquqkdivnodefqggf`)** — never Production.
  - Confirm `select * from public.check_stock_integrity();` returns **0 rows** and the storefront + admin load normally.

---

### 9. Set Up Google Search Console, Google Business Profile, and Social Links
- [ ] Create a **Google Search Console** property for your live production domain and verify ownership via DNS TXT record.
- [ ] Submit `https://<your-domain>/sitemap.xml` in Search Console and inspect `/` and a product URL (`/p/...`) to verify clean indexing and valid Product/Organization/FAQ JSON-LD rich results.
- [ ] Create and verify a **Google Business Profile** for **Auro Ardon (Nairobi)** with your business hours, WhatsApp/phone number, delivery area, and website URL.
- [ ] Add your live **Instagram** and **TikTok** profile URLs in `/admin/settings` (social icons appear automatically in the storefront footer once populated).
- [ ] Run a **Lighthouse Mobile** audit on `/`, `/shop`, and `/p/<slug>` against your live production domain and confirm Mobile Performance ≥ 90 with zero CLS and zero console errors.

---

### 10. Decide on Marketing Pixels Before Running Paid Ads
- [ ] Before launching paid Instagram/Facebook or TikTok ad campaigns, decide whether to add a **Meta Pixel** and/or **TikTok Pixel** (tracking `PageView`, `ViewContent`, `AddToCart`, `InitiateCheckout`, and WhatsApp order lead events).
- [ ] If you add any third-party ad pixel later, remember to:
  1. Allowlist its script/connect domains explicitly in `lib/security-headers.mjs` (CSP).
  2. Update `/privacy` to disclose the pixel and cookie/tracking consent under Kenya's Data Protection Act, 2019.

---

### 11. Kenya Tax (KRA / eTIMS) & Data Protection (ODPC) Compliance Check
- [ ] **KRA & eTIMS:** Consult KRA or your Kenyan accountant regarding whether your annual turnover/business structure requires **eTIMS** electronic tax invoice transmission.
  - Invoices already use non-tax titles (`Invoice` / `Receipt` — never `Tax Invoice`) and include an `etims_invoice_number` reference column and optional `kra_pin` field in Store Settings so you are ready when/if eTIMS registration applies.
- [ ] **ODPC (Office of the Data Protection Commissioner):** Check whether Auro Ardon is required to register as a **Data Controller** with the ODPC under the Kenya Data Protection Act, 2019 (registration portal: `https://www.odpc.go.ke`) based on your business turnover and customer data processing.

---

## Scheduled Jobs Reference (`vercel.json` & GitHub Actions)

All Vercel Crons require `CRON_SECRET` set in Vercel Production env vars (`Authorization: Bearer <CRON_SECRET>`):

| Job | Schedule (UTC) | Nairobi Time (EAT) | Endpoint / Workflow | Purpose |
| --- | --- | --- | --- | --- |
| **Auto-Cancel Stale Pending Orders** | `0 * * * *` (hourly) | Every hour on `:00` | `GET /api/cron/auto-cancel-pending` (`vercel.json`) | Cancels `pending` orders older than `pending_auto_cancel_hours` (default 48h) and restocks reserved units |
| **Daily Sales Summary** | `0 17 * * *` (daily) | **20:00 EAT** daily | `GET /api/cron/daily-summary` (`vercel.json`) | Emails & pushes today's orders, booked vs collected revenue, cash to collect, and low-stock count |
| **Analytics Event Pruning** | `0 2 * * 0` (weekly Sun) | Sunday **05:00 EAT** | `GET /api/cron/prune-events` (`vercel.json`) | Deletes raw storefront analytics events older than 180 days |
| **Nightly Database Backup** | `0 0 * * *` (daily) | **03:00 EAT** daily | `.github/workflows/nightly-backup.yml` | Runs compressed `pg_dump` to private `db-backups` bucket and prunes backups older than 30 days |

---

## Roadmap Definition-of-Done Verification Summary

- [x] **CI & Quality Gates:** `npm run lint`, `npm run typecheck`, `npm run test` (43 test files / 185 tests), `npm run build` + client secret scan, and Playwright Desktop + Mobile E2E (10/10) wired in `.github/workflows/ci-cd.yml`.
- [x] **SEO & Canonical URLs:** `robots.txt`, `sitemap.xml`, canonical links, OG tags, and JSON-LD (`Organization`, `Product`, `BreadcrumbList`, `FAQPage`) strictly derive from `SITE_URL`.
- [x] **Storefront Completeness:** Empty categories hidden; `/wishlist`, `/track`, `/faq`, `/shipping`, `/returns`, `/about`, `/privacy`, `/terms`, and branded 404 live; `/shipping` and `/checkout` share the same `delivery_zones` source.
- [x] **Atomic WhatsApp Ordering & Concurrency:** Server-computed totals (items, discounts, delivery), `FOR UPDATE` stock reservation preventing overselling on last unit, exact `wa.me` URLs under 1,800 chars, idempotency keys, and cash/M-Pesa-on-delivery messaging throughout.
- [x] **Order Lifecycle, Returns & Ledger:** Idempotent cancel restock, resellable vs damaged returns, immutable `stock_movements` ledger, `check_stock_integrity()`, and hourly auto-cancel cron.
- [x] **Immutable Invoicing & Payments:** Concurrency-safe `INV-YYYY-NNNN` & `CN-YYYY-NNNN` numbering, immutable financial records, A4 & 80mm PDF rendering, expiring/revocable `/i/[token]` share links (404 when invalid/expired/revoked), and cash/M-Pesa payment reconciliation.
- [x] **Reporting & Analytics:** Daily Cash-Up, Monthly Financial Summary + CSV/PDF, and `/admin` Analytics KPIs excluding cancelled orders from revenue.
- [x] **Server-Side Discounts & Free Delivery:** Discount codes validated and calculated exclusively inside Postgres.
- [x] **Security, Roles, MFA & Audit Log:** Owner vs Staff enforcement in RLS (`private.*` helpers), middleware, pages, and APIs; zero `anon` access to private tables; owner TOTP MFA (`aal2`), inactivity session timeout, strict CSP, EXIF stripping, build-time secret scanner, and immutable `audit_log` on every admin write.
- [x] **Monitoring, Backups & Accessibility:** Sentry client/server/edge with PII scrubbing, PII-redacted structured logs, nightly `pg_dump` + `docs/BACKUP.md`, WCAG 2.1 AA contrast, visible focus, screen-reader error announcements, and `prefers-reduced-motion`.

