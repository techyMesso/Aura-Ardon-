import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { revalidateProductCatalog } from "@/lib/cache";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AutoCancelRpcResult {
  cancelled_count: number;
  restocked_units: number;
  cancelled_order_numbers: string[] | null;
}

function isAuthorizedCronRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) {
    return false;
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) {
    return false;
  }

  const provided = authHeader.slice(prefix.length).trim();
  const expectedBuffer = Buffer.from(configuredSecret, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function runAutoCancel(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = (await supabase
      .rpc("auto_cancel_stale_pending_orders" as never)
      .single()) as {
      data: AutoCancelRpcResult | null;
      error: { message: string } | null;
    };

    if (error) {
      throw new Error(error.message);
    }

    const cancelledCount = Number(data?.cancelled_count ?? 0);
    const restockedUnits = Number(data?.restocked_units ?? 0);
    const cancelledOrderNumbers = data?.cancelled_order_numbers ?? [];

    if (cancelledCount > 0) {
      revalidateProductCatalog();
    }

    logger.info("Auto-cancel stale pending orders job completed", {
      cancelledCount,
      restockedUnits,
      cancelledOrderNumbers,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({
      ok: true,
      cancelledCount,
      restockedUnits,
      cancelledOrderNumbers
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Auto-cancel cron failed.";
    logger.error("Auto-cancel stale pending orders job failed", {
      error: message,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runAutoCancel(request);
}

export async function POST(request: Request) {
  return runAutoCancel(request);
}

