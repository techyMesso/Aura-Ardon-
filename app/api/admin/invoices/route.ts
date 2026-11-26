import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { listAdminInvoices } from "@/lib/data";

export const runtime = "nodejs";

const invoicesQuerySchema = z.object({
  status: z.enum(["all", "unpaid", "partially_paid", "paid", "void"]).optional(),
  method: z.enum(["all", "cash", "mpesa"]).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().max(120).optional(),
  outstanding: z.enum(["true", "false"]).optional()
});

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const query = invoicesQuerySchema.parse({
      status: searchParams.get("status") ?? undefined,
      method: searchParams.get("method") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      outstanding: searchParams.get("outstanding") ?? undefined
    });

    const invoices = await listAdminInvoices({
      status: query.status,
      method: query.method,
      from: query.from,
      to: query.to,
      search: query.search,
      outstandingOnly: query.outstanding === "true"
    });

    return NextResponse.json({ invoices });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid query parameters."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load invoices.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

