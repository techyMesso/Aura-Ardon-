import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";

export const runtime = "nodejs";

export async function GET() {
  logger.debug("Health probe succeeded");

  return NextResponse.json(
    {
      ok: true,
      service: "auro-ardon-jewelry",
      timestamp: new Date().toISOString()
    },
    { status: 200 }
  );
}

