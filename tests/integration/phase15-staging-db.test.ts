import fs from "node:fs";
import path from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROD_PROJECT_REF = "bjasoyhcxubrkxrqurfr";
const RUN_STAGING_DB_TESTS = process.env.RUN_STAGING_DB_TESTS === "1";

const STAGING_URL =
  process.env.STAGING_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const STAGING_SERVICE_KEY =
  process.env.STAGING_SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "";
const STAGING_ANON_KEY =
  process.env.STAGING_SUPABASE_ANON_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

describe("Phase 15 staging-DB SQL contract verification (offline-safe)", () => {
  it("verifies atomic RPCs, row locking, idempotency, credit notes, auto-cancel, and RLS lockdown exist in migrations", () => {
    const migrationsDir = path.join(process.cwd(), "supabase", "migrations");
    const sqlFiles = fs
      .readdirSync(migrationsDir)
      .filter(file => file.endsWith(".sql"))
      .sort();
    const combinedSql = sqlFiles
      .map(file => fs.readFileSync(path.join(migrationsDir, file), "utf8"))
      .join("\n");

    expect(combinedSql).toMatch(/create or replace function public\.place_order/i);
    expect(combinedSql).toMatch(/for update/i);
    expect(combinedSql).toMatch(/create or replace function public\.cancel_order/i);
    expect(combinedSql).toMatch(/already_restocked/i);
    expect(combinedSql).toMatch(/create or replace function public\.return_order/i);
    expect(combinedSql).toMatch(
      /create or replace function public\.record_invoice_payment/i
    );
    expect(combinedSql).toMatch(/create or replace function public\.issue_credit_note/i);
    expect(combinedSql).toMatch(
      /create or replace function public\.auto_cancel_stale_pending_orders/i
    );
    expect(combinedSql).toContain("private.is_owner()");
    expect(combinedSql).toMatch(/revoke all on public\.orders from anon/i);
  });
});

