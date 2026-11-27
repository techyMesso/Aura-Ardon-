# Backup & Disaster Recovery Runbook (`docs/BACKUP.md`)

This document defines how Auro Ardon protects its PostgreSQL database and Storage assets, and the exact steps to verify and restore backups safely.

> **Golden Rule:** Always test a restore against **staging (`scukquqkdivnodefqggf`)** first. Never run destructive restore commands against production (`bjasoyhcxubrkxrqurfr`) without first taking a fresh snapshot and enabling maintenance / store-closed mode.

---

## 1. Backup Strategy

### Option A — Supabase Point-in-Time Recovery (PITR) *(Preferred when on Supabase Pro + PITR Add-On)*
1. Open the **Supabase Dashboard** → Production project (`bjasoyhcxubrkxrqurfr`) → **Database → Backups**.
2. Enable **Point-in-Time Recovery (PITR)** (WAL archiving to the second, minimum 7–30 day retention).
3. Verify daily snapshots appear healthy in **Database → Backups**.

### Option B — Automated Nightly `pg_dump` with 30-Day Retention *(Active by default on Free/Standard plans)*
When PITR is not enabled on the Supabase plan, [`.github/workflows/nightly-backup.yml`](../.github/workflows/nightly-backup.yml) runs automatically every night at **00:00 UTC (03:00 EAT)**:
1. Executes `pg_dump --format=custom --compress=9 --no-owner --no-acl` against the production direct/session connection string (`PROD_DATABASE_URL` GitHub Actions secret).
2. Uploads the compressed dump (`auro-ardon-YYYY-MM-DD.dump`) to a **private** Supabase Storage bucket (`db-backups`) using `PROD_SUPABASE_URL` and `PROD_SUPABASE_SERVICE_ROLE_KEY`.
3. Lists objects in `db-backups` and deletes dumps older than **30 days**.

#### Required GitHub Secrets for Nightly Backups
Configure these in **GitHub Repository → Settings → Secrets and variables → Actions**:
- `PROD_DATABASE_URL`: PostgreSQL connection string for production (`bjasoyhcxubrkxrqurfr`, Session Pooler or Direct connection).
- `PROD_SUPABASE_URL`: `https://bjasoyhcxubrkxrqurfr.supabase.co`
- `PROD_SUPABASE_SERVICE_ROLE_KEY`: Production service role key (used strictly inside GitHub Actions to upload to the private `db-backups` bucket).

#### Creating the Private `db-backups` Bucket (One-Time Setup)
In Supabase Dashboard → **Storage → New bucket**:
- **Name:** `db-backups`
- **Public bucket:** **OFF** (Private — zero public or `anon`/`authenticated` policies).

---

## 2. Storage Assets Backup (`product-images`, `review-photos`, `invoice-pdfs`)
- `invoice-pdfs` can be regenerated on demand from immutable `invoices`, `payments`, and `credit_notes` rows, so database backups protect invoice records completely.
- `product-images` and `review-photos` should be mirrored monthly (or before major catalog changes) using the Supabase CLI or an S3-compatible sync job into archival object storage.

---

## 3. Step-by-Step Restore Procedure

### A. Restoring via Supabase PITR
1. Put the storefront into **Store Closed** mode in `/admin/settings` (or via Vercel maintenance notice) so no new WhatsApp orders are written during restore.
2. In Supabase Dashboard → **Database → Backups → Point in Time**:
   - Select the target timestamp (UTC / EAT − 3h) just prior to the incident.
   - Prefer restoring into a **new staging branch/project** first to inspect order/invoice counts and stock integrity (`select * from public.check_stock_integrity()`).
3. Once verified, execute the PITR restore on the target project and re-run `GET /api/health` + `GET /api/ready`.

### B. Restoring from a Nightly `pg_dump` File (Test on Staging First!)
1. **Download the dump** from Supabase Dashboard → Storage → `db-backups` → select `auro-ardon-YYYY-MM-DD.dump`.
2. **Verify the dump integrity** locally:
   ```bash
   pg_restore --list auro-ardon-YYYY-MM-DD.dump | head -n 40
   ```
3. **Dry-run restore into Staging (`scukquqkdivnodefqggf`)**:
   ```bash
   pg_restore \
     --clean \
     --if-exists \
     --no-owner \
     --no-acl \
     --schema=public \
     --dbname="$STAGING_DATABASE_URL" \
     auro-ardon-YYYY-MM-DD.dump
   ```
4. **Run post-restore verification queries** on the restored database:
   ```sql
   select count(*) as products from public.products;
   select count(*) as orders from public.orders;
   select count(*) as invoices from public.invoices;
   select count(*) as audit_entries from public.audit_log;
   select * from public.check_stock_integrity();
   ```
   Confirm `check_stock_integrity()` returns **0 rows** (no ledger discrepancies).
5. **Production restore (only after staging verification succeeds):**
   - Enable Store Closed mode in `/admin/settings`.
   - Take an immediate pre-restore safety dump of production (`pg_dump --format=custom --compress=9 --no-owner --no-acl "$PROD_DATABASE_URL" -f pre-restore-safety.dump`).
   - Run `pg_restore` against `$PROD_DATABASE_URL`.
   - Re-verify `GET /api/health`, `GET /api/ready`, `/shop`, and `/admin/orders`, then re-open the store.

---

## 4. Quarterly Restore Drill Checklist
Once per quarter (or after any major schema migration):
- [ ] Trigger `Nightly Database Backup` manually via GitHub Actions → `workflow_dispatch`.
- [ ] Download the generated `.dump` file from the private `db-backups` bucket.
- [ ] Restore into Staging (`scukquqkdivnodefqggf`).
- [ ] Confirm `check_stock_integrity()` returns 0 discrepancies and storefront + admin load cleanly.
- [ ] Record the drill date and result in the owner operations log.

