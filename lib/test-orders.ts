/**
 * Detects whether a customer name should automatically flag an order as a test order.
 * Matches names starting with uppercase `TEST` (e.g. "TEST", "TEST Buyer", "TEST123")
 * or standalone lowercase/mixed-case "test" followed by whitespace, punctuation, digits, or end.
 */
export function isTestOrderCustomerName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  return trimmed.startsWith("TEST") || /^test($|[\s\-_:\d])/i.test(trimmed);
}

