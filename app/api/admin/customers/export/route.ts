import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/auth";
import { buildOptedInCustomersCsv } from "@/lib/customers";
import { listOptedInCustomers } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertAdminRequest();
    const optedIn = await listOptedInCustomers();
    const csv = buildOptedInCustomersCsv(optedIn);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="auro-ardon-opted-in-customers.csv"',
        "Cache-Control": "private, no-store"
      }
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to export opted-in customers.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

