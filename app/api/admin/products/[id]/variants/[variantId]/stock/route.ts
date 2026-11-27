import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateProductCatalog } from "@/lib/cache";
import { listBackInStockAlerts, listProductStockMovements } from "@/lib/data";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const paramsSchema = z.object({
  id: z.string().uuid("Invalid product ID."),
  variantId: z.string().uuid("Invalid variant ID.")
});

const adjustmentSchema = z.object({
  change: z
    .number()
    .int("Adjustment must be a whole number.")
    .refine(value => value !== 0, "Adjustment quantity must be non-zero."),
  note: z
    .string()
    .trim()
    .min(2, "A note is required for every manual stock adjustment.")
    .max(300),
  type: z
    .enum(["manual_adjustment", "damaged_writeoff"])
    .optional()
    .default("manual_adjustment")
});

interface AdjustVariantStockRpcResult {
  variant_id: string;
  product_id: string;
  new_variant_stock: number;
  new_product_stock: number;
  movement_id: string;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; variantId: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id, variantId } = paramsSchema.parse(await context.params);
    const payload = adjustmentSchema.parse(await request.json());

    if (payload.type === "damaged_writeoff" && payload.change > 0) {
      return NextResponse.json(
        { error: "Damaged write-off quantity must be negative." },
        { status: 400 }
      );
    }

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { data, error } = (await supabase
      .rpc("adjust_variant_stock" as never, {
        p_variant_id: variantId,
        p_change: payload.change,
        p_note: payload.note,
        p_changed_by: actor,
        p_type: payload.type
      } as never)
      .single()) as {
      data: AdjustVariantStockRpcResult | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      const msg = error?.message ?? "Unable to adjust variant stock.";
      if (msg.includes("Variant not found")) {
        return NextResponse.json({ error: "Variant not found." }, { status: 404 });
      }
      if (msg.includes("below zero")) {
        return NextResponse.json({ error: msg }, { status: 409 });
      }
      throw new Error(msg);
    }

    revalidateProductCatalog();

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: actor,
        role: adminUser?.adminRole ?? "owner"
      },
      action: "stock.variant_adjusted",
      entity: "stock",
      entityId: variantId,
      after: {
        productId: id,
        variantId,
        change: payload.change,
        newVariantStock: Number(data.new_variant_stock),
        newProductStock: Number(data.new_product_stock),
        type: payload.type,
        note: payload.note
      }
    });

    const [ledger, waitingAlerts] = await Promise.all([
      listProductStockMovements(id).catch(() => null),
      data.new_variant_stock > 0
        ? listBackInStockAlerts({ productId: id, status: "waiting" }).catch(() => [])
        : Promise.resolve([])
    ]);

    const variantAlerts = waitingAlerts.filter(
      alert => alert.variant_id === variantId || alert.variant_id === null
    );

    return NextResponse.json({
      ok: true,
      variantId: data.variant_id,
      productId: data.product_id,
      newVariantStock: Number(data.new_variant_stock),
      newProductStock: Number(data.new_product_stock),
      movementId: data.movement_id,
      waitingAlerts: variantAlerts,
      ...(ledger ?? {})
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid stock adjustment."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to adjust variant stock.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

