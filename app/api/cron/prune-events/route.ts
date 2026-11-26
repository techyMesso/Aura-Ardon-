import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorizedCronRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return false;

  const authHeader = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;

  const provided = authHeader.slice(prefix.length).trim();
  const expectedBuffer = Buffer.from(configuredSecret, "utf8");
  const providedBuffer = Buffer.from(provided, "utf8");
  if (expectedBuffer.length !== providedBuffer.length) return false;

  return timingSafeEqual(expectedBuffer, providedBuffer);
}

async function runPruneEvents(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  try {
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 12);
    const cutoffIso = cutoff.toISOString();

    const supabase = createAdminSupabaseClient();
    const { count, error } = await supabase
      .from("events")
      .delete({ count: "exact" })
      .lt("created_at", cutoffIso);

    if (error) {
      throw new Error(error.message);
    }

    const deletedCount = count ?? 0;
    logger.info("Pruned analytics events older than 12 months", {
      deletedCount,
      cutoffIso,
      durationMs: Date.now() - startedAt
    });

    return NextResponse.json({
      ok: true,
      deletedCount,
      cutoffIso
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to prune events.";
    logger.error("Analytics event pruning cron failed", {
      error: message,
      durationMs: Date.now() - startedAt
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return runPruneEvents(request);
}

export async function POST(request: Request) {
  return runPruneEvents(request);
}

