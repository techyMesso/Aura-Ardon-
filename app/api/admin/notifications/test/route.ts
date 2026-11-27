import { NextResponse } from "next/server";

import { recordAuditLog } from "@/lib/audit";
import { assertAdminRequest } from "@/lib/auth";
import { sendAdminTestAlert } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resolveAuthStatus(message: string): number {
  if (message === "UNAUTHORIZED" || message === "SESSION_EXPIRED") return 401;
  if (message === "FORBIDDEN" || message === "MFA_REQUIRED") return 403;
  return 500;
}

export async function POST() {
  try {
    const adminUser = await assertAdminRequest({ requiredRole: "owner" });
    const result = await sendAdminTestAlert({ actorEmail: adminUser.email });

    await recordAuditLog({
      actor: {
        id: adminUser.id,
        email: adminUser.email ?? "owner",
        role: "owner"
      },
      action: "notifications.test_alert_sent",
      entity: "notification",
      after: {
        ok: result.ok,
        email_sent: result.email.sent,
        email_error: result.email.error ?? null,
        push_sent: result.push.sent,
        push_failed: result.push.failed,
        push_error: result.push.error ?? null
      }
    });

    if (result.ok) {
      return NextResponse.json(result, { status: 200 });
    }

    const nothingActiveToTry =
      !result.email.configured &&
      (!result.push.configured || result.push.deviceCount === 0);

    const errorParts: string[] = [];
    if (result.email.error) errorParts.push(`Email: ${result.email.error}`);
    if (result.push.error) errorParts.push(`Push: ${result.push.error}`);

    return NextResponse.json(
      {
        ...result,
        error:
          errorParts.join(" | ") ||
          "No alert channels are active yet. Configure Resend email or subscribe a push device."
      },
      { status: nothingActiveToTry ? 400 : 502 }
    );
  } catch (caughtError) {
    const message =
      caughtError instanceof Error
        ? caughtError.message
        : "Unable to send test alert.";
    return NextResponse.json(
      { error: message },
      { status: resolveAuthStatus(message) }
    );
  }
}
