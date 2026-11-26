import { toNairobiDateIso } from "@/lib/invoices";
import type { Customer } from "@/lib/types";
import {
  createWhatsAppLink,
  normalizeKenyanPhoneNumber,
  normalizeWhatsAppNumber
} from "@/lib/utils";

export const SUGGESTED_CUSTOMER_TAGS = [
  "VIP",
  "Repeat",
  "Gift buyer",
  "Wholesale",
  "High-value"
] as const;

export function normalizeCustomerTags(rawTags: string[]): string[] {
  const seen = new Set<string>();
  const clean: string[] = [];
  for (const tag of rawTags) {
    const trimmed = tag.trim().slice(0, 32);
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push(trimmed);
  }
  return clean.slice(0, 20);
}

export function isEligibleForBroadcastExport(
  customer: Pick<Customer, "marketing_opt_in" | "is_blocked" | "anonymized_at">
): boolean {
  return (
    customer.marketing_opt_in === true &&
    customer.is_blocked !== true &&
    !customer.anonymized_at
  );
}

export function buildCustomerWhatsAppUrl(
  customer: Pick<Customer, "phone" | "full_name" | "anonymized_at">
): string | null {
  if (customer.anonymized_at || customer.phone.startsWith("ANON-")) {
    return null;
  }
  let phone: string | null = null;
  try {
    phone = normalizeKenyanPhoneNumber(customer.phone);
  } catch {
    phone = normalizeWhatsAppNumber(customer.phone);
  }
  if (!phone) return null;

  return createWhatsAppLink(
    phone,
    `Hi ${customer.full_name}, this is Auro Ardon Nairobi.`
  );
}

function escapeCsvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports ONLY opted-in, non-blocked, non-anonymized customers for WhatsApp broadcasts.
 */
export function buildOptedInCustomersCsv(customers: Customer[]): string {
  const eligible = customers.filter(isEligibleForBroadcastExport);

  const rows: Array<Array<string | number>> = [
    [
      "Phone (254...)",
      "Full Name",
      "Last Zone",
      "Tags",
      "Opt-In Date (EAT)",
      "Order Count",
      "Lifetime Value (KES)"
    ]
  ];

  for (const customer of eligible) {
    rows.push([
      customer.phone,
      customer.full_name,
      customer.last_zone ?? "",
      (customer.tags ?? []).join("; "),
      customer.marketing_opt_in_at
        ? toNairobiDateIso(customer.marketing_opt_in_at)
        : "",
      customer.order_count,
      Number(customer.lifetime_value ?? 0).toFixed(2)
    ]);
  }

  return rows.map(row => row.map(escapeCsvCell).join(",")).join("\n");
}

