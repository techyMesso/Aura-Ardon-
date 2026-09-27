"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  ClipboardList,
  FileText,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  Store,
  UserRound,
  X
} from "lucide-react";

import { ThemeToggle } from "@/components/theme-toggle";

const PRIMARY_ITEMS = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", Icon: Package },
  { href: "/admin/categories", label: "Categories", Icon: FolderTree },
  { href: "/admin/orders", label: "Orders", Icon: ClipboardList }
];

const REPORT_ITEMS = [
  { href: "/admin#sales-overview", label: "Analytics", Icon: BarChart3 },
  { href: "/admin/invoices", label: "Invoices", Icon: FileText }
];

const PAGE_TITLES: Record<string, string> = {
  "/admin": "Dashboard",
  "/admin/products": "Products",
  "/admin/categories": "Categories",
  "/admin/orders": "Orders",
  "/admin/invoices": "Invoices"
};

function matchesRoute(pathname: string, href: string) {
  if (href.includes("#")) return false;
  const basePath = href.split("#")[0];
  if (basePath === "/admin") return pathname === basePath;
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith("/admin/products/")) return pathname.endsWith("/edit") ? "Edit product" : "Add product";
  if (pathname.startsWith("/admin/invoices/")) return "Invoice";
  return PAGE_TITLES[pathname] ?? "Admin";
}

