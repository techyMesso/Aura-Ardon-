import { InvoicesHub } from "@/components/admin/invoices-hub";
import {
  getDailyCashupReportData,
  getMonthlySummaryReportData,
  listAdminInvoices
} from "@/lib/data";
import { toNairobiDateIso, toNairobiMonthIso } from "@/lib/invoices";

export const metadata = {
  title: "Invoices & Reports",
  robots: { index: false, follow: false }
};

export default async function AdminInvoicesPage() {
  const todayIso = toNairobiDateIso(new Date());
  const monthIso = toNairobiMonthIso(new Date());

  const [invoices, cashup, monthlyData] = await Promise.all([
    listAdminInvoices(),
    getDailyCashupReportData(todayIso),
    getMonthlySummaryReportData(monthIso)
  ]);

  return (
    <InvoicesHub
      initialInvoices={invoices}
      initialCashup={cashup}
      initialMonthly={monthlyData.report}
    />
  );
}
