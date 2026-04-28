import { NextResponse } from "next/server";

import { hasPublicSupabaseEnv, getOptionalSiteUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const requiresSiteUrl = process.env.NODE_ENV === "production";
  const hasSiteUrl = Boolean(getOptionalSiteUrl());
  const ready =
    hasPublicSupabaseEnv() &&
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    (!requiresSiteUrl || hasSiteUrl);

  if (!ready) {
    logger.error("Readiness probe failed", {
      hasPublicSupabaseEnv: hasPublicSupabaseEnv(),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
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
