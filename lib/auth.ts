import { redirect } from "next/navigation";

import { getAdminEmail } from "@/lib/env";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase() === getAdminEmail());
}

export async function getCurrentUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  return user;
}

export async function requireAdminPage() {
  const user = await getCurrentUser();

  if (!isAdminEmail(user?.email)) {
    redirect("/login");
  }

  return user;
}

export async function assertAdminRequest() {
  const user = await getCurrentUser();

  if (!isAdminEmail(user?.email)) {
    throw new Error("UNAUTHORIZED");
  }

  return user;
}
