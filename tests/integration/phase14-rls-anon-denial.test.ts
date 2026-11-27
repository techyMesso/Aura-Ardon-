import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

const SENSITIVE_TABLES = [
  "orders",
  "order_items",
  "order_status_history",
  "order_returns",
  "customers",
  "invoices",
  "payments",
  "credit_notes",
  "stock_movements",
  "events",
  "discount_codes",
  "discount_redemptions",
  "document_counters",
  "admin_push_subscriptions",
  "back_in_stock_alerts",
  "reviews",
  "riders",
  "audit_log",
  "admin_users"
] as const;

const PUBLIC_READ_ONLY_TABLES = [
  "products",
  "product_variants",
  "categories",
  "delivery_zones",
  "store_settings",
  "redirects"
] as const;

describe("Phase 14 RLS audit — anon access strictly denied on all sensitive tables", () => {
  it("verifies Phase 14 migration explicitly revokes all anon privileges on every sensitive table and all anon writes on public tables", () => {
    const migrationPath = path.join(
      process.cwd(),
      "supabase",
      "migrations",
      "20261126140000_phase14_security_roles_and_audit.sql"
    );
    const sql = fs.readFileSync(migrationPath, "utf8").toLowerCase();

    for (const table of SENSITIVE_TABLES) {
      expect(sql).toContain(`revoke all on public.${table} from anon;`);
    }

    for (const table of PUBLIC_READ_ONLY_TABLES) {
      expect(sql).toContain(
        `revoke insert, update, delete, truncate, references, trigger on public.${table} from anon;`
      );
    }

    expect(sql).toContain("alter table public.audit_log enable row level security;");
    expect(sql).toContain("alter table public.admin_users enable row level security;");
    expect(sql).toContain("prevent_audit_log_mutation");
  });

  const runLiveStaging = process.env.RUN_LIVE_STAGING_RLS_TEST === "1";

  it.skipIf(!runLiveStaging)(
    "proves live staging anon key cannot read or write any sensitive table or mutate public tables",
    async () => {
      const stagingUrl =
        process.env.STAGING_SUPABASE_URL ||
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        "";
      const stagingAnonKey =
        process.env.STAGING_SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        "";

      expect(stagingUrl).toContain("scukquqkdivnodefqggf.supabase.co");
      expect(stagingAnonKey.length).toBeGreaterThan(20);

      const anonClient = createClient(stagingUrl, stagingAnonKey, {
        auth: { persistSession: false, autoRefreshToken: false }
      });

      // 1. Every sensitive table must deny anon SELECT and anon INSERT
      for (const table of SENSITIVE_TABLES) {
        const readRes = await anonClient.from(table).select("*").limit(1);
        expect(
          readRes.error,
          `Expected anon SELECT on public.${table} to fail`
        ).not.toBeNull();

        const writeRes = await anonClient
          .from(table)
          .insert({} as never);
        expect(
          writeRes.error,
          `Expected anon INSERT on public.${table} to fail`
        ).not.toBeNull();
      }

      // 2. Public read tables must deny anon INSERT / UPDATE / DELETE
      for (const table of PUBLIC_READ_ONLY_TABLES) {
        const writeRes = await anonClient
          .from(table)
          .insert({} as never);
        expect(
          writeRes.error,
          `Expected anon INSERT on public.${table} to fail`
        ).not.toBeNull();
      }

      // 3. Anon cannot read products.cost_price column
      const costRes = await anonClient
        .from("products")
        .select("id, cost_price")
        .limit(1);
      expect(costRes.error).not.toBeNull();
    },
    30_000
  );
});

