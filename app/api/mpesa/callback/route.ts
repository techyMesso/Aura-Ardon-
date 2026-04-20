import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const callbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional()
            })
          )
        })
        .optional()
    })
  })
});

function findMetadataValue(
  items: Array<{ Name: string; Value?: string | number }>,
  name: string
) {
  return items.find((item) => item.Name === name)?.Value;
}

export async function POST(request: Request) {
  try {
    const payload = callbackSchema.parse(await request.json());
    const callback = payload.Body.stkCallback;
    const supabase = createAdminSupabaseClient();

    if (callback.ResultCode === 0) {
      const metadataItems = callback.CallbackMetadata?.Item ?? [];
      const receipt = findMetadataValue(metadataItems, "MpesaReceiptNumber");

     const { error } = await supabase
       .from("orders")
       .update({
         order_status: "confirmed",
         payment_status: "completed",
         mpesa_receipt_number: typeof receipt === "string" ? receipt : null
       } as never)
       .eq("checkout_request_id", callback.CheckoutRequestID);

      if (error) {
        throw new Error(error.message);
      }
    } else {
      const { error } = await supabase
        .from("orders")
        .update({
          order_status: "cancelled",
          payment_status: "failed"
        } as never)
        .eq("checkout_request_id", callback.CheckoutRequestID);

      if (error) {
        throw new Error(error.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (caughtError) {
    console.error("M-Pesa callback processing failed", caughtError);

    return NextResponse.json(
      {
        error:
          caughtError instanceof Error
            ? caughtError.message
            : "Callback processing failed."
      },
      { status: 400 }
    );
  }
}
