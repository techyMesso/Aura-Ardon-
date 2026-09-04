import { NextResponse, type NextRequest } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { verifyOrderStatusToken } from "@/lib/order-status-token";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

interface OrderStatusRow {
  order_status: string;
  payment_status: string;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const ip = getClientIp(request.headers);
  const rateLimit = checkRateLimit({
    key: `order-status:${ip}`,
    limit: 30,
    windowMs: 5 * 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many status checks. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": `${rateLimit.retryAfterSeconds}`
        }
      }
    );
  }

  try {
    const { token } = await context.params;
    const orderId = verifyOrderStatusToken(token);

    if (!orderId) {
      return NextResponse.json({ error: "Invalid order status token." }, { status: 403 });
    }

    const supabase = createAdminSupabaseClient();
    const response = await supabase
      .from("orders")
      .select("order_status, payment_status")
      .eq("id", orderId)
      .single();

    const data = response.data as OrderStatusRow | null;
    const error = response.error;

    if (error || !data) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    return NextResponse.json({
      orderStatus: data.order_status,
      paymentStatus: data.payment_status
    });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error ? caughtError.message : "Unable to read order status."
      },
      { status: 500 }
    );
  }
}
