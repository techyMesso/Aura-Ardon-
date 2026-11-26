import { NextResponse } from "next/server";
import { z } from "zod";

import { assertAdminRequest } from "@/lib/auth";
import { listAdminCustomers } from "@/lib/data";

export const runtime = "nodejs";

const querySchema = z.object({
  filter: z.enum(["all", "opted_in", "flagged", "blocked", "vip"]).optional(),
  search: z.string().trim().max(120).optional()
});

export async function GET(request: Request) {
  try {
    await assertAdminRequest();
    const { searchParams } = new URL(request.url);
    const query = querySchema.parse({
      filter: searchParams.get("filter") ?? undefined,
      search: searchParams.get("search") ?? undefined
    });
    const customers = await listAdminCustomers(query);
    return NextResponse.json({ customers });
  } catch (caughtError) {
    const message =
      caughtError instanceof z.ZodError
        ? caughtError.issues[0]?.message ?? "Invalid customer filters."
        : caughtError instanceof Error
          ? caughtError.message
          : "Unable to load customers.";
    const status = message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

