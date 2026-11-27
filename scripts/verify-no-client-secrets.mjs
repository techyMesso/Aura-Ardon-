import fs from "node:fs";
import path from "node:path";

const STATIC_DIR = path.join(process.cwd(), ".next", "static");

const SERVER_SECRET_ENV_NAMES = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "ORDER_STATUS_TOKEN_SECRET",
  "RESEND_API_KEY",
  "VAPID_PRIVATE_KEY",
  "AFRICAS_TALKING_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "CRON_SECRET",
  "REVALIDATE_SECRET"
];

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".cjs",
  ".css",
  ".json",
  ".map",
  ".txt",
  ".html"
]);

function collectFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (TEXT_EXTENSIONS.has(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

function containsServiceRoleJwt(content) {
  const jwtPattern = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
  const matches = content.match(jwtPattern);
  if (!matches) return false;

  for (const token of matches) {
    try {
      const payloadSegment = token.split(".")[1];
      const decoded = Buffer.from(payloadSegment, "base64url").toString("utf8");
      if (/"role"\s*:\s*"service_role"/.test(decoded)) {
        return true;
      }
    } catch {
      // Ignore malformed JWT-like tokens
    }
  }
  return false;
}

export function scanDirectoryForClientSecrets(
  targetDir = STATIC_DIR,
  env = process.env
) {
  const findings = [];
  const files = collectFiles(targetDir);

  const configuredSecrets = SERVER_SECRET_ENV_NAMES.map(name => ({
    name,
    value: (env[name] ?? "").trim()
  })).filter(entry => entry.value.length >= 12);

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, "utf8");
    const relPath = path.relative(process.cwd(), filePath);

    for (const secret of configuredSecrets) {
      if (content.includes(secret.value)) {
        findings.push({
          file: relPath,
          reason: `Server secret value for ${secret.name} found in client bundle`
        });
      }
    }

    if (content.includes("SUPABASE_SERVICE_ROLE_KEY")) {
      findings.push({
        file: relPath,
        reason: "Identifier SUPABASE_SERVICE_ROLE_KEY referenced in client bundle"
      });
    }

    if (containsServiceRoleJwt(content)) {
      findings.push({
        file: relPath,
        reason: "Supabase service_role JWT detected in client bundle"
      });
    }
  }

  return { scannedFiles: files.length, findings };
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

if (isDirectRun) {
  if (!fs.existsSync(STATIC_DIR)) {
    console.error(`[verify-no-client-secrets] Build output not found at ${STATIC_DIR}`);
    process.exit(1);
  }

  const { scannedFiles, findings } = scanDirectoryForClientSecrets(STATIC_DIR, process.env);

  if (findings.length > 0) {
    console.error(
      `[verify-no-client-secrets] FAILED: Found ${findings.length} secret leak(s) in .next/static:`
    );
    for (const finding of findings) {
      console.error(`  - ${finding.file}: ${finding.reason}`);
    }
    process.exit(1);
  }

  console.log(
    `[verify-no-client-secrets] OK: Scanned ${scannedFiles} static bundle files; zero server secrets detected.`
  );
}

