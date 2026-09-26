import { AdminNavigation } from "@/components/admin/admin-navigation";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminPage();

  return (
    <main className="min-h-dvh w-full overflow-x-hidden px-4 py-4 md:px-6 md:py-8 lg:px-10">
      <div className="mx-auto min-w-0 max-w-7xl space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-8 md:pb-0">
        <AdminNavigation email={user?.email} />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
