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

function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(redactValue);
  }

  if (typeof value !== "object") {
    return value;
  }

  const redacted: Record<string, unknown> = {};

  for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
    if (/pass|secret|token|key|authorization|cookie/i.test(key)) {
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
