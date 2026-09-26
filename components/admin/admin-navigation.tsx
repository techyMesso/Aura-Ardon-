"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  ClipboardList,
  FolderTree,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Package,
  Plus,
  Store,
  X
} from "lucide-react";

import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { href: "/admin", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/admin/products", label: "Products", Icon: Package },
  { href: "/admin/categories", label: "Categories", Icon: FolderTree },
  { href: "/admin/orders", label: "Orders", Icon: ClipboardList }
];

function matchesRoute(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminNavigation({ email }: { email: string | null | undefined }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const moreActive = !NAV_ITEMS.filter(item => item.label !== "Categories").some(item => matchesRoute(pathname, item.href));
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const firstDrawerLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;

    const menuButton = menuButtonRef.current;
    firstDrawerLinkRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
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

  return (
    <>
      <header className="sticky top-0 z-50 -mx-4 -mt-4 mb-4 flex min-h-[64px] items-center gap-2 border-b border-champagne/25 bg-ink/95 px-4 py-2 text-cream shadow-card backdrop-blur md:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open admin navigation"
          aria-expanded={drawerOpen}
          aria-controls="admin-mobile-drawer"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-cream transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-champagne"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <Link href="/admin" className="min-w-0 flex-1 truncate font-serif text-xl text-cream focus:outline-none focus:ring-2 focus:ring-champagne">
          Auro <span className="text-champagne">Admin</span>
        </Link>
        <Link
          href="/admin/products/new"
          aria-label="Add product"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1 rounded-full bg-bronze px-3 text-xs font-semibold uppercase tracking-[0.1em] text-white transition hover:bg-rose focus:outline-none focus:ring-2 focus:ring-champagne"
        >
          <Plus className="h-4 w-4" aria-hidden />
          <span className="hidden min-[380px]:inline">Add</span>
        </Link>
      </header>

      <div className="hidden space-y-6 md:block">
        <header className="flex min-w-0 flex-col justify-between gap-6 rounded-[2rem] border border-white/60 bg-white/70 p-6 shadow-luxe backdrop-blur lg:flex-row lg:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-bronze">Protected admin</p>
            <div className="mt-3 flex min-w-0 items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-champagne/25 text-bronze">
                <LayoutDashboard className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h1 className="font-serif text-4xl text-ink">Atelier control room</h1>
                <p className="truncate text-sm text-muted">{email}</p>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold uppercase tracking-[0.18em] text-ink transition hover:bg-white/70 focus:outline-none focus:ring-2 focus:ring-champagne">
              Storefront
            </Link>
            <form action="/auth/signout" method="post">
              <Button variant="ghost" type="submit" className="min-h-11">
                <LogOut className="mr-2 h-4 w-4" aria-hidden />
                Sign out
              </Button>
            </form>
          </div>
        </header>

        <nav className="flex min-w-0 flex-wrap gap-2 rounded-[2rem] border border-white/60 bg-white/70 p-3 shadow-luxe backdrop-blur" aria-label="Admin navigation">
          {NAV_ITEMS.map(({ href, label, Icon }) => {
            const active = matchesRoute(pathname, href);
            return (
              <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium uppercase tracking-[0.12em] transition focus:outline-none focus:ring-2 focus:ring-champagne ${active ? "bg-ink text-champagne" : "text-ink hover:bg-sand/50"}`}>
                <Icon className="h-4 w-4" aria-hidden />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div id="admin-mobile-drawer" role="dialog" aria-modal="true" aria-label="Admin navigation" className={`fixed inset-0 z-[60] md:hidden ${drawerOpen ? "visible" : "invisible pointer-events-none"}`}>
        <button type="button" tabIndex={drawerOpen ? 0 : -1} aria-label="Close admin navigation" onClick={closeDrawer} className={`absolute inset-0 bg-ink/55 backdrop-blur-sm transition-opacity ${drawerOpen ? "opacity-100" : "opacity-0"}`} />
        <aside className={`relative flex h-full w-[min(20rem,calc(100%-2rem))] flex-col border-r border-champagne/25 bg-ink p-5 text-cream shadow-2xl transition-transform duration-300 ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-serif text-2xl">Auro <span className="text-champagne">Admin</span></p>
            <button type="button" onClick={closeDrawer} aria-label="Close admin navigation" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-cream transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-champagne">
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-champagne">Signed in</p>
            <p className="mt-2 break-words text-sm text-sand">{email}</p>
          </div>
          <nav className="mt-6 space-y-1" aria-label="Admin drawer links">
            {NAV_ITEMS.map(({ href, label, Icon }, index) => {
              const active = matchesRoute(pathname, href);
              return (
                <Link key={href} ref={index === 0 ? firstDrawerLinkRef : undefined} href={href} onClick={closeDrawer} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-champagne ${active ? "bg-white/10 text-champagne" : "text-sand hover:bg-white/5 hover:text-cream"}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                  {label}
                </Link>
              );
            })}
            <Link href="/" onClick={closeDrawer} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold text-sand transition hover:bg-white/5 hover:text-cream focus:outline-none focus:ring-2 focus:ring-champagne">
              <Store className="h-5 w-5" aria-hidden />
              Storefront
            </Link>
          </nav>
          <form action="/auth/signout" method="post" className="mt-auto border-t border-white/10 pt-5">
            <Button type="submit" variant="ghost" className="min-h-12 w-full justify-start px-3 text-sand hover:bg-white/5 hover:text-cream">
              <LogOut className="mr-3 h-5 w-5" aria-hidden />
              Sign out
            </Button>
          </form>
        </aside>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-champagne/25 bg-ink/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-sand shadow-[0_-10px_30px_rgba(43,20,37,0.12)] backdrop-blur md:hidden" aria-label="Admin quick navigation">
        {NAV_ITEMS.filter(item => item.label !== "Categories").map(({ href, label, Icon }) => {
          const active = matchesRoute(pathname, href);
          return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold uppercase tracking-[0.08em] transition focus:outline-none focus:ring-2 focus:ring-champagne ${active ? "bg-white/10 text-champagne" : "hover:text-cream"}`}><Icon className="h-4 w-4" aria-hidden />{label}</Link>;
        })}
        <button type="button" onClick={() => setDrawerOpen(true)} aria-label="Open more admin navigation" className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-semibold uppercase tracking-[0.08em] transition hover:text-cream focus:outline-none focus:ring-2 focus:ring-champagne ${moreActive ? "bg-white/10 text-champagne" : "text-sand"}`}><MoreHorizontal className="h-4 w-4" aria-hidden />More</button>
      </nav>
    </>
  );
}
