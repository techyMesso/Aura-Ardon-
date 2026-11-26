import { toCatalogSlug } from "@/lib/catalog";
import { resolveProductStatus } from "@/lib/admin-product-filters";
import { buildCanonicalUrl, DEFAULT_MESSAGE_TEMPLATES } from "@/lib/site";
import type {
  BackInStockAlert,
  Category,
  Product,
  ProductStatus,
  StoreSettings
} from "@/lib/types";
import { createWhatsAppLink, formatCurrency } from "@/lib/utils";

function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * RFC-4180 compliant CSV parser supporting quoted fields, escaped quotes, and newlines.
 */
export function parseCsv(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const text = csvText.replace(/^\uFEFF/, "");

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\r") {
      if (text[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(r => r.some(cell => cell.trim() !== ""));
}

export const PRODUCT_CSV_HEADERS_OWNER = [
  "slug",
  "title",
  "status",
  "category_slug",
  "price",
  "compare_at_price",
  "cost_price",
  "stock_quantity",
  "material",
  "finish",
  "size_label",
  "in_the_box",
  "care",
  "is_featured",
  "featured_order",
  "is_new_in",
  "new_in_order",
  "images",
  "image_alts",
  "description"
] as const;

export const PRODUCT_CSV_HEADERS_STAFF = PRODUCT_CSV_HEADERS_OWNER.filter(
  h => h !== "cost_price"
);

export function buildProductsCsv(
  products: Product[],
  categories: Category[],
  options: { includeCostPrice: boolean }
): string {
  const categoryById = new Map(categories.map(cat => [cat.id, cat.slug]));
  const headers = options.includeCostPrice
    ? [...PRODUCT_CSV_HEADERS_OWNER]
    : [...PRODUCT_CSV_HEADERS_STAFF];

  const lines: string[][] = [headers];

  for (const product of products) {
    const categorySlug =
      (product.category_id && categoryById.get(product.category_id)) ||
      toCatalogSlug(product.category);
    const alts =
      product.image_alts && product.image_alts.length === product.images.length
        ? product.image_alts
        : product.images.map((_, idx) => `${product.title} — photo ${idx + 1}`);

    const record: Record<string, string | number | boolean | null | undefined> = {
      slug: product.slug ?? "",
      title: product.title,
      status: resolveProductStatus(product),
      category_slug: categorySlug,
      price: Number(product.price).toFixed(2),
      compare_at_price:
        product.compare_at_price != null ? Number(product.compare_at_price).toFixed(2) : "",
      cost_price:
        options.includeCostPrice && product.cost_price != null
          ? Number(product.cost_price).toFixed(2)
          : "",
      stock_quantity: product.stock_quantity,
      material: product.material ?? "",
      finish: product.finish ?? "",
      size_label: product.size_label ?? "",
      in_the_box: product.in_the_box ?? "",
      care: product.care ?? "",
      is_featured: product.is_featured ? "true" : "false",
      featured_order: product.featured_order ?? 0,
      is_new_in: product.is_new_in ? "true" : "false",
      new_in_order: product.new_in_order ?? 0,
      images: (product.images ?? []).join(" | "),
      image_alts: alts.join(" | "),
      description: product.description
    };

    lines.push(headers.map(col => escapeCsvCell(record[col])));
  }

  return lines.map(row => row.join(",")).join("\n");
}

export interface ProductCsvImportRowResult {
  rowNumber: number;
  action: "create" | "update" | "error";
  slug: string;
  title: string;
  existingProductId: string | null;
  stockDelta: number;
  currentStock: number | null;
  targetStock: number | null;
  errors: string[];
  warnings: string[];
  normalized: {
    slug: string;
    title: string;
    status: ProductStatus;
    category_id: string;
    category_name: string;
    price: number;
    compare_at_price: number | null;
    cost_price: number | null | undefined;
    stock_quantity: number;
    material: string;
    finish: string | null;
    size_label: string | null;
    in_the_box: string | null;
    care: string | null;
    is_featured: boolean;
    featured_order: number;
    is_new_in: boolean;
    new_in_order: number;
    images: string[];
    image_alts: string[];
    description: string;
  } | null;
}

export interface ProductCsvDryRunSummary {
  totalRows: number;
  createCount: number;
  updateCount: number;
  errorCount: number;
  stockAdjustCount: number;
  rows: ProductCsvImportRowResult[];
}

function parseBoolCell(raw: string | undefined, fallback: boolean): boolean {
  if (!raw || !raw.trim()) return fallback;
  const lower = raw.trim().toLowerCase();
  if (["true", "1", "yes", "y"].includes(lower)) return true;
  if (["false", "0", "no", "n"].includes(lower)) return false;
  return fallback;
}

function splitPipeList(raw: string | undefined): string[] {
  if (!raw || !raw.trim()) return [];
  return raw
    .split("|")
    .map(item => item.trim())
    .filter(Boolean);
}

export function buildProductImportDryRun(params: {
  csvText: string;
  existingProducts: Array<
    Pick<
      Product,
      | "id"
      | "slug"
      | "title"
      | "price"
      | "compare_at_price"
      | "stock_quantity"
      | "status"
      | "active"
      | "category_id"
      | "category"
      | "material"
      | "description"
      | "images"
      | "image_alts"
      | "is_featured"
      | "featured_order"
      | "is_new_in"
      | "new_in_order"
    > & { has_variants?: boolean }
  >;
  categories: Category[];
  canEditCostPrice: boolean;
}): ProductCsvDryRunSummary {
  const matrix = parseCsv(params.csvText);
  if (matrix.length < 2) {
    return {
      totalRows: 0,
      createCount: 0,
      updateCount: 0,
      errorCount: 1,
      stockAdjustCount: 0,
      rows: [
        {
          rowNumber: 1,
          action: "error",
          slug: "",
          title: "",
          existingProductId: null,
          stockDelta: 0,
          currentStock: null,
          targetStock: null,
          errors: ["CSV must include a header row and at least one product row."],
          warnings: [],
          normalized: null
        }
      ]
    };
  }

  const headerMap = new Map<string, number>();
  matrix[0].forEach((header, idx) => {
    headerMap.set(header.trim().toLowerCase(), idx);
  });

  const existingBySlug = new Map(
    params.existingProducts
      .filter(p => Boolean(p.slug))
      .map(p => [(p.slug as string).toLowerCase(), p])
  );
  const categoryBySlug = new Map(
    params.categories.map(c => [c.slug.toLowerCase(), c])
  );
  const categoryByName = new Map(
    params.categories.map(c => [c.name.toLowerCase(), c])
  );

  const seenSlugsInCsv = new Set<string>();
  const rows: ProductCsvImportRowResult[] = [];

  for (let i = 1; i < matrix.length; i += 1) {
    const rawRow = matrix[i];
    const rowNumber = i + 1;
    const cell = (name: string) => {
      const idx = headerMap.get(name);
      return idx === undefined ? "" : (rawRow[idx] ?? "").trim();
    };

    const errors: string[] = [];
    const warnings: string[] = [];

    const rawTitle = cell("title");
    const rawSlug = toCatalogSlug(cell("slug") || rawTitle);
    const existing = rawSlug ? existingBySlug.get(rawSlug) ?? null : null;

    if (!rawSlug) {
      errors.push("Missing slug or title.");
    } else if (seenSlugsInCsv.has(rawSlug)) {
      errors.push(`Duplicate slug "${rawSlug}" appears multiple times in this CSV.`);
    } else {
      seenSlugsInCsv.add(rawSlug);
    }

    const title = rawTitle || existing?.title || "";
    if (title.length < 2) {
      errors.push("Title must be at least 2 characters.");
    }

    const rawStatus = cell("status").toLowerCase();
    let status: ProductStatus = existing
      ? resolveProductStatus(existing)
      : "draft";
    if (rawStatus) {
      if (rawStatus === "draft" || rawStatus === "active" || rawStatus === "archived") {
        status = rawStatus;
      } else {
        errors.push(`Invalid status "${rawStatus}". Use draft, active, or archived.`);
      }
    }

    const catSlugInput = cell("category_slug").toLowerCase();
    const matchedCategory =
      (catSlugInput &&
        (categoryBySlug.get(catSlugInput) ?? categoryByName.get(catSlugInput))) ||
      (existing?.category_id
        ? params.categories.find(c => c.id === existing.category_id)
        : undefined) ||
      null;

    if (!matchedCategory) {
      errors.push(
        catSlugInput
          ? `Unknown category "${catSlugInput}".`
          : "category_slug is required."
      );
    }

    const rawPrice = cell("price");
    const price = rawPrice
      ? Number(rawPrice)
      : existing
        ? Number(existing.price)
        : Number.NaN;
    if (!Number.isFinite(price) || price <= 0) {
      errors.push("Price must be a number above zero.");
    }

    const rawCompareAt = cell("compare_at_price");
    let compareAtPrice: number | null =
      existing && existing.compare_at_price != null
        ? Number(existing.compare_at_price)
        : null;
    if (headerMap.has("compare_at_price")) {
      if (rawCompareAt === "") {
        compareAtPrice = null;
      } else {
        const parsed = Number(rawCompareAt);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          errors.push("compare_at_price must be a positive number or blank.");
        } else {
          compareAtPrice = parsed;
        }
      }
    }
    if (compareAtPrice !== null && Number.isFinite(price) && compareAtPrice <= price) {
      errors.push("compare_at_price must be higher than price.");
    }

    let costPrice: number | null | undefined = undefined;
    if (headerMap.has("cost_price")) {
      if (!params.canEditCostPrice) {
        warnings.push("cost_price column ignored (owner-only).");
      } else {
        const rawCost = cell("cost_price");
        if (rawCost === "") {
          costPrice = null;
        } else {
          const parsed = Number(rawCost);
          if (!Number.isFinite(parsed) || parsed < 0) {
            errors.push("cost_price must be zero or greater.");
          } else {
            costPrice = parsed;
          }
        }
      }
    }

    const rawStock = cell("stock_quantity");
    const targetStock =
      rawStock !== ""
        ? Number(rawStock)
        : existing
          ? existing.stock_quantity
          : 0;
    if (!Number.isInteger(targetStock) || targetStock < 0) {
      errors.push("stock_quantity must be a non-negative whole number.");
    }

    const stockDelta =
      existing && Number.isInteger(targetStock)
        ? targetStock - existing.stock_quantity
        : 0;

    if (existing?.has_variants && stockDelta !== 0) {
      errors.push(
        "This product uses variants; update variant stock individually rather than via product CSV."
      );
    }

    const material = cell("material") || existing?.material || "";
    if (!material) {
      errors.push("Material is required.");
    }

    const description = cell("description") || existing?.description || "";
    if (description.length < 12) {
      errors.push("Description must be at least 12 characters.");
    }

    const imagesInput = splitPipeList(cell("images"));
    const images = imagesInput.length > 0 ? imagesInput : existing?.images ?? [];
    if (images.length === 0) {
      errors.push("At least one image URL is required.");
    } else {
      for (const url of images) {
        try {
          new URL(url);
        } catch {
          errors.push(`Invalid image URL: "${url}".`);
        }
      }
    }

    const altsInput = splitPipeList(cell("image_alts"));
    const imageAlts =
      altsInput.length > 0 ? altsInput : existing?.image_alts ?? [];
    if (images.length > 0 && imageAlts.length !== images.length) {
      errors.push(
        `image_alts must provide alt text for all ${images.length} image(s) separated by " | ".`
      );
    }

    const isFeatured = parseBoolCell(
      cell("is_featured"),
      existing?.is_featured ?? false
    );
    const featuredOrderRaw = cell("featured_order");
    const featuredOrder =
      featuredOrderRaw !== ""
        ? Math.max(0, Math.floor(Number(featuredOrderRaw) || 0))
        : existing?.featured_order ?? 0;

    const isNewIn = parseBoolCell(cell("is_new_in"), existing?.is_new_in ?? false);
    const newInOrderRaw = cell("new_in_order");
    const newInOrder =
      newInOrderRaw !== ""
        ? Math.max(0, Math.floor(Number(newInOrderRaw) || 0))
        : existing?.new_in_order ?? 0;

    if (existing && stockDelta !== 0) {
      warnings.push(
        `Stock will adjust via ledger by ${stockDelta > 0 ? `+${stockDelta}` : stockDelta} (${existing.stock_quantity} -> ${targetStock}).`
      );
    }

    const action: "create" | "update" | "error" =
      errors.length > 0 ? "error" : existing ? "update" : "create";

    rows.push({
      rowNumber,
      action,
      slug: rawSlug,
      title,
      existingProductId: existing?.id ?? null,
      stockDelta,
      currentStock: existing ? existing.stock_quantity : null,
      targetStock: Number.isInteger(targetStock) ? targetStock : null,
      errors,
      warnings,
      normalized:
        errors.length === 0 && matchedCategory
          ? {
              slug: rawSlug,
              title,
              status,
              category_id: matchedCategory.id,
              category_name: matchedCategory.name,
              price,
              compare_at_price: compareAtPrice,
              cost_price: costPrice,
              stock_quantity: targetStock,
              material,
              finish: cell("finish") || null,
              size_label: cell("size_label") || null,
              in_the_box: cell("in_the_box") || null,
              care: cell("care") || null,
              is_featured: isFeatured,
              featured_order: featuredOrder,
              is_new_in: isNewIn,
              new_in_order: newInOrder,
              images,
              image_alts: imageAlts,
              description
            }
          : null
    });
  }

  return {
    totalRows: rows.length,
    createCount: rows.filter(r => r.action === "create").length,
    updateCount: rows.filter(r => r.action === "update").length,
    errorCount: rows.filter(r => r.action === "error").length,
    stockAdjustCount: rows.filter(r => r.action === "update" && r.stockDelta !== 0)
      .length,
    rows
  };
}

export function buildBackInStockWhatsAppUrl(
  alert: Pick<
    BackInStockAlert,
    | "phone"
    | "customer_name"
    | "product_id"
    | "product_title"
    | "product_slug"
    | "product_price"
    | "variant_name"
  >,
  settings?: Pick<StoreSettings, "site_name" | "message_templates"> | null
): string | null {
  const productName = alert.variant_name
    ? `${alert.product_title ?? "Your saved piece"} (${alert.variant_name})`
    : alert.product_title ?? "Your saved piece";
  const productUrl = buildCanonicalUrl(
    `/p/${encodeURIComponent((alert.product_slug || alert.product_id).trim())}`
  );
  const template =
    settings?.message_templates?.back_in_stock ||
    DEFAULT_MESSAGE_TEMPLATES.back_in_stock;

  const displayName = alert.customer_name?.trim() || "there";
  const priceText = alert.product_price
    ? formatCurrency(alert.product_price)
    : "";
  const siteName = settings?.site_name || "Auro Ardon";

  let rendered = template
    .replace(/\{\{?\s*name\s*\}?\}/gi, displayName)
    .replace(/\{\{?\s*product_title\s*\}?\}/gi, productName)
    .replace(/\{\{?\s*product\s*\}?\}/gi, productName)
    .replace(/\{\{?\s*product_url\s*\}?\}/gi, productUrl)
    .replace(/\{\{?\s*url\s*\}?\}/gi, productUrl)
    .replace(/\{\{?\s*price\s*\}?\}/gi, priceText)
    .replace(/\{\{?\s*site_name\s*\}?\}/gi, siteName);

  if (!rendered.toLowerCase().includes(productName.toLowerCase())) {
    rendered = `${rendered}\nItem: ${productName}${priceText ? ` (${priceText})` : ""}`;
  }

  const finalMessage = rendered.includes(productUrl)
    ? rendered
    : `${rendered}\n${productUrl}`;

  return createWhatsAppLink(alert.phone, finalMessage);
}

