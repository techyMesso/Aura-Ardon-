import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { getOrderDetailBundle, getStoreSettings } from "@/lib/data";
import { getAfricasTalkingSmsEnv } from "@/lib/env";
import { formatOrderDisplayNumber } from "@/lib/admin-orders";
import { logger } from "@/lib/logger";
import { renderWhatsAppTemplate } from "@/lib/message-templates";
import { sendAfricasTalkingSms } from "@/lib/notifications";
import { computeOrderAmountToCollect } from "@/lib/riders";
import { SITE_URL } from "@/lib/site";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const idParamSchema = z.object({
  id: z.string().uuid("Invalid order ID.")
});

const statusChangeSchema = z.object({
  status: z.enum(["confirmed", "dispatched", "delivered"]),
  reason: z.string().trim().max(300).optional().nullable(),
  riderId: z.string().uuid("Invalid rider ID.").optional().nullable(),
  riderCost: z.number().min(0, "Rider cost cannot be negative.").max(1_000_000).optional().nullable()
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminUser = await assertAdminRequest();
    const { id } = idParamSchema.parse(await context.params);
    const payload = statusChangeSchema.parse(await request.json());

    const actor = adminUser?.email ?? adminUser?.id ?? "admin";
    const supabase = createAdminSupabaseClient();

    const useDispatchRpc =
      payload.status === "dispatched" &&
      (payload.riderId !== undefined || payload.riderCost !== undefined);

    const { error } = useDispatchRpc
      ? await supabase
          .rpc("dispatch_order" as never, {
            p_order_id: id,
            p_rider_id: payload.riderId ?? null,
            p_rider_cost: payload.riderCost ?? null,
            p_changed_by: actor,
            p_reason: payload.reason ?? null
          } as never)
          .single()
      : await supabase
          .rpc("set_order_status" as never, {
            p_order_id: id,
            p_to_status: payload.status,
            p_changed_by: actor,
            p_reason: payload.reason ?? null
          } as never)
          .single();

    if (error) {
      if (
        error.message.includes("Order not found") ||
        error.message.includes("Rider not found")
      ) {
        return NextResponse.json({ error: error.message }, { status: 404 });
      }
      if (
        error.message.includes("Invalid status transition") ||
        error.message.includes("Use cancel_order") ||
        error.message.includes("Use return_order") ||
        error.message.includes("inactive")
      ) {
        return NextResponse.json({ error: error.message }, { status: 409 });
      }
      throw new Error(error.message);
    }

    const detail = await getOrderDetailBundle(id);
    if (!detail) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    // Optional Africa's Talking status SMS (off by default — gated by env flag + store setting)
    if (getAfricasTalkingSmsEnv().enabledFlag) {
      try {
        const settings = await getStoreSettings();
        if (settings.sms_notifications_enabled) {
          const orderNum = formatOrderDisplayNumber(detail.order);
          const smsMessage = renderWhatsAppTemplate(
            settings.message_templates[payload.status],
            {
              name: detail.order.customer_name,
              order: orderNum,
              total: computeOrderAmountToCollect(detail.order, detail.invoice),
              rider: detail.order.rider_name,
              rider_phone: detail.order.rider_phone,
              track_link: `${SITE_URL}/track`,
              invoice_link: detail.invoice?.share_token
                ? `${SITE_URL}/i/${detail.invoice.share_token}`
                : `${SITE_URL}/track`,
              review_link: `${SITE_URL}/track`
            },
            payload.status
          );
          await sendAfricasTalkingSms({
            to: detail.order.customer_phone,
            message: smsMessage,
            enabledInStoreSettings: true
          });
        }
      } catch {
        // Optional SMS must never fail a status transition
      }
    }

    await recordAuditLog({
      actor: {
        id: adminUser?.id ?? null,
        email: actor,
        role: adminUser?.adminRole ?? "owner"
      },
      action: "order.status_changed",
      entity: "order",
      entityId: id,
      after: {
        status: payload.status,
        riderId: payload.riderId ?? null,
        riderCost: payload.riderCost ?? null,
        reason: payload.reason ?? null
      }
    });

    logger.info("order.status_updated", {
      orderId: id,
      orderNumber: formatOrderDisplayNumber(detail.order),
      status: payload.status,
      riderAssigned: Boolean(payload.riderId),
      actorRole: adminUser?.adminRole ?? "owner"
    });

    return NextResponse.json({ ok: true, ...detail });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid status payload."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to update order status.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

