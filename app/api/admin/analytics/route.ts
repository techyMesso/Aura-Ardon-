import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/auth";
import { getAdminAnalytics } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() {
  try {
    await assertAdminRequest();
    const analytics = await getAdminAnalytics();

    return NextResponse.json({ analytics });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to load analytics.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;

    return NextResponse.json({ error: message }, { status });
  }
}
