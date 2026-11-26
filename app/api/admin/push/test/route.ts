import { NextResponse } from "next/server";

import { assertAdminRequest } from "@/lib/auth";
import { sendAdminWebPush } from "@/lib/notifications";
import { SITE_NAME } from "@/lib/site";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const adminUser = await assertAdminRequest();
    if (!adminUser?.id) {
      return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
    }

    const result = await sendAdminWebPush({
      title: `${SITE_NAME} Admin — Test Alert`,
      body: "Push notifications are active on this device. New WhatsApp orders will alert you here.",
      url: "/admin/orders",
      tag: "auro-ardon-test-push",
      userId: adminUser.id
    });

    if (result.skipped) {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.reason === "vapid_not_configured"
              ? "Web Push VAPID keys are not configured on the server yet."
              : "No active push subscriptions found for your account on this device.",
          result
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: result.sent > 0, result });
  } catch (caughtError) {
    const message =
      caughtError instanceof Error ? caughtError.message : "Unable to send test push.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

