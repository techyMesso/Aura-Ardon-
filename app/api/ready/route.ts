import { NextResponse } from "next/server";

import { getOptionalSiteUrl, hasPublicSupabaseEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

async function checkDatabaseConnectivity(timeoutMs = 3000): Promise<boolean> {
  try {
    const supabase = createPublicServerSupabaseClient();
    const query = supabase.from("categories").select("id").limit(1);
    const result = await Promise.race([
      query,
      new Promise<{ error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ error: { message: "Database readiness probe timed out" } }), timeoutMs)
      )
    ]);
    return !result.error;
  } catch {
    return false;
  }
}

export async function GET() {
  const requiresSiteUrl = process.env.NODE_ENV === "production";
  const hasSiteUrl = Boolean(getOptionalSiteUrl());
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const hasAdminEmail = Boolean(process.env.ADMIN_EMAIL?.trim());
  const hasOrderStatusSecret = Boolean(process.env.ORDER_STATUS_TOKEN_SECRET?.trim());

  const envReady =
    hasPublicSupabaseEnv() &&
    hasServiceRoleKey &&
    hasAdminEmail &&
    hasOrderStatusSecret &&
    (!requiresSiteUrl || hasSiteUrl);

  if (!envReady) {
    logger.error("Readiness probe failed: missing environment configuration", {
      hasPublicSupabaseEnv: hasPublicSupabaseEnv(),
      hasServiceRoleKey,
      hasAdminEmail,
      hasOrderStatusSecret,
      requiresSiteUrl,
      hasSiteUrl
    });

    return NextResponse.json(
      {
        ok: false,
        reason: "Missing required runtime configuration"
      },
      { status: 503 }
    );
  }

  const dbReady = await checkDatabaseConnectivity();
  if (!dbReady) {
    logger.error("Readiness probe failed: database unreachable");
    return NextResponse.json(
      {
        ok: false,
        reason: "Database connectivity check failed"
      },
      { status: 503 }
    );
  }

  logger.debug("Readiness probe succeeded");

  return NextResponse.json(
    {
      ok: true,
      service: "auro-ardon-jewelry",
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}
