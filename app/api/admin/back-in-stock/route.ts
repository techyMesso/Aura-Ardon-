import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { getStoreSettings, listBackInStockAlerts } from "@/lib/data";
import { buildBackInStockWhatsAppUrl } from "@/lib/product-csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  productId: z.string().uuid().optional(),
  status: z.enum(["waiting", "notified", "cancelled", "all"]).optional(),
  restockedOnly: z.enum(["true", "false"]).optional()
});

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      productId: searchParams.get("productId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      restockedOnly: searchParams.get("restockedOnly") ?? undefined
    });

    const [alerts, settings] = await Promise.all([
      listBackInStockAlerts({
        productId: query.productId,
        status: query.status ?? "waiting",
        restockedOnly: query.restockedOnly === "true"
      }),
      getStoreSettings()
    ]);

    return NextResponse.json({
      alerts: alerts.map(alert => ({
        ...alert,
        whatsappUrl: buildBackInStockWhatsAppUrl(alert, settings)
      }))
    });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid filters."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load back-in-stock waitlist.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

