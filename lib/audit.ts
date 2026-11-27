import type {
  AuditActor,
  AuditLogEntry,
  AuditLogFilterParams,
  AuditLogInput
} from "@/lib/audit-types";
import { AUDIT_ENTITY_OPTIONS } from "@/lib/audit-types";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export { AUDIT_ENTITY_OPTIONS };
export type { AuditActor, AuditLogEntry, AuditLogFilterParams, AuditLogInput };

function sanitizeJsonSnapshot(value: unknown): unknown {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

/**
 * Records an immutable entry in public.audit_log for every admin write.
 * Never throws so a committed business transaction is never masked by audit-log transport errors.
 */
export async function recordAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    const table = supabase.from("audit_log");
    if (!table || typeof table.insert !== "function") {
      return;
    }

    const actorEmail =
      input.actor?.email?.trim() ||
      input.actor?.id?.trim() ||
      "system";
    const actorRole: "owner" | "staff" | "system" =
      input.actor?.role === "staff"
        ? "staff"
        : input.actor?.role === "system"
          ? "system"
          : "owner";

    const row = {
      actor_id: input.actor?.id ?? null,
      actor_email: actorEmail,
      actor_role: actorRole,
      action: input.action.trim(),
      entity: input.entity.trim(),
      entity_id: input.entityId ? String(input.entityId) : null,
      before_data: sanitizeJsonSnapshot(input.before),
      after_data: sanitizeJsonSnapshot(input.after),
      metadata: (sanitizeJsonSnapshot(input.metadata ?? {}) ?? {}) as Record<
        string,
        unknown
      >
    };

    const { error } = await table.insert(row as never);
    if (error) {
      logger.warn("Failed to insert audit_log entry", {
        action: input.action,
        entity: input.entity,
        entityId: input.entityId,
        error: error.message
      });
    }
  } catch (caughtError) {
    logger.warn("Audit log write skipped", {
      action: input.action,
      entity: input.entity,
      error: caughtError instanceof Error ? caughtError.message : String(caughtError)
    });
  }
}

export async function listAuditLogs(
  params: AuditLogFilterParams = {}
): Promise<{
  entries: AuditLogEntry[];
  total: number;
  limit: number;
  offset: number;
}> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 50));
  const offset = Math.max(0, params.offset ?? 0);

  const supabase = createAdminSupabaseClient();
  let query = supabase
    .from("audit_log")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (params.entity && params.entity !== "all") {
    query = query.eq("entity", params.entity);
  }
  if (params.action && params.action.trim()) {
    query = query.ilike("action", `%${params.action.trim()}%`);
  }
  if (params.actor && params.actor.trim()) {
    query = query.ilike("actor_email", `%${params.actor.trim()}%`);
  }
  if (params.from && /^\d{4}-\d{2}-\d{2}$/.test(params.from)) {
    query = query.gte("created_at", `${params.from}T00:00:00+03:00`);
  }
  if (params.to && /^\d{4}-\d{2}-\d{2}$/.test(params.to)) {
    query = query.lte("created_at", `${params.to}T23:59:59.999+03:00`);
  }
  if (params.q && params.q.trim()) {
    const clean = params.q.trim().replace(/[,%()]/g, "");
    if (clean) {
      query = query.or(
        `entity_id.ilike.%${clean}%,action.ilike.%${clean}%,actor_email.ilike.%${clean}%,entity.ilike.%${clean}%`
      );
    }
  }

  const { data, error, count } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return {
    entries: (data ?? []) as unknown as AuditLogEntry[],
    total: count ?? (data?.length ?? 0),
    limit,
    offset
  };
}

