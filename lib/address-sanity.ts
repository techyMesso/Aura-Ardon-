export const NON_NAIROBI_TOWNS = [
  "Mombasa",
  "Malindi",
  "Kisumu",
  "Nakuru",
  "Eldoret",
  "Thika",
  "Nyeri",
  "Machakos",
  "Kitale",
  "Kakamega",
  "Meru",
  "Naivasha"
] as const;

export type NonNairobiTown = (typeof NON_NAIROBI_TOWNS)[number];

export interface OrderAddressSanityInput {
  deliveryZoneName?: string | null;
  isOutsideNairobi?: boolean | null;
  deliveryAddress?: string | null;
  customerLocation?: string | null;
  townCounty?: string | null;
}

export interface AddressSanityWarning {
  matchedTowns: NonNairobiTown[];
  hasPoBox: boolean;
  matches: string[];
  zoneName: string;
  message: string;
}

const OUTSIDE_NAIROBI_ZONE_PATTERN = /\b(outside\s+nairobi|upcountry|courier)\b/i;
const PO_BOX_PATTERN = /\bp\.?\s*o\.?\s*box\b/i;

// Avoid false positives on Nairobi street/highway names such as "Thika Road",
// "Mombasa Road", or "Naivasha Road" when checking Nairobi delivery addresses.
const ROAD_SUFFIX_LOOKAHEAD =
  "(?![\\s-]+(?:road|rd\\.?|superhighway|highway|hwy\\.?|avenue|ave\\.?|street|st\\.?|drive|dr\\.?|lane|ln\\.?|way|close|crescent)\\b)";

const TOWN_PATTERNS: ReadonlyArray<{ town: NonNairobiTown; pattern: RegExp }> =
  NON_NAIROBI_TOWNS.map(town => ({
    town,
    pattern: new RegExp(`\\b${town}\\b${ROAD_SUFFIX_LOOKAHEAD}`, "i")
  }));

function stripLeadingZoneName(
  location: string | null | undefined,
  zoneName: string | null | undefined
): string {
  const cleanLocation = location?.trim() ?? "";
  const cleanZone = zoneName?.trim() ?? "";
  if (!cleanLocation || !cleanZone) return cleanLocation;

  const loweredLoc = cleanLocation.toLowerCase();
  const loweredZone = cleanZone.toLowerCase();
  if (loweredLoc === loweredZone) return "";

  for (const sep of [" — ", " - ", ", ", ": "]) {
    const prefix = `${loweredZone}${sep}`;
    if (loweredLoc.startsWith(prefix)) {
      return cleanLocation.slice(prefix.length).trim();
    }
  }
  return cleanLocation;
}

/**
 * Advisory address check for orders assigned to a Nairobi delivery zone.
 * Flags non-Nairobi town names and P.O. Box addresses so staff can verify on WhatsApp.
 */
export function checkOrderAddressSanity(
  input: OrderAddressSanityInput
): AddressSanityWarning | null {
  const zoneName = input.deliveryZoneName?.trim() || "Nairobi";

  if (input.isOutsideNairobi === true) {
    return null;
  }

  if (
    input.isOutsideNairobi == null &&
    input.deliveryZoneName &&
    OUTSIDE_NAIROBI_ZONE_PATTERN.test(input.deliveryZoneName)
  ) {
    return null;
  }

  const primaryAddress = input.deliveryAddress?.trim()
    ? input.deliveryAddress.trim()
    : stripLeadingZoneName(input.customerLocation, input.deliveryZoneName);

  const combinedText = [primaryAddress, input.townCounty?.trim() ?? ""]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (!combinedText) {
    return null;
  }

  const matchedTowns: NonNairobiTown[] = [];
  for (const { town, pattern } of TOWN_PATTERNS) {
    if (pattern.test(combinedText)) {
      matchedTowns.push(town);
    }
  }

  const hasPoBox = PO_BOX_PATTERN.test(combinedText);

  if (matchedTowns.length === 0 && !hasPoBox) {
    return null;
  }

  const matches: string[] = [...matchedTowns];
  if (hasPoBox) {
    matches.push("P.O. Box");
  }

  let message: string;
  if (matchedTowns.length > 0 && hasPoBox) {
    message = `Selected zone is "${zoneName}" (Nairobi), but the address mentions ${matchedTowns.join(", ")} and a P.O. Box. Confirm the physical address and courier fee on WhatsApp before dispatching.`;
  } else if (matchedTowns.length > 0) {
    message = `Selected zone is "${zoneName}" (Nairobi), but the address mentions ${matchedTowns.join(", ")}. Confirm whether this should use Outside Nairobi courier delivery before dispatching.`;
  } else {
    message = `Selected zone is "${zoneName}" (Nairobi), but the address contains a P.O. Box. Riders need a physical street or building landmark — confirm on WhatsApp before dispatching.`;
  }

  return {
    matchedTowns,
    hasPoBox,
    matches,
    zoneName,
    message
  };
}

