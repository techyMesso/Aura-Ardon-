import { NextResponse } from "next/server";

import { hasPublicSupabaseEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createPublicServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEALTH_DB_TIMEOUT_MS = 3000;

async function pingDatabase(timeoutMs = HEALTH_DB_TIMEOUT_MS): Promise<{ ok: boolean; error?: string }> {
  try {
    const supabase = createPublicServerSupabaseClient();
    const query = supabase.from("categories").select("id").limit(1);
    const result = await Promise.race([
      query,
      new Promise<{ error: { message: string } }>(resolve =>
        setTimeout(() => resolve({ error: { message: "Database health check timed out" } }), timeoutMs)
      )
    ]);

    if (result.error) {
      return { ok: false, error: result.error.message };
    }

    return { ok: true };
  } catch (caughtError) {
    return {
      ok: false,
      error: caughtError instanceof Error ? caughtError.message : String(caughtError)
    };
  }
}

export async function GET() {
  const timestamp = new Date().toISOString();

  if (!hasPublicSupabaseEnv()) {
    logger.error("Health probe failed: Supabase public environment variables are missing");
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        db: "unconfigured",
        service: "auro-ardon-jewelry",
        timestamp
      },
      { status: 503 }
    );
  }

  const dbCheck = await pingDatabase();
  if (!dbCheck.ok) {
    logger.error("Health probe failed: database check failed", {
      error: dbCheck.error ?? "unknown"
    });
    return NextResponse.json(
      {
        ok: false,
        status: "degraded",
        db: "unreachable",
        service: "auro-ardon-jewelry",
        timestamp
      },
      { status: 503 }
    );
  }

  logger.debug("Health probe succeeded");

  return NextResponse.json(
    {
      ok: true,
      status: "ok",
      db: "connected",
      service: "auro-ardon-jewelry",
      timestamp
    },
    { status: 200 }
  );
}
