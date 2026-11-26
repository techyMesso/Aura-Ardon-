import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/auth";
import { runStockIntegrityCheck } from "@/lib/data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await assertAdminRequest();
    const result = await runStockIntegrityCheck();
    return NextResponse.json(result);
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to run stock integrity check.";
    const status = message === "UNAUTHORIZED" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

