import { Suspense } from "react";

import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { getAdminEmail } from "@/lib/env";

export default function LoginPage() {
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
