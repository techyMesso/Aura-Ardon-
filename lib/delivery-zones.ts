import { z } from "zod";

export const DELIVERY_ZONE_MIN_FEE = 0;
export const DELIVERY_ZONE_MAX_FEE = 10_000;
export const DELIVERY_ZONE_MAX_NAME_LENGTH = 80;

const zoneNameSchema = z
  .string({ required_error: "Zone name is required." })
  .transform(value => value.trim())
  .pipe(
    z
      .string()
      .min(1, "Zone name is required.")
      .max(
        DELIVERY_ZONE_MAX_NAME_LENGTH,
        `Zone name must be ${DELIVERY_ZONE_MAX_NAME_LENGTH} characters or fewer.`
      )
  );

const zoneFeeSchema = z
  .number({
    required_error: "Delivery fee is required.",
    invalid_type_error: "Delivery fee must be a whole number in KES."
  })
  .finite("Delivery fee must be a valid number.")
  .int("Delivery fee must be a whole integer in KES (no decimals).")
  .min(
    DELIVERY_ZONE_MIN_FEE,
    `Delivery fee must be at least KES ${DELIVERY_ZONE_MIN_FEE}.`
  )
  .max(
    DELIVERY_ZONE_MAX_FEE,
    `Delivery fee cannot exceed KES ${DELIVERY_ZONE_MAX_FEE.toLocaleString("en-KE")}.`
  );

export const createDeliveryZoneSchema = z.object({
  name: zoneNameSchema,
  fee: zoneFeeSchema,
  active: z.boolean().optional().default(true),
  is_outside_nairobi: z.boolean().optional().default(false),
  sort_order: z.number().int().min(0).max(10_000).optional()
});

export const updateDeliveryZoneSchema = z
  .object({
    name: zoneNameSchema.optional(),
    fee: zoneFeeSchema.optional(),
    active: z.boolean().optional(),
    is_outside_nairobi: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10_000).optional()
  })
  .refine(
    data =>
      data.name !== undefined ||
      data.fee !== undefined ||
      data.active !== undefined ||
      data.is_outside_nairobi !== undefined ||
      data.sort_order !== undefined,
    { message: "At least one field must be provided to update a delivery zone." }
  );

export const reorderDeliveryZonesSchema = z.object({
  orderedIds: z
    .array(z.string().uuid("Each delivery zone ID must be a valid UUID."))
    .min(1, "At least one delivery zone ID is required.")
    .refine(ids => new Set(ids).size === ids.length, {
      message: "Delivery zone IDs must be unique."
    })
});

export function normalizeDeliveryZoneName(name: string): string {
  return name.trim().toLowerCase();
}

export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