function AdminNavLink({
  href,
  label,
  Icon,
  active,
  onClick,
  linkRef
}: {
  href: string;
  label: string;
  Icon: typeof LayoutDashboard;
  active: boolean;
  onClick?: () => void;
  linkRef?: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      ref={linkRef}
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-bronze ${
        active
          ? "bg-bronze text-white shadow-sm"
          : "text-muted hover:bg-sand/55 hover:text-ink"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

export function AdminNavigation({ email }: { email: string | null | undefined }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstDrawerLinkRef = useRef<HTMLAnchorElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const pageTitle = getPageTitle(pathname);
  const moreActive = REPORT_ITEMS.some(item => matchesRoute(pathname, item.href));

  useEffect(() => {
    if (!drawerOpen) return;

    const menuButton = menuButtonRef.current;
    firstDrawerLinkRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
      if (event.key !== "Tab") return;
      const controls = drawerRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)");
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKeyDown);
      menuButton?.focus();
    };
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
  }

  const navigation = (onClick?: () => void, firstLink?: React.Ref<HTMLAnchorElement>) => (
    <>
      <p className="mb-2 px-3 text-xs font-medium text-muted">Workspace</p>
      <div className="space-y-1">
        {PRIMARY_ITEMS.map((item, index) => (
          <AdminNavLink
            key={item.href}
            {...item}
            active={matchesRoute(pathname, item.href)}
            onClick={onClick}
            linkRef={index === 0 ? firstLink : undefined}
          />
        ))}
      </div>
      <p className="mb-2 mt-6 px-3 text-xs font-medium text-muted">Reports</p>
      <div className="space-y-1">
        {REPORT_ITEMS.map(item => (
          <AdminNavLink
            key={item.href}
            {...item}
            active={matchesRoute(pathname, item.href)}
            onClick={onClick}
          />
        ))}
      </div>
    </>
  );

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-border/70 bg-cream px-4 py-5 md:flex md:flex-col">
        <Link href="/admin" className="flex min-h-12 items-center gap-3 rounded-lg px-2 focus:outline-none focus:ring-2 focus:ring-bronze">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-champagne">
            <LayoutDashboard className="h-4 w-4" aria-hidden />
          </span>
          <span className="font-serif text-2xl text-ink">Auro Ardon</span>
        </Link>
        <p className="mt-1 px-2 text-sm text-muted">Store operations</p>
        <nav className="mt-8" aria-label="Admin navigation">{navigation()}</nav>
        <div className="mt-auto border-t border-border/70 pt-5">
          <div className="flex items-center gap-3 px-3 py-2">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sand text-bronze">
              <UserRound className="h-4 w-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">Administrator</p>
              <p className="truncate text-xs text-muted">{email}</p>
            </div>
          </div>
          <Link href="/" className="mt-3 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-sand/55 hover:text-ink focus:outline-none focus:ring-2 focus:ring-bronze">
            <Store className="h-4 w-4" aria-hidden />
            View storefront
          </Link>
          <form action="/auth/signout" method="post" className="mt-1">
            <button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-red-50 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-bronze">
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <header className="sticky top-0 z-50 -mx-4 -mt-4 mb-4 flex min-h-16 items-center gap-3 border-b border-border/70 bg-cream/95 px-4 py-2 backdrop-blur md:hidden">
        <button ref={menuButtonRef} type="button" onClick={() => setDrawerOpen(true)} aria-label="Open admin navigation" aria-expanded={drawerOpen} aria-controls="admin-mobile-drawer" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink transition-colors hover:bg-sand focus:outline-none focus:ring-2 focus:ring-bronze">
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <Link href="/admin" className="block truncate font-serif text-xl text-ink focus:outline-none focus:ring-2 focus:ring-bronze">Auro Ardon</Link>
          <p className="truncate text-xs text-muted">{pageTitle}</p>
        </div>
        <Link href="/admin/products/new" aria-label="Add product" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bronze text-white transition-colors hover:bg-rose focus:outline-none focus:ring-2 focus:ring-bronze">
          <Plus className="h-4 w-4" aria-hidden />
        </Link>
        <ThemeToggle />
      </header>

      <header className="mb-6 hidden min-h-16 items-center justify-between border-b border-border/70 pb-4 md:flex">
        <div>
          <p className="text-sm text-muted">Operations workspace</p>
          <h1 className="mt-0.5 font-serif text-3xl text-ink">{pageTitle}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/admin/products/new" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-bronze px-4 text-sm font-semibold text-white transition-colors hover:bg-rose focus:outline-none focus:ring-2 focus:ring-bronze">
            <Plus className="h-4 w-4" aria-hidden />
            Add product
          </Link>
          <ThemeToggle />
          <div className="flex h-11 items-center gap-2 border-l border-border pl-3 text-sm text-muted">
            <UserRound className="h-4 w-4" aria-hidden />
            <span className="max-w-40 truncate">{email}</span>
          </div>
        </div>
      </header>

      <div id="admin-mobile-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation" className={`fixed inset-0 z-[70] md:hidden ${drawerOpen ? "visible" : "invisible pointer-events-none"}`}>
        <button type="button" tabIndex={drawerOpen ? 0 : -1} aria-label="Close admin navigation" onClick={closeDrawer} className={`absolute inset-0 bg-ink/35 backdrop-blur-sm transition-opacity ${drawerOpen ? "opacity-100" : "opacity-0"}`} />
        <aside ref={drawerRef} className={`relative flex h-full w-[min(19rem,calc(100%-1.5rem))] flex-col bg-cream p-5 text-ink shadow-2xl transition-transform duration-200 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-serif text-2xl">Auro Ardon</p>
            <button type="button" onClick={closeDrawer} aria-label="Close admin navigation" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-ink transition-colors hover:bg-sand focus:outline-none focus:ring-2 focus:ring-bronze"><X className="h-5 w-5" aria-hidden /></button>
          </div>
          <p className="mt-1 text-sm text-muted">Store operations</p>
          <nav className="mt-7" aria-label="Admin drawer links">{navigation(closeDrawer, firstDrawerLinkRef)}</nav>
          <div className="mt-auto border-t border-border/70 pt-5">
            <p className="px-3 text-xs text-muted">Signed in as</p>
            <p className="mt-1 break-words px-3 text-sm font-medium text-ink">{email}</p>
            <div className="mt-4 flex items-center justify-between gap-3 px-3">
              <span className="text-sm font-medium text-muted">Appearance</span>
              <ThemeToggle />
            </div>
            <Link href="/" onClick={closeDrawer} className="mt-4 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-sand hover:text-ink focus:outline-none focus:ring-2 focus:ring-bronze"><Store className="h-4 w-4" aria-hidden />View storefront</Link>
            <form action="/auth/signout" method="post" className="mt-1"><button type="submit" className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted transition-colors hover:bg-red-50 hover:text-red-800 focus:outline-none focus:ring-2 focus:ring-bronze"><LogOut className="h-4 w-4" aria-hidden />Sign out</button></form>
          </div>
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border/70 bg-cream/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_24px_rgba(43,20,37,0.1)] backdrop-blur md:hidden" aria-label="Admin quick navigation">
        {PRIMARY_ITEMS.filter(item => item.label !== "Categories").map(({ href, label, Icon }) => {
          const active = matchesRoute(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-bronze ${active ? "bg-bronze/10 text-bronze" : "text-muted hover:bg-sand/60 hover:text-ink"}`}><Icon className="h-4 w-4" aria-hidden />{label}</Link>;
        })}
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open more admin navigation" className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-bronze ${moreActive ? "bg-bronze/10 text-bronze" : "text-muted hover:bg-sand/60 hover:text-ink"}`}><MoreHorizontal className="h-4 w-4" aria-hidden />More</button>
      </nav>
    </>
  );
}
