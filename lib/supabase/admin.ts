import { createClient } from "@supabase/supabase-js";

import { getServiceRoleKey, getSupabaseEnv } from "@/lib/env";

let adminClient: ReturnType<typeof createClient> | null = null;

export function createAdminSupabaseClient() {
  if (adminClient) {
    return adminClient;
  }

  const { url } = getSupabaseEnv();
  const serviceRoleKey = getServiceRoleKey();

  adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  return adminClient;
}
