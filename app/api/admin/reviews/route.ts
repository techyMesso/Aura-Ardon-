import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/auth";
import { listAdminReviews } from "@/lib/data";
import type { ReviewStatus } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set(["all", "pending", "approved", "rejected"]);

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const rawStatus = (searchParams.get("status") ?? "all").toLowerCase();
    const statusFilter = (
      ALLOWED_STATUSES.has(rawStatus) ? rawStatus : "all"
    ) as ReviewStatus | "all";

    const result = await listAdminReviews(statusFilter);
    return NextResponse.json(result);
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to load reviews.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

