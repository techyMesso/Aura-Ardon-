import React from "react";
import {
  Document,
  Image as PdfImage,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View
} from "@react-pdf/renderer";

import {
  computeInvoiceBalanceDue,
  getInvoiceDocumentTitle,
  getInvoiceStatusLabel,
  isTestInvoice,
  NAIROBI_TIME_ZONE,
  toMoneyNumber
} from "@/lib/invoices";
import { logger } from "@/lib/logger";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import type {
  InvoiceDetailBundle,
  MonthlySummaryReport,
  StoreSettings
} from "@/lib/types";

export const INVOICE_PDF_BUCKET = "invoice-pdfs";

function formatKes(value: string | number | null | undefined): string {
  const amount = toMoneyNumber(value);
  return `KES ${amount.toLocaleString("en-KE", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  })}`;
}

function formatNairobiDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(date);
}

function formatNairobiDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: NAIROBI_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function isSafeRemoteImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const a4Styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    color: "#1A1216",
    backgroundColor: "#FFFFFF",
    padding: 36,
    position: "relative"
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 1,
    borderBottomColor: "#E4DDD5",
    paddingBottom: 16,
    marginBottom: 18
  },
  brandTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 20,
    color: "#1A1216",
    marginBottom: 4
  },
  docTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    color: "#B8923E",
    textTransform: "uppercase",
    letterSpacing: 1.5
  },
  muted: {
    color: "#6B5E64",
    fontSize: 9,
    lineHeight: 1.4
  },
  label: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#B8923E",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 16
  },
  card: {
    flex: 1,
    backgroundColor: "#F8F5F2",
    padding: 10,
    borderWidth: 1,
    borderColor: "#E8E1DA"
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#F2EDE7",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#DED6CE",
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontFamily: "Helvetica-Bold",
    fontSize: 8,
    textTransform: "uppercase",
    color: "#6B5E64"
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#EFEBE7",
    paddingVertical: 7,
    paddingHorizontal: 8,
    alignItems: "center"
  },
  colItem: { flex: 3.2 },
  colSku: { flex: 1.5 },
  colQty: { flex: 0.7, textAlign: "right" },
  colPrice: { flex: 1.4, textAlign: "right" },
  colTotal: { flex: 1.5, textAlign: "right" },
  totalsBox: {
    marginTop: 14,
    marginLeft: "auto",
    width: 220
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3
  },
  totalGrand: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "#1A1216",
    marginTop: 4,
    paddingTop: 6,
    fontFamily: "Helvetica-Bold",
    fontSize: 12
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#B8923E",
    textTransform: "uppercase",
    letterSpacing: 1.1,
    marginTop: 18,
    marginBottom: 6
  },
  stampPaid: {
    position: "absolute",
    top: 86,
    right: 40,
    borderWidth: 2.5,
    borderColor: "#0F766E",
    paddingVertical: 4,
    paddingHorizontal: 14,
    transform: "rotate(-10deg)"
  },
  stampPaidText: {
    color: "#0F766E",
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    letterSpacing: 3
  },
  stampVoid: {
    position: "absolute",
    top: 86,
    right: 40,
    borderWidth: 2.5,
    borderColor: "#B91C1C",
    paddingVertical: 4,
    paddingHorizontal: 14,
    transform: "rotate(-10deg)"
  },
  stampVoidText: {
    color: "#B91C1C",
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    letterSpacing: 3
  },
  watermarkTestOverlay: {
    position: "absolute",
    top: 290,
    left: 110,
    borderWidth: 4,
    borderColor: "#7E22CE",
    paddingVertical: 10,
    paddingHorizontal: 44,
    transform: "rotate(-28deg)",
    opacity: 0.22
  },
  watermarkTestText: {
    color: "#7E22CE",
    fontFamily: "Helvetica-Bold",
    fontSize: 64,
    letterSpacing: 14
  },
  testBanner: {
    backgroundColor: "#F3E8FF",
    borderWidth: 1,
    borderColor: "#9333EA",
    paddingVertical: 5,
    paddingHorizontal: 10,
    marginBottom: 12,
    textAlign: "center"
  },
  testBannerText: {
    color: "#6B21A8",
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    letterSpacing: 1.5
  },
  footer: {
    marginTop: 22,
    borderTopWidth: 1,
    borderTopColor: "#E4DDD5",
    paddingTop: 10
  }
});

