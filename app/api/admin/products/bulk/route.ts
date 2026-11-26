import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { productStatusSchema } from "@/lib/admin-product-input";
import { revalidateProductCatalog } from "@/lib/cache";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const bulkEditSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    productIds: z.array(z.string().uuid()).min(1, "Select at least one product.").max(200),
    status: productStatusSchema
  }),
  z.object({
    action: z.literal("price_set"),
    productIds: z.array(z.string().uuid()).min(1, "Select at least one product.").max(200),
    price: z.coerce.number().positive("Price must be above zero.")
  }),
  z.object({
    action: z.literal("price_adjust_percent"),
    productIds: z.array(z.string().uuid()).min(1, "Select at least one product.").max(200),
    percent: z.coerce
      .number()
      .min(-90, "Cannot reduce prices by more than 90%.")
      .max(500, "Cannot increase prices by more than 500%.")
      .refine(v => v !== 0, "Percentage adjustment must be non-zero.")
  }),
  z.object({
    action: z.literal("stock_adjust"),
    productIds: z.array(z.string().uuid()).min(1, "Select at least one product.").max(200),
    change: z.coerce
      .number()
      .int("Stock change must be a whole number.")
      .refine(v => v !== 0, "Stock change must be non-zero."),
    note: z
      .string()
      .trim()
      .min(2, "A note is required for bulk stock adjustments.")
      .max(300)
  })
]);

export async function POST(request: Request) {
  try {
    const adminUser = await assertAdminRequest();
    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const payload = bulkEditSchema.parse(await request.json());
    const supabase = createAdminSupabaseClient();

    if (payload.action === "status") {
      const { error } = await supabase
        .from("products")
        .update({
          status: payload.status,
          active: payload.status === "active"
        } as never)
        .in("id", payload.productIds);

      if (error) throw new Error(error.message);
      revalidateProductCatalog();
      return NextResponse.json({
        ok: true,
        updatedCount: payload.productIds.length
      });
    }

    if (payload.action === "price_set" || payload.action === "price_adjust_percent") {
      const { data: rows, error: fetchError } = await supabase
        .from("products")
        .select("id, price, compare_at_price")
        .in("id", payload.productIds);

      if (fetchError) throw new Error(fetchError.message);

      const typedRows = (rows ?? []) as Array<{
        id: string;
        price: string | number;
        compare_at_price: string | number | null;
      }>;

      let updatedCount = 0;
      for (const row of typedRows) {
        const nextPrice =
          payload.action === "price_set"
            ? payload.price
            : Math.max(1, Math.round(Number(row.price) * (1 + payload.percent / 100)));

        const currentCompareAt =
          row.compare_at_price != null ? Number(row.compare_at_price) : null;
        const nextCompareAt =
          currentCompareAt !== null && currentCompareAt > nextPrice
            ? toMoneyString(currentCompareAt)
            : null;

        const { error: updateErr } = await supabase
          .from("products")
          .update({
            price: toMoneyString(nextPrice),
            compare_at_price: nextCompareAt
          } as never)
          .eq("id", row.id);

        if (updateErr) throw new Error(updateErr.message);
        updatedCount += 1;
      }

      revalidateProductCatalog();
      return NextResponse.json({ ok: true, updatedCount });
    }

    // action === "stock_adjust": strictly through adjust_product_stock ledger RPC
    const failures: Array<{ productId: string; error: string }> = [];
    let updatedCount = 0;

    for (const productId of payload.productIds) {
      const { error } = await supabase
        .rpc("adjust_product_stock" as never, {
          p_product_id: productId,
          p_change: payload.change,
          p_note: `Bulk edit: ${payload.note}`,
          p_changed_by: actor,
          p_type: "manual_adjustment"
        } as never)
        .single();

      if (error) {
        failures.push({ productId, error: error.message });
      } else {
        updatedCount += 1;
      }
    }

    revalidateProductCatalog();

    if (updatedCount === 0 && failures.length > 0) {
      return NextResponse.json(
        {
          error: failures[0].error,
          failures
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      updatedCount,
      failures
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid bulk action payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to complete bulk edit.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

