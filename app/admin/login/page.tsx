import { Suspense } from "react";

import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { getAdminEmail } from "@/lib/env";

export const metadata = {
  title: "Admin Login | Auro Ardon",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  const adminEmail = getAdminEmail();

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <Suspense>
          <AdminLoginForm adminEmail={adminEmail} />
        </Suspense>
      </div>
    </main>
  );
}
