import Link from "next/link";
import { LogOut, Shield, LayoutDashboard, Package, FolderTree, ClipboardList, FileText } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminPage();

  return (
    <main className="min-h-screen px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col justify-between gap-6 rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur lg:flex-row lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bronze">
              Protected admin
            </p>
            <div className="mt-3 flex items-center gap-3">
              <Shield className="h-6 w-6 text-bronze" />
              <div>
                <h1 className="font-serif text-4xl text-ink">Atelier control room</h1>
                <p className="text-sm text-muted">{user?.email}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-ink transition hover:bg-white/70"
            >
              Storefront
            </Link>
            <form action="/auth/signout" method="post">
              <Button variant="ghost" type="submit">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </form>
          </div>
        </header>

        {/* Sidebar navigation */}
        <nav className="flex gap-6 overflow-x-auto rounded-[2rem] border border-white/60 bg-white/70 p-4 shadow-luxe backdrop-blur">
          <Link
            href="/admin"
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium uppercase tracking-[0.15em] text-ink transition hover:bg-sand/50"
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/admin/products"
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium uppercase tracking-[0.15em] text-ink transition hover:bg-sand/50"
          >
            <Package className="h-4 w-4" />
            Products
          </Link>
          <Link
            href="/admin/categories"
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium uppercase tracking-[0.15em] text-ink transition hover:bg-sand/50"
          >
            <FolderTree className="h-4 w-4" />
            Categories
          </Link>
          <Link
            href="/admin/orders"
            className="flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium uppercase tracking-[0.15em] text-ink transition hover:bg-sand/50"
          >
            <ClipboardList className="h-4 w-4" />
            Orders
          </Link>
        </nav>

        {children}
      </div>
    </main>
  );
}
