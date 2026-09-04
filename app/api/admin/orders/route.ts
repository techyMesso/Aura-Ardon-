import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { listAdminOrders } from "@/lib/data";

export const runtime = "nodejs";

const ordersQuerySchema = z.object({
  status: z
    .enum([
      "ALL",
      "PENDING_CONFIRMATION",
      "CONFIRMED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED"
    ])
    .optional(),
  search: z.string().trim().max(120).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

export async function GET(request: Request) {
  try {
    await assertAdminRequest();

    const { searchParams } = new URL(request.url);
    const query = ordersQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined
    });

    const orders = await listAdminOrders(query);

    return NextResponse.json({ orders });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid query parameters."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load orders.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
