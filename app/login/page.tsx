import { Suspense } from "react";

import { AdminLoginForm } from "@/components/auth/admin-login-form";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  title: "Admin Login",
  description: "Sign in to the Auro Ardon store operations console.",
  pathname: "/login",
  noIndex: true
});

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
