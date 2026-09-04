import { logger } from "@/lib/logger";

let registered = false;

export async function register() {
  if (registered) {
    return;
  }

  registered = true;

  logger.info("Application instrumentation initialized");

  const processWithEvents = globalThis.process as
    | (NodeJS.Process & {
        on?: (event: string, listener: (...args: unknown[]) => void) => void;
      })
    | undefined;

  if (typeof processWithEvents?.on !== "function") {
    logger.warn("Skipping process-level instrumentation hooks in this runtime");
    return;
  }

  processWithEvents.on("unhandledRejection", reason => {
    logger.error("Unhandled promise rejection", {
      reason: reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason }
    });
  });

  processWithEvents.on("uncaughtException", error => {
    logger.error("Uncaught exception", {
      error: error instanceof Error
        ? { message: error.message, stack: error.stack }
        : { error }
    });
  });
}
