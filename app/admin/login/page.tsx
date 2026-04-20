import { AdminLoginForm } from "@/components/auth/admin-login-form";

export const metadata = {
  title: "Admin Login | Auro Ardon",
  robots: { index: false, follow: false },
};

export default function AdminLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <AdminLoginForm />
      </div>
    </main>
  );
}
