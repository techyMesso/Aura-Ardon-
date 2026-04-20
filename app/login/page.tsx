import { AdminLoginForm } from "@/components/auth/admin-login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <AdminLoginForm />
      </div>
    </main>
  );
}
