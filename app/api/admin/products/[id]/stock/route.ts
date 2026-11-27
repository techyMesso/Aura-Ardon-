import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { revalidateProductCatalog } from "@/lib/cache";
import { listBackInStockAlerts, listProductStockMovements } from "@/lib/data";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid product ID.")
});

const stockAdjustmentSchema = z.object({
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

interface AdjustStockRpcResult {
  product_id: string;
  new_stock_quantity: number;
  movement_id: string;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const result = await listProductStockMovements(id);

    if (!result) {
      return NextResponse.json({ error: "Product not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid product ID."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load stock history.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = stockAdjustmentSchema.parse(await request.json());

    if (payload.type === "damaged_writeoff" && payload.change > 0) {
      return NextResponse.json(
        { error: "Damaged write-off quantity must be negative." },
        { status: 400 }
      );
    }

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const { data, error } = (await supabase
      .rpc("adjust_product_stock" as never, {
        p_product_id: id,
        p_change: payload.change,
        p_note: payload.note,
        p_changed_by: actor,
        p_type: payload.type
      } as never)
      .single()) as {
      data: AdjustStockRpcResult | null;
      error: { message: string } | null;
    };

    if (error || !data) {
      const msg = error?.message ?? "Unable to adjust stock.";
      if (msg.includes("Product not found")) {
        return NextResponse.json({ error: "Product not found." }, { status: 404 });
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
      action: "stock.adjusted",
      entity: "stock",
      entityId: id,
      after: {
        productId: id,
        change: payload.change,
        newStockQuantity: Number(data.new_stock_quantity),
        type: payload.type,
        note: payload.note,
        movementId: data.movement_id
      }
    });
    logger.info("stock.adjusted", {
      productId: id,
      movementId: data.movement_id,
      change: payload.change,
      newStockQuantity: Number(data.new_stock_quantity),
      adjustmentType: payload.type
    });

    const [ledger, waitingAlerts] = await Promise.all([
      listProductStockMovements(id),
      Number(data.new_stock_quantity) > 0 && typeof listBackInStockAlerts === "function"
        ? listBackInStockAlerts({ productId: id, status: "waiting" }).catch(() => [])
        : Promise.resolve([])
    ]);

    return NextResponse.json({
      ok: true,
      newStockQuantity: Number(data.new_stock_quantity),
      movementId: data.movement_id,
      waitingAlerts,
      ...(ledger ?? {})
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid stock adjustment."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to adjust stock.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