describe.runIf(RUN_STAGING_DB_TESTS)(
  "Phase 15 live staging-DB integration suite",
  () => {
    let adminClient: SupabaseClient;
    let anonClient: SupabaseClient;

    beforeAll(() => {
      if (STAGING_URL.includes(PROD_PROJECT_REF)) {
        throw new Error(
          "Refusing to run integration tests against the production Supabase database."
        );
      }
      adminClient = createClient(STAGING_URL, STAGING_SERVICE_KEY, {
        auth: { persistSession: false }
      });
      anonClient = createClient(STAGING_URL, STAGING_ANON_KEY, {
        auth: { persistSession: false }
      });
    });

    const createdCategoryIds: string[] = [];
    const createdProductIds: string[] = [];
    const createdOrderIds: string[] = [];

    afterAll(async () => {
      if (createdOrderIds.length > 0) {
        const { data: invoices } = await adminClient
          .from("invoices")
          .select("id")
          .in("order_id", createdOrderIds);
        const invoiceIds = (invoices ?? []).map(row => row.id as string);
        if (invoiceIds.length > 0) {
          await adminClient.from("payments").delete().in("invoice_id", invoiceIds);
          await adminClient.from("credit_notes").delete().in("invoice_id", invoiceIds);
          await adminClient.from("invoices").delete().in("id", invoiceIds);
        }
        await adminClient.from("order_status_history").delete().in("order_id", createdOrderIds);
        await adminClient.from("stock_movements").delete().in("order_id", createdOrderIds);
        await adminClient.from("order_items").delete().in("order_id", createdOrderIds);
        await adminClient.from("orders").delete().in("id", createdOrderIds);
      }

      if (createdProductIds.length > 0) {
        await adminClient.from("stock_movements").delete().in("product_id", createdProductIds);
        await adminClient.from("products").delete().in("id", createdProductIds);
      }

      if (createdCategoryIds.length > 0) {
        await adminClient.from("categories").delete().in("id", createdCategoryIds);
      }
    });

    async function seedTestProduct(stockQuantity: number) {
      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const { data: cat, error: catErr } = await adminClient
        .from("categories")
        .insert({
          name: `P15 Cat ${suffix}`,
          slug: `p15-cat-${suffix}`,
          description: "Staging integration test category",
          display_order: 999,
          active: true
        })
        .select("id")
        .single();
      if (catErr || !cat) throw new Error(catErr?.message ?? "Failed to seed category");
      createdCategoryIds.push(cat.id as string);

      const { data: prod, error: prodErr } = await adminClient
        .from("products")
        .insert({
          title: `P15 Ring ${suffix}`,
          slug: `p15-ring-${suffix}`,
          description: "Staging integration test product",
          category: "Jewelry",
          category_id: cat.id,
          price: 5000,
          stock_quantity: stockQuantity,
          images: ["https://example.com/ring.jpg"],
          active: true,
          status: "active"
        })
        .select("id")
        .single();
      if (prodErr || !prod) throw new Error(prodErr?.message ?? "Failed to seed product");
      createdProductIds.push(prod.id as string);

      const { data: zone, error: zoneErr } = await adminClient
        .from("delivery_zones")
        .select("id")
        .eq("active", true)
        .eq("is_outside_nairobi", false)
        .limit(1)
        .single();
      if (zoneErr || !zone) throw new Error("No active Nairobi delivery zone found");

      return { productId: prod.id as string, zoneId: zone.id as string };
    }

    it("prevents overselling when two parallel orders race for the last 1 unit", async () => {
      const { productId, zoneId } = await seedTestProduct(1);

      const placePayload = (suffix: string) => ({
        p_customer_name: `Race Buyer ${suffix}`,
        p_customer_phone: suffix === "A" ? "254712100101" : "254712100102",
        p_delivery_zone_id: zoneId,
        p_delivery_address: "Sarit Centre",
        p_town_county: null,
        p_notes: null,
        p_is_gift: false,
        p_gift_note: null,
        p_hide_prices: false,
        p_marketing_opt_in: false,
        p_discount_code: null,
        p_discount_amount: 0,
        p_idempotency_key: `p15-race-${suffix}-${Date.now()}-${Math.random()}`,
        p_items: [{ product_id: productId, quantity: 1 }]
      });

      const [resA, resB] = await Promise.all([
        adminClient.rpc("place_order", placePayload("A")).single(),
        adminClient.rpc("place_order", placePayload("B")).single()
      ]);

      const successes = [resA, resB].filter(r => !r.error && r.data);
      const failures = [resA, resB].filter(r => Boolean(r.error));

      for (const s of successes) {
        const orderId = (s.data as { order_id?: string } | null)?.order_id;
        if (orderId) createdOrderIds.push(orderId);
      }

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      expect(failures[0]?.error?.message).toMatch(/sold out|Insufficient stock/i);

      const { data: updatedProduct } = await adminClient
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      expect(updatedProduct?.stock_quantity).toBe(0);
    });

    it("enforces cancel idempotency, invoice payments, return + credit note, and backdated auto-cancel", async () => {
      const { productId, zoneId } = await seedTestProduct(2);

      // 1. Place & cancel twice -> stock restores strictly once back to 2
      const { data: ord1, error: ord1Err } = await adminClient
        .rpc("place_order", {
          p_customer_name: "Cancel Buyer",
          p_customer_phone: "254712200201",
          p_delivery_zone_id: zoneId,
          p_delivery_address: "Westgate",
          p_town_county: null,
          p_notes: null,
          p_is_gift: false,
          p_gift_note: null,
          p_hide_prices: false,
          p_marketing_opt_in: false,
          p_discount_code: null,
          p_discount_amount: 0,
          p_idempotency_key: `p15-cancel-${Date.now()}`,
          p_items: [{ product_id: productId, quantity: 1 }]
        })
        .single();
      expect(ord1Err).toBeNull();
      const order1Id = (ord1 as { order_id: string }).order_id;
      createdOrderIds.push(order1Id);

      const firstCancel = await adminClient
        .rpc("cancel_order", {
          p_order_id: order1Id,
          p_reason: "customer_cancelled",
          p_note: "First cancel",
          p_changed_by: "p15-integration"
        })
        .single();
      const secondCancel = await adminClient
        .rpc("cancel_order", {
          p_order_id: order1Id,
          p_reason: "customer_cancelled",
          p_note: "Duplicate cancel",
          p_changed_by: "p15-integration"
        })
        .single();

      expect(firstCancel.error).toBeNull();
      expect(secondCancel.error).toBeNull();
      expect((secondCancel.data as { already_restocked: boolean }).already_restocked).toBe(true);

      const { data: stockAfterCancel } = await adminClient
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      expect(stockAfterCancel?.stock_quantity).toBe(2);

      // 2. Confirm -> invoice auto-issued -> partial + full payment -> delivered -> return -> credit note
      const { data: ord2, error: ord2Err } = await adminClient
        .rpc("place_order", {
          p_customer_name: "Invoice Buyer",
          p_customer_phone: "254712200202",
          p_delivery_zone_id: zoneId,
          p_delivery_address: "Yaya Centre",
          p_town_county: null,
          p_notes: null,
          p_is_gift: false,
          p_gift_note: null,
          p_hide_prices: false,
          p_marketing_opt_in: false,
          p_discount_code: null,
          p_discount_amount: 0,
          p_idempotency_key: `p15-inv-${Date.now()}`,
          p_items: [{ product_id: productId, quantity: 1 }]
        })
        .single();
      expect(ord2Err).toBeNull();
      const order2Id = (ord2 as { order_id: string; total: number }).order_id;
      const order2Total = Number((ord2 as { total: number }).total);
      createdOrderIds.push(order2Id);

      await adminClient.rpc("set_order_status", {
        p_order_id: order2Id,
        p_to_status: "confirmed",
        p_changed_by: "p15-integration",
        p_reason: "Confirm"
      });

      const { data: invoice } = await adminClient
        .from("invoices")
        .select("id, invoice_number, status")
        .eq("order_id", order2Id)
        .single();
      expect(invoice?.invoice_number).toMatch(/^INV-\d{4}-\d{4,}$/);

      const mpesaRef = `P15${Date.now().toString().slice(-8)}`.toUpperCase();
      await adminClient.rpc("record_invoice_payment", {
        p_invoice_id: invoice!.id,
        p_amount: 2000,
        p_method: "mpesa",
        p_mpesa_code: mpesaRef,
        p_received_by: "Rider A",
        p_paid_at: new Date().toISOString(),
        p_note: "Partial",
        p_created_by: "p15-integration"
      });

      const { data: partPaid } = await adminClient
        .from("invoices")
        .select("status")
        .eq("id", invoice!.id)
        .single();
      expect(partPaid?.status).toBe("partially_paid");

      await adminClient.rpc("record_invoice_payment", {
        p_invoice_id: invoice!.id,
        p_amount: order2Total - 2000,
        p_method: "cash",
        p_mpesa_code: null,
        p_received_by: "Rider A",
        p_paid_at: new Date().toISOString(),
        p_note: "Final",
        p_created_by: "p15-integration"
      });

      const { data: paid } = await adminClient
        .from("invoices")
        .select("status")
        .eq("id", invoice!.id)
        .single();
      expect(paid?.status).toBe("paid");

      await adminClient.rpc("set_order_status", {
        p_order_id: order2Id,
        p_to_status: "dispatched",
        p_changed_by: "p15-integration",
        p_reason: "Dispatch"
      });
      await adminClient.rpc("set_order_status", {
        p_order_id: order2Id,
        p_to_status: "delivered",
        p_changed_by: "p15-integration",
        p_reason: "Deliver"
      });

      const { data: orderItems } = await adminClient
        .from("order_items")
        .select("id")
        .eq("order_id", order2Id);
      const returnRes = await adminClient.rpc("return_order", {
        p_order_id: order2Id,
        p_items: [{ order_item_id: orderItems![0].id, quantity: 1 }],
        p_condition: "resellable",
        p_note: "Integration return",
        p_changed_by: "p15-integration"
      });
      expect(returnRes.error).toBeNull();

      // Over-return must fail
      const duplicateReturn = await adminClient.rpc("return_order", {
        p_order_id: order2Id,
        p_items: [{ order_item_id: orderItems![0].id, quantity: 1 }],
        p_condition: "resellable",
        p_note: "Duplicate return",
        p_changed_by: "p15-integration"
      });
      expect(duplicateReturn.error?.message).toMatch(/Cannot return/i);

      const { data: creditNotes } = await adminClient
        .from("credit_notes")
        .select("credit_note_number")
        .eq("invoice_id", invoice!.id);
      expect((creditNotes ?? []).length).toBeGreaterThanOrEqual(1);
      expect(creditNotes![0].credit_note_number).toMatch(/^CN-\d{4}-\d{4,}$/);

      // 3. Backdated pending order auto-cancels and restores stock
      const { data: ord3 } = await adminClient
        .rpc("place_order", {
          p_customer_name: "Stale Buyer",
          p_customer_phone: "254712200203",
          p_delivery_zone_id: zoneId,
          p_delivery_address: "Lavington",
          p_town_county: null,
          p_notes: null,
          p_is_gift: false,
          p_gift_note: null,
          p_hide_prices: false,
          p_marketing_opt_in: false,
          p_discount_code: null,
          p_discount_amount: 0,
          p_idempotency_key: `p15-stale-${Date.now()}`,
          p_items: [{ product_id: productId, quantity: 1 }]
        })
        .single();
      const order3Id = (ord3 as { order_id: string }).order_id;
      createdOrderIds.push(order3Id);

      const backdatedIso = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
      await adminClient
        .from("orders")
        .update({ created_at: backdatedIso })
        .eq("id", order3Id);

      const autoCancel = await adminClient.rpc("auto_cancel_stale_pending_orders");
      expect(autoCancel.error).toBeNull();

      const { data: staleAfter } = await adminClient
        .from("orders")
        .select("status")
        .eq("id", order3Id)
        .single();
      expect(staleAfter?.status).toBe("cancelled");

      const { data: finalStock } = await adminClient
        .from("products")
        .select("stock_quantity")
        .eq("id", productId)
        .single();
      expect(finalStock?.stock_quantity).toBe(2);
    });

    it("denies anon access to private tables via RLS", async () => {
      for (const table of ["orders", "invoices", "payments", "audit_log", "admin_users"]) {
        const { data, error } = await anonClient.from(table).select("id").limit(1);
        const denied = Boolean(error) || (Array.isArray(data) && data.length === 0);
        expect(denied, `Expected anon to be denied on ${table}`).toBe(true);
      }
    });
  }
);

