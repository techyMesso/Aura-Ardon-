import { NextResponse } from "next/server";

import { listAuditLogs } from "@/lib/audit";
import { assertAdminRequest, getAuthErrorStatus } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await assertAdminRequest({ requiredRole: "owner" });
    const { searchParams } = new URL(request.url);

    const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
    const offset = Number.parseInt(searchParams.get("offset") ?? "0", 10);

    const result = await listAuditLogs({
      entity: searchParams.get("entity") ?? undefined,
      action: searchParams.get("action") ?? undefined,
      actor: searchParams.get("actor") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0
    });

    return NextResponse.json(result);
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to load audit log.";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(message) }
    );
  }
}

