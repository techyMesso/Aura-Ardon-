import { NextResponse } from "next/server";

import { hasPublicSupabaseEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  const ready = hasPublicSupabaseEnv() && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!ready) {
    logger.error("Readiness probe failed", {
      hasPublicSupabaseEnv: hasPublicSupabaseEnv(),
      hasServiceRoleKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
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

