import { NextResponse, type NextRequest } from "next/server";

import { assertAdminRequest, getAuthErrorStatus } from "@/lib/auth";
import {
  ADMIN_ACTIVITY_COOKIE,
  buildAdminActivityCookieOptions,
  createAdminActivityToken,
  getAdminIdleTimeoutMs
} from "@/lib/session-timeout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await assertAdminRequest();
    const forwardedProto = request.headers.get("x-forwarded-proto");
    const isSecure =
      forwardedProto === "https" || request.nextUrl.protocol === "https:";

    const freshToken = await createAdminActivityToken(user.id);
    const response = NextResponse.json({
      ok: true,
      timeoutMinutes: Math.round(getAdminIdleTimeoutMs() / 60000)
    });

    response.cookies.set(
      ADMIN_ACTIVITY_COOKIE,
      freshToken,
      buildAdminActivityCookieOptions(isSecure)
    );

    return response;
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "UNAUTHORIZED";
    return NextResponse.json(
      { error: message },
      { status: getAuthErrorStatus(message) }
    );
  }
}

