type LogLevel = "debug" | "info" | "warn" | "error";

const severityOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const configuredLevel = (process.env.LOG_LEVEL ?? "info").toLowerCase() as LogLevel;
const minimumLevel = severityOrder[configuredLevel] ?? severityOrder.info;

function shouldLog(level: LogLevel) {
  return severityOrder[level] >= minimumLevel;
}

const REDACT_KEY_PATTERN =
  /pass|secret|token|key|authorization|cookie|phone|tel|address|landmark|location|email|ip_?address|customer_name|full_?name|gift_?note/i;

const KENYAN_PHONE_LOG_PATTERN =
  /(?:\+?254[\s-]?[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}|\b0[17]\d{2}[\s-]?\d{3}[\s-]?\d{3}\b)/g;

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return value.replace(KENYAN_PHONE_LOG_PATTERN, "[REDACTED_PHONE]");
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (typeof value !== "object") {
    return value;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEY_PATTERN.test(key) && typeof nestedValue !== "boolean") {
      redacted[key] = "[REDACTED]";
      continue;
    }

    redacted[key] = redactValue(nestedValue);
  }

  return redacted;
}

function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  if (!shouldLog(level)) {
    return;
  }

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    app: "auro-ardon-jewelry",
    env: process.env.APP_ENV ?? process.env.NODE_ENV ?? "development",
    ...(context ? (redactValue(context) as Record<string, unknown>) : {})
  };

  const line = JSON.stringify(entry);

  if (level === "error") {
    console.error(line);
    return;
  }

  if (level === "warn") {
    console.warn(line);
    return;
  }

  console.log(line);
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    write("debug", message, context);
  },
  info(message: string, context?: Record<string, unknown>) {
    write("info", message, context);
  },
  warn(message: string, context?: Record<string, unknown>) {
    write("warn", message, context);
  },
  error(message: string, context?: Record<string, unknown>) {
    write("error", message, context);
  }
};
