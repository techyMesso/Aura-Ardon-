import { NextResponse } from "next/server";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ checkoutRequestId: string }> }
) {
  try {
    const { checkoutRequestId } = await context.params;
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from("orders")
      .select("order_status, mpesa_receipt_number")
      .eq("checkout_request_id", checkoutRequestId)
      .single();

    if (error) {
      throw new Error("Order not found.");
    }

    // Return as { status: ... } for frontend compatibility
    return NextResponse.json({ 
      status: (data as any).order_status,
      mpesa_receipt_number: (data as any).mpesa_receipt_number 
    });
  } catch (caughtError) {
    return NextResponse.json(
      {
        error:
          caughtError instanceof Error ? caughtError.message : "Unable to read order."
      },
      { status: 404 }
    );
  }
}
