import { Suspense } from "react";
import type { Metadata } from "next";

import { AdminNavigation } from "@/components/admin/admin-navigation";
import { AdminPwaRegister } from "@/components/admin/admin-pwa-register";
import { AdminSessionGuard } from "@/components/admin/admin-session-guard";
import { OwnerMfaBanner } from "@/components/admin/owner-mfa-banner";
import {
  getCurrentOwnerMfaState,
  isOwnerUser,
  requireAdminPage
} from "@/lib/auth";
import { getAdminIdleTimeoutMs } from "@/lib/session-timeout";
import { SITE_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: `${SITE_NAME} Admin`,
    template: `%s | ${SITE_NAME} Admin`
  },
  manifest: "/admin/manifest.webmanifest",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: `${SITE_NAME} Admin`,
    statusBarStyle: "black-translucent"
  }
};

export default async function AdminLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const user = await requireAdminPage();
  const timeoutMinutes = Math.round(getAdminIdleTimeoutMs() / 60000);
  const ownerMfaState = isOwnerUser(user)
    ? await getCurrentOwnerMfaState(user)
    : null;

  return (
    <main className="min-h-dvh min-w-0 overflow-x-hidden bg-paper px-4 py-4 text-text md:pl-80 md:pr-8 md:pt-8 lg:pr-12 print:p-0">
      <AdminPwaRegister />
      <AdminSessionGuard timeoutMinutes={timeoutMinutes} />
      <div className="mx-auto min-w-0 max-w-7xl space-y-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:space-y-0 md:pb-8 print:max-w-none print:pb-0">
        <AdminNavigation email={user?.email} role={user?.adminRole ?? "owner"} />
        <div className="min-w-0">
          {ownerMfaState?.shouldShowBanner ? (
            <Suspense>
              <OwnerMfaBanner
                initialState={ownerMfaState}
                email={user?.email}
              />
            </Suspense>
          ) : null}
          {children}
        </div>
      </div>
    </main>
  );
}