const receiptStyles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 8.5,
    color: "#1A1216",
    backgroundColor: "#FFFFFF",
    padding: 12
  },
  center: {
    textAlign: "center",
    alignItems: "center"
  },
  brand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 13,
    marginBottom: 2
  },
  title: {
    fontFamily: "Helvetica-Bold",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 4
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomStyle: "dashed",
    borderBottomColor: "#9A8F94",
    marginVertical: 6
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2.5
  },
  bold: {
    fontFamily: "Helvetica-Bold"
  },
  muted: {
    fontSize: 7.5,
    color: "#574B51"
  },
  stampBox: {
    borderWidth: 1.5,
    borderColor: "#0F766E",
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginVertical: 6,
    alignSelf: "center"
  },
  stampVoidBox: {
    borderWidth: 1.5,
    borderColor: "#B91C1C",
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginVertical: 6,
    alignSelf: "center"
  },
  stampTestBox: {
    borderWidth: 1.5,
    borderColor: "#7E22CE",
    backgroundColor: "#F3E8FF",
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginVertical: 5,
    alignSelf: "center"
  }
});

export function InvoiceA4Document({ bundle }: { bundle: InvoiceDetailBundle }) {
  const { invoice, payments, creditNotes } = bundle;
  const docTitle = getInvoiceDocumentTitle(invoice);
  const testWatermark = isTestInvoice(invoice);
  const business = invoice.business_snapshot;
  const customer = invoice.customer_snapshot;
  const lines = invoice.lines_snapshot ?? [];
  const balanceDue = computeInvoiceBalanceDue(invoice);

  return (
    <Document title={`${testWatermark ? "TEST " : ""}${docTitle} ${invoice.invoice_number}`}>
      <Page size="A4" style={a4Styles.page}>
        {testWatermark ? (
          <>
            <View style={a4Styles.watermarkTestOverlay} fixed>
              <Text style={a4Styles.watermarkTestText}>TEST</Text>
            </View>
            <View style={a4Styles.testBanner}>
              <Text style={a4Styles.testBannerText}>
                TEST INVOICE — NOT FOR ACCOUNTING OR REVENUE REPORTING
              </Text>
            </View>
          </>
        ) : null}
        {invoice.status === "paid" ? (
          <View style={a4Styles.stampPaid}>
            <Text style={a4Styles.stampPaidText}>PAID</Text>
          </View>
        ) : invoice.status === "void" ? (
          <View style={a4Styles.stampVoid}>
            <Text style={a4Styles.stampVoidText}>VOID</Text>
          </View>
        ) : null}

        <View style={a4Styles.header}>
          <View style={{ maxWidth: "56%" }}>
            {isSafeRemoteImageUrl(business.logo_url) ? (
              <PdfImage
                src={business.logo_url}
                style={{ width: 92, height: 32, objectFit: "contain", marginBottom: 6 }}
              />
            ) : null}
            <Text style={a4Styles.brandTitle}>{business.site_name || "Auro Ardon"}</Text>
            <Text style={a4Styles.muted}>{business.business_address}</Text>
            <Text style={a4Styles.muted}>Tel / WhatsApp: +{business.business_phone}</Text>
            {business.business_email ? (
              <Text style={a4Styles.muted}>{business.business_email}</Text>
            ) : null}
            {business.kra_pin ? (
              <Text style={a4Styles.muted}>PIN: {business.kra_pin}</Text>
            ) : null}
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={a4Styles.docTitle}>{docTitle}</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 4 }}>
              {invoice.invoice_number}
            </Text>
            <Text style={a4Styles.muted}>
              Status: {getInvoiceStatusLabel(invoice.status)}
            </Text>
            {customer.order_number ? (
              <Text style={a4Styles.muted}>Order: {customer.order_number}</Text>
            ) : null}
            <Text style={a4Styles.muted}>Issued: {formatNairobiDate(invoice.issued_at)}</Text>
            <Text style={a4Styles.muted}>Due: {formatNairobiDate(invoice.due_at)}</Text>
            {invoice.etims_invoice_number ? (
              <Text style={a4Styles.muted}>Ref: {invoice.etims_invoice_number}</Text>
            ) : null}
          </View>
        </View>

        <View style={a4Styles.rowBetween}>
          <View style={a4Styles.card}>
            <Text style={a4Styles.label}>Billed To</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", marginBottom: 2 }}>
              {customer.full_name}
            </Text>
            <Text style={a4Styles.muted}>{customer.phone}</Text>
            <Text style={a4Styles.muted}>
              {customer.delivery_zone_name
                ? `${customer.delivery_zone_name} — ${customer.address}`
                : customer.location || customer.address}
            </Text>
            {customer.town_county ? (
              <Text style={a4Styles.muted}>{customer.town_county}</Text>
            ) : null}
          </View>

          <View style={a4Styles.card}>
            <Text style={a4Styles.label}>Payment Terms</Text>
            <Text style={{ fontSize: 9, lineHeight: 1.45 }}>
              {business.payment_instructions ||
                "Pay via Cash or M-Pesa on delivery."}
            </Text>
          </View>
        </View>

        <View style={a4Styles.tableHeader}>
          <Text style={a4Styles.colItem}>Item</Text>
          <Text style={a4Styles.colSku}>SKU</Text>
          <Text style={a4Styles.colQty}>Qty</Text>
          <Text style={a4Styles.colPrice}>Unit Price</Text>
          <Text style={a4Styles.colTotal}>Total</Text>
        </View>

        {lines.map((line, index) => (
          <View key={`${line.sku}-${index}`} style={a4Styles.tableRow}>
            <Text style={a4Styles.colItem}>{line.name}</Text>
            <Text style={[a4Styles.colSku, a4Styles.muted]}>{line.sku}</Text>
            <Text style={a4Styles.colQty}>{line.qty}</Text>
            <Text style={a4Styles.colPrice}>{formatKes(line.unit_price)}</Text>
            <Text style={[a4Styles.colTotal, { fontFamily: "Helvetica-Bold" }]}>
              {formatKes(line.line_total)}
            </Text>
          </View>
        ))}

        <View style={a4Styles.totalsBox}>
          <View style={a4Styles.totalLine}>
            <Text style={a4Styles.muted}>Subtotal</Text>
            <Text>{formatKes(invoice.subtotal)}</Text>
          </View>
          {toMoneyNumber(invoice.discount_amount) > 0 ? (
            <View style={a4Styles.totalLine}>
              <Text style={a4Styles.muted}>
                Discount{invoice.discount_code ? ` (${invoice.discount_code})` : ""}
              </Text>
              <Text>-{formatKes(invoice.discount_amount)}</Text>
            </View>
          ) : null}
          <View style={a4Styles.totalLine}>
            <Text style={a4Styles.muted}>Delivery</Text>
            <Text>
              {toMoneyNumber(invoice.delivery_fee) === 0
                ? "Free"
                : formatKes(invoice.delivery_fee)}
            </Text>
          </View>
          <View style={a4Styles.totalGrand}>
            <Text>Total</Text>
            <Text>{formatKes(invoice.total)}</Text>
          </View>
          {toMoneyNumber(invoice.credited_amount) > 0 ? (
            <View style={a4Styles.totalLine}>
              <Text style={a4Styles.muted}>Credit Notes Applied</Text>
              <Text>-{formatKes(invoice.credited_amount)}</Text>
            </View>
          ) : null}
          <View style={a4Styles.totalLine}>
            <Text style={a4Styles.muted}>Amount Paid</Text>
            <Text>{formatKes(invoice.amount_paid)}</Text>
          </View>
          <View style={[a4Styles.totalLine, { fontFamily: "Helvetica-Bold" }]}>
            <Text>Balance Due</Text>
            <Text>{formatKes(balanceDue)}</Text>
          </View>
        </View>

        {payments.length > 0 ? (
          <View>
            <Text style={a4Styles.sectionTitle}>Payment History</Text>
            <View style={a4Styles.tableHeader}>
              <Text style={{ flex: 1.6 }}>Date (EAT)</Text>
              <Text style={{ flex: 1 }}>Method</Text>
              <Text style={{ flex: 1.4 }}>M-Pesa Code</Text>
              <Text style={{ flex: 1.4 }}>Received By</Text>
              <Text style={{ flex: 1.2, textAlign: "right" }}>Amount</Text>
            </View>
            {payments.map(payment => (
              <View key={payment.id} style={a4Styles.tableRow}>
                <Text style={{ flex: 1.6, fontSize: 9 }}>
                  {formatNairobiDateTime(payment.paid_at)}
                </Text>
                <Text style={{ flex: 1, fontSize: 9 }}>
                  {payment.method === "mpesa" ? "M-Pesa" : "Cash"}
                </Text>
                <Text style={{ flex: 1.4, fontSize: 9 }}>
                  {payment.mpesa_code ?? "—"}
                </Text>
                <Text style={{ flex: 1.4, fontSize: 9 }}>{payment.received_by}</Text>
                <Text
                  style={{
                    flex: 1.2,
                    fontSize: 9,
                    textAlign: "right",
                    fontFamily: "Helvetica-Bold"
                  }}
                >
                  {formatKes(payment.amount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {creditNotes.length > 0 ? (
          <View>
            <Text style={a4Styles.sectionTitle}>Credit Notes</Text>
            {creditNotes.map(cn => (
              <View key={cn.id} style={a4Styles.tableRow}>
                <Text style={{ flex: 1.5, fontFamily: "Helvetica-Bold", fontSize: 9 }}>
                  {cn.credit_note_number}
                </Text>
                <Text style={{ flex: 3, fontSize: 9 }}>{cn.reason}</Text>
                <Text style={{ flex: 1.2, textAlign: "right", fontSize: 9 }}>
                  -{formatKes(cn.amount)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={a4Styles.footer}>
          <Text style={a4Styles.muted}>
            {business.invoice_footer ||
              "Thank you for shopping with Auro Ardon, Nairobi."}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export function InvoiceReceipt80mmDocument({
  bundle
}: {
  bundle: InvoiceDetailBundle;
}) {
  const { invoice, payments, creditNotes } = bundle;
  const docTitle = getInvoiceDocumentTitle(invoice);
  const testWatermark = isTestInvoice(invoice);
  const business = invoice.business_snapshot;
  const customer = invoice.customer_snapshot;
  const lines = invoice.lines_snapshot ?? [];
  const balanceDue = computeInvoiceBalanceDue(invoice);

  // 80mm thermal paper width = 226.77pt
  return (
    <Document title={`${testWatermark ? "TEST " : ""}${docTitle} ${invoice.invoice_number} (80mm)`}>
      <Page size={[226.77, 720]} style={receiptStyles.page}>
        {testWatermark ? (
          <View style={receiptStyles.stampTestBox}>
            <Text style={{ color: "#6B21A8", fontFamily: "Helvetica-Bold", fontSize: 10 }}>
              TEST — NOT A REAL RECEIPT
            </Text>
          </View>
        ) : null}
        <View style={receiptStyles.center}>
          <Text style={receiptStyles.brand}>{business.site_name || "Auro Ardon"}</Text>
          <Text style={receiptStyles.muted}>{business.business_address}</Text>
          <Text style={receiptStyles.muted}>+{business.business_phone}</Text>
          {business.kra_pin ? (
            <Text style={receiptStyles.muted}>PIN: {business.kra_pin}</Text>
          ) : null}
          <Text style={receiptStyles.title}>{docTitle}</Text>
          <Text style={receiptStyles.bold}>{invoice.invoice_number}</Text>
          <Text style={receiptStyles.muted}>
            {formatNairobiDateTime(invoice.issued_at)} EAT
          </Text>
        </View>

        {invoice.status === "paid" ? (
          <View style={receiptStyles.stampBox}>
            <Text style={{ color: "#0F766E", fontFamily: "Helvetica-Bold", fontSize: 10 }}>
              PAID
            </Text>
          </View>
        ) : invoice.status === "void" ? (
          <View style={receiptStyles.stampVoidBox}>
            <Text style={{ color: "#B91C1C", fontFamily: "Helvetica-Bold", fontSize: 10 }}>
              VOID
            </Text>
          </View>
        ) : null}

        <View style={receiptStyles.divider} />

        <Text style={receiptStyles.bold}>{customer.full_name}</Text>
        <Text style={receiptStyles.muted}>{customer.phone}</Text>
        {customer.order_number ? (
          <Text style={receiptStyles.muted}>Order: {customer.order_number}</Text>
        ) : null}
        {invoice.etims_invoice_number ? (
          <Text style={receiptStyles.muted}>Ref: {invoice.etims_invoice_number}</Text>
        ) : null}

        <View style={receiptStyles.divider} />

        {lines.map((line, index) => (
          <View key={`${line.sku}-${index}`} style={{ marginBottom: 4 }}>
            <Text style={receiptStyles.bold}>{line.name}</Text>
            <View style={receiptStyles.row}>
              <Text style={receiptStyles.muted}>
                {line.qty} x {formatKes(line.unit_price)}
              </Text>
              <Text>{formatKes(line.line_total)}</Text>
            </View>
          </View>
        ))}

        <View style={receiptStyles.divider} />

        <View style={receiptStyles.row}>
          <Text>Subtotal</Text>
          <Text>{formatKes(invoice.subtotal)}</Text>
        </View>
        {toMoneyNumber(invoice.discount_amount) > 0 ? (
          <View style={receiptStyles.row}>
            <Text>Discount</Text>
            <Text>-{formatKes(invoice.discount_amount)}</Text>
          </View>
        ) : null}
        <View style={receiptStyles.row}>
          <Text>Delivery</Text>
          <Text>
            {toMoneyNumber(invoice.delivery_fee) === 0
              ? "Free"
              : formatKes(invoice.delivery_fee)}
          </Text>
        </View>
        <View style={[receiptStyles.row, receiptStyles.bold]}>
          <Text>TOTAL</Text>
          <Text>{formatKes(invoice.total)}</Text>
        </View>
        {toMoneyNumber(invoice.credited_amount) > 0 ? (
          <View style={receiptStyles.row}>
            <Text>Credited</Text>
            <Text>-{formatKes(invoice.credited_amount)}</Text>
          </View>
        ) : null}
        <View style={receiptStyles.row}>
          <Text>Paid</Text>
          <Text>{formatKes(invoice.amount_paid)}</Text>
        </View>
        <View style={[receiptStyles.row, receiptStyles.bold]}>
          <Text>Balance</Text>
          <Text>{formatKes(balanceDue)}</Text>
        </View>

        {payments.length > 0 ? (
          <>
            <View style={receiptStyles.divider} />
            <Text style={[receiptStyles.bold, { marginBottom: 3 }]}>Payments</Text>
            {payments.map(payment => (
              <View key={payment.id} style={receiptStyles.row}>
                <Text style={receiptStyles.muted}>
                  {payment.method === "mpesa"
                    ? `M-Pesa ${payment.mpesa_code ?? ""}`
                    : "Cash"}
                </Text>
                <Text>{formatKes(payment.amount)}</Text>
              </View>
            ))}
          </>
        ) : null}

        {creditNotes.length > 0 ? (
          <>
            <View style={receiptStyles.divider} />
            {creditNotes.map(cn => (
              <View key={cn.id} style={receiptStyles.row}>
                <Text style={receiptStyles.muted}>{cn.credit_note_number}</Text>
                <Text>-{formatKes(cn.amount)}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={receiptStyles.divider} />

        <View style={receiptStyles.center}>
          <Text style={receiptStyles.muted}>
            {business.payment_instructions || "Pay via Cash or M-Pesa on delivery."}
          </Text>
          <Text style={[receiptStyles.muted, { marginTop: 4 }]}>
            {business.invoice_footer || "Thank you for choosing Auro Ardon."}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

export async function renderInvoicePdfBuffer(
  bundle: InvoiceDetailBundle,
  layout: "a4" | "receipt"
): Promise<Buffer> {
  const element =
    layout === "receipt" ? (
      <InvoiceReceipt80mmDocument bundle={bundle} />
    ) : (
      <InvoiceA4Document bundle={bundle} />
    );
  const raw = await renderToBuffer(element);
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
}

/**
 * Loads cached PDF from private `invoice-pdfs` Storage bucket or renders,
 * caches, and returns it.
 */
export async function getOrGenerateInvoicePdf(
  bundle: InvoiceDetailBundle,
  layout: "a4" | "receipt"
): Promise<Buffer> {
  const supabase = createAdminSupabaseClient();
  const cachedPath =
    layout === "receipt"
      ? bundle.invoice.pdf_receipt_path
      : bundle.invoice.pdf_a4_path;

  if (cachedPath && supabase.storage) {
    try {
      const { data: blob, error } = await supabase.storage
        .from(INVOICE_PDF_BUCKET)
        .download(cachedPath);
      if (!error && blob) {
        const arrayBuffer = await blob.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }
    } catch (storageError) {
      logger.warn("Unable to read cached invoice PDF from Storage; regenerating", {
        invoiceNumber: bundle.invoice.invoice_number,
        layout,
        error: storageError instanceof Error ? storageError.message : String(storageError)
      });
    }
  }

  const buffer = await renderInvoicePdfBuffer(bundle, layout);

  if (supabase.storage) {
    const versionTag = `${bundle.invoice.status}-${bundle.payments.length}p-${bundle.creditNotes.length}cn`;
    const objectPath = `${bundle.invoice.invoice_number}/${layout}-${versionTag}.pdf`;
    try {
      const { error: uploadError } = await supabase.storage
        .from(INVOICE_PDF_BUCKET)
        .upload(objectPath, buffer, {
          contentType: "application/pdf",
          upsert: true
        });
      if (!uploadError) {
        const updateField =
          layout === "receipt"
            ? { pdf_receipt_path: objectPath }
            : { pdf_a4_path: objectPath };
        await supabase
          .from("invoices")
          .update(updateField as never)
          .eq("id", bundle.invoice.id);
      }
    } catch (uploadErr) {
      logger.warn("Unable to cache rendered invoice PDF in Storage", {
        invoiceNumber: bundle.invoice.invoice_number,
        layout,
        error: uploadErr instanceof Error ? uploadErr.message : String(uploadErr)
      });
    }
  }

  return buffer;
}

export async function renderMonthlySummaryPdfBuffer(
  report: MonthlySummaryReport,
  settings: Pick<
    StoreSettings,
    "site_name" | "business_address" | "business_phone" | "kra_pin"
  >
): Promise<Buffer> {
  const doc = (
    <Document title={`Monthly Summary ${report.month}`}>
      <Page size="A4" style={a4Styles.page}>
        <View style={a4Styles.header}>
          <View>
            <Text style={a4Styles.brandTitle}>{settings.site_name}</Text>
            <Text style={a4Styles.muted}>{settings.business_address}</Text>
            <Text style={a4Styles.muted}>+{settings.business_phone}</Text>
            {settings.kra_pin ? (
              <Text style={a4Styles.muted}>PIN: {settings.kra_pin}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={a4Styles.docTitle}>Monthly Summary</Text>
            <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 4 }}>
              Period: {report.month}
            </Text>
            <Text style={a4Styles.muted}>
              Generated: {formatNairobiDate(new Date().toISOString())}
            </Text>
          </View>
        </View>

        <Text style={a4Styles.sectionTitle}>Sales & Credit Notes</Text>
        <View style={a4Styles.tableHeader}>
          <Text style={{ flex: 3 }}>Line</Text>
          <Text style={{ flex: 1.5, textAlign: "right" }}>Amount (KES)</Text>
        </View>
        {[
          ["Gross sales (items subtotal)", formatKes(report.grossSales)],
          ["Discounts granted", `-${formatKes(report.discounts)}`],
          ["Delivery fees billed", formatKes(report.deliveryFees)],
          ["Credit notes issued", `-${formatKes(report.creditNotesTotal)}`],
          ["Net sales", formatKes(report.netSales)]
        ].map(([label, value], index) => (
          <View
            key={label}
            style={[
              a4Styles.tableRow,
              index === 4 ? { fontFamily: "Helvetica-Bold", backgroundColor: "#F8F5F2" } : {}
            ]}
          >
            <Text style={{ flex: 3 }}>{label}</Text>
            <Text style={{ flex: 1.5, textAlign: "right" }}>{value}</Text>
          </View>
        ))}

        <Text style={a4Styles.sectionTitle}>Payments Collected by Method</Text>
        <View style={a4Styles.tableHeader}>
          <Text style={{ flex: 3 }}>Method</Text>
          <Text style={{ flex: 1.5, textAlign: "right" }}>Collected (KES)</Text>
        </View>
        {[
          ["Cash", formatKes(report.cashCollected)],
          ["M-Pesa", formatKes(report.mpesaCollected)],
          ["Total collected", formatKes(report.totalCollected)]
        ].map(([label, value], index) => (
          <View
            key={label}
            style={[
              a4Styles.tableRow,
              index === 2 ? { fontFamily: "Helvetica-Bold", backgroundColor: "#F8F5F2" } : {}
            ]}
          >
            <Text style={{ flex: 3 }}>{label}</Text>
            <Text style={{ flex: 1.5, textAlign: "right" }}>{value}</Text>
          </View>
        ))}

        <View style={a4Styles.footer}>
          <Text style={a4Styles.muted}>
            Documents in period: {report.invoiceCount} invoices · {report.creditNoteCount} credit notes · {report.paymentCount} payments recorded.
          </Text>
        </View>
      </Page>
    </Document>
  );

  const raw = await renderToBuffer(doc);
  return Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
}

