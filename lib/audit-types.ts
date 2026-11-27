export interface AuditActor {
  id?: string | null;
  email?: string | null;
  role?: "owner" | "staff" | "system" | null;
}

export interface AuditLogInput {
  actor?: AuditActor | null;
  action: string;
  entity: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string;
  actor_role: "owner" | "staff" | "system";
  action: string;
  entity: string;
  entity_id: string | null;
  before_data: unknown;
  after_data: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditLogFilterParams {
  entity?: string;
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export const AUDIT_ENTITY_OPTIONS = [
  "product",
  "variant",
  "order",
  "stock",
  "payment",
  "credit_note",
  "store_settings",
  "delivery_zone",
  "notification",
  "discount_code",
  "admin_user",
  "customer",
  "review",
  "rider",
  "category"
] as const;

