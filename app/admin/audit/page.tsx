import { AuditLogViewer } from "@/components/admin/audit-log-viewer";
import { listAuditLogs } from "@/lib/audit";
import { requireOwnerPage } from "@/lib/auth";

export const metadata = {
  title: "Audit Log | Admin",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  await requireOwnerPage();
  const { entries, total } = await listAuditLogs({ limit: 50, offset: 0 });

  return <AuditLogViewer initialEntries={entries} initialTotal={total} />;
}

