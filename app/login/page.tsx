import { Suspense } from "react";

import { AdminLoginForm } from "@/components/auth/admin-login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Login",
  robots: { index: false, follow: false }
};

export default function LoginPage() {
  const configured = Boolean(process.env.ADMIN_EMAIL?.trim());

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 py-16 text-text">
      <div className="w-full max-w-md">
        <Suspense>
          <AdminLoginForm configured={configured} />
        </Suspense>
      </div>
    </main>
  );
}
