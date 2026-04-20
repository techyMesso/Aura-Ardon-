import { NextResponse } from "next/server";
import { z } from "zod";

import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { initiateStkPush } from "@/lib/mpesa";
import { normalizeKenyanPhoneNumber, toMoneyString } from "@/lib/utils";

export const runtime = "nodejs";

const checkoutSchema = z.object({
  productId: z.string().uuid(),
  customerPhone: z.string().min(9)
});

interface ProductRow {
  id: string;
  title: string;
  price: string;
  stock_quantity: number;
  [key: string]: unknown;
}

export async function POST(request: Request) {
  try {
    const payload = checkoutSchema.parse(await request.json());
    const customerPhone = normalizeKenyanPhoneNumber(payload.customerPhone);
    const supabase = createAdminSupabaseClient();
    const { data: product, error: productError } = await supabase
      .from("products")
      .select("*")
      .eq("id", payload.productId)
      .single();

    if (productError || !product) {
      throw new Error("The selected jewelry piece could not be found.");
    }

    const productData = product as ProductRow;

    if (productData.stock_quantity < 1) {
      throw new Error("This jewelry piece is currently out of stock.");
    }

    const amount = Math.round(Number(productData.price));

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error("The product price is invalid for M-Pesa checkout.");
    }

    const stkResponse = await initiateStkPush({
      amount,
      phone: customerPhone,
      accountReference: productData.title
    });

    const { error: insertError } = await supabase.from("orders").insert({
      customer_phone: customerPhone,
      total_amount: toMoneyString(Number(productData.price)),
      checkout_request_id: stkResponse.checkoutRequestId,
      status: "pending"
    } as never);

    if (insertError) {
      throw new Error(insertError.message);
    }

    return NextResponse.json(
      {
        checkoutRequestId: stkResponse.checkoutRequestId,
        customerMessage: stkResponse.customerMessage
      },
      { status: 201 }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to initiate M-Pesa checkout.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
