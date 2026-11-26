import { AdminNavigation } from "@/components/admin/admin-navigation";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminPage();

  return (
    <main className="min-h-dvh min-w-0 overflow-x-hidden bg-paper px-4 py-4 text-text md:pl-80 md:pr-8 md:pt-8 lg:pr-12 print:p-0">
      <div className="mx-auto min-w-0 max-w-7xl space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-0 md:pb-8 print:max-w-none print:pb-0">
        <AdminNavigation email={user?.email} />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
