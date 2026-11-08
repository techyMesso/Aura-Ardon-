import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { revalidateCategoryCatalog, revalidateProductCatalog } from "@/lib/cache";
import { getRevalidateSecret } from "@/lib/env";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

type RevalidatePayload = {
  tag?: string;
  tags?: string[];
  table?: string;
  type?: string;
};

function secretsMatch(provided: string, expected: string) {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function extractSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-revalidate-secret")?.trim();
  if (headerSecret) return headerSecret;

  const authHeader = request.headers.get("authorization")?.trim();
  if (authHeader?.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }

  const querySecret = request.nextUrl.searchParams.get("secret")?.trim();
  if (querySecret) return querySecret;

  return null;
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request.headers);
  const rateLimit = await checkRateLimit({
    key: `revalidate:${ip}`,
    limit: 30,
    windowMs: 60 * 1000
  });

  if (!rateLimit.ok) {
    return NextResponse.json(
      { error: "Too many revalidation requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": `${rateLimit.retryAfterSeconds}`
        }
      }
    );
  }

  const expectedSecret = getRevalidateSecret();
  if (!expectedSecret) {
    return NextResponse.json(
      { error: "Revalidation secret is not configured." },
      { status: 503 }
    );
  }

  const providedSecret = extractSecret(request);
  if (!providedSecret || !secretsMatch(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let payload: RevalidatePayload = {};
  try {
    const rawBody = await request.text();
    if (rawBody.trim()) {
      payload = JSON.parse(rawBody) as RevalidatePayload;
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON payload." },
      { status: 400 }
    );
  }

  const requestedTags = new Set<string>();
  if (typeof payload.tag === "string" && payload.tag.trim()) {
    requestedTags.add(payload.tag.trim());
  }
  if (Array.isArray(payload.tags)) {
    for (const tag of payload.tags) {
      if (typeof tag === "string" && tag.trim()) {
        requestedTags.add(tag.trim());
      }
    }
  }

  const table = payload.table?.toLowerCase().trim();
  if (table === "products") {
    requestedTags.add("products");
  } else if (table === "categories") {
    requestedTags.add("categories");
    requestedTags.add("products");
  }

  if (requestedTags.size === 0) {
    requestedTags.add("products");
    requestedTags.add("categories");
  }

  const revalidated: string[] = [];
  if (requestedTags.has("products") || requestedTags.has("featured-products")) {
    revalidateProductCatalog();
    revalidated.push("products", "featured-products");
  }
  if (requestedTags.has("categories")) {
    revalidateCategoryCatalog();
    revalidated.push("categories");
  }

  logger.info?.("Catalog cache revalidated", {
    revalidated,
    table: table ?? null,
    type: payload.type ?? null
  });

  return NextResponse.json({
    revalidated: true,
    tags: revalidated,
    timestamp: new Date().toISOString()
  });
}
