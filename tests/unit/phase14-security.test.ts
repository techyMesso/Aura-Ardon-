import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  buildSecurityHeaders
} from "@/lib/security-headers.mjs";
import {
  createAdminActivityToken,
  verifyAdminActivityToken
} from "@/lib/session-timeout";
import { scanDirectoryForClientSecrets } from "@/scripts/verify-no-client-secrets.mjs";

describe("Phase 14 security headers, inactivity timeout tokens, and client secret scanner", () => {
  it("builds a strict Content-Security-Policy and retains all core security headers", () => {
    const csp = buildContentSecurityPolicy({
      supabaseUrl: "https://scukquqkdivnodefqggf.supabase.co",
      isDev: false
    });

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("form-action 'self' https://wa.me");
    expect(csp).toContain("https://*.supabase.co");
    expect(csp).toContain("wss://*.supabase.co");
    expect(csp).toContain("https://va.vercel-scripts.com");
    expect(csp).toContain("https://vitals.vercel-insights.com");
    expect(csp).not.toContain("resend.com");
    expect(csp).not.toContain("'unsafe-eval'");

    const headers = buildSecurityHeaders({ isDev: false });
    const map = new Map(headers.map(h => [h.key, h.value]));

    expect(map.get("Content-Security-Policy")).toContain("default-src 'self'");
    expect(map.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(map.get("X-Frame-Options")).toBe("DENY");
    expect(map.get("X-Content-Type-Options")).toBe("nosniff");
    expect(map.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(map.get("Permissions-Policy")).toContain("geolocation=()");
  });

  it("signs and verifies admin inactivity timeout tokens and rejects expired or tampered tokens", async () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    const t0 = 1_750_000_000_000;
    const token = await createAdminActivityToken(userId, t0);

    // Active within 30 minutes
    const active = await verifyAdminActivityToken({
      token,
      userId,
      nowMs: t0 + 10 * 60 * 1000,
      timeoutMs: 30 * 60 * 1000
    });
    expect(active.valid).toBe(true);
    expect(active.expired).toBe(false);

    // Expired after 31 minutes
    const expired = await verifyAdminActivityToken({
      token,
      userId,
      nowMs: t0 + 31 * 60 * 1000,
      timeoutMs: 30 * 60 * 1000
    });
    expect(expired.valid).toBe(false);
    expect(expired.expired).toBe(true);

    // Tampered user ID or timestamp rejected
    const wrongUser = await verifyAdminActivityToken({
      token,
      userId: "22222222-2222-4222-8222-222222222222",
      nowMs: t0 + 1000
    });
    expect(wrongUser.valid).toBe(false);

    const [, sig] = token.split(".");
    const tamperedTs = await verifyAdminActivityToken({
      token: `${t0 + 999999}.${sig}`,
      userId,
      nowMs: t0 + 1000
    });
    expect(tamperedTs.valid).toBe(false);
  });

  it("passes clean static bundles and fails if SUPABASE_SERVICE_ROLE_KEY or service_role JWT leaks into .next/static", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "auro-secret-scan-"));
    try {
      const cleanFile = path.join(tmpDir, "app.js");
      fs.writeFileSync(
        cleanFile,
        'export const url = "https://scukquqkdivnodefqggf.supabase.co";',
        "utf8"
      );

      const cleanResult = scanDirectoryForClientSecrets(tmpDir, {
        SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role-key-123456"
      });
      expect(cleanResult.scannedFiles).toBe(1);
      expect(cleanResult.findings).toHaveLength(0);

      // Leak the configured service role secret value
      fs.writeFileSync(
        path.join(tmpDir, "leaked.js"),
        'const leaked = "super-secret-service-role-key-123456";',
        "utf8"
      );
      const leakedResult = scanDirectoryForClientSecrets(tmpDir, {
        SUPABASE_SERVICE_ROLE_KEY: "super-secret-service-role-key-123456"
      });
      expect(leakedResult.findings.length).toBeGreaterThanOrEqual(1);
      expect(leakedResult.findings[0]?.reason).toContain("SUPABASE_SERVICE_ROLE_KEY");

      // Leak a synthetic service_role JWT even without env var set
      const jwtHeader = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url");
      const jwtPayload = Buffer.from('{"role":"service_role","iss":"supabase"}').toString("base64url");
      const fakeServiceJwt = `${jwtHeader}.${jwtPayload}.fakesignature123456`;
      fs.writeFileSync(
        path.join(tmpDir, "leaked.js"),
        `const token = "${fakeServiceJwt}";`,
        "utf8"
      );
      const jwtResult = scanDirectoryForClientSecrets(tmpDir, {});
      expect(jwtResult.findings.some(f => f.reason.includes("service_role JWT"))).toBe(
        true
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

