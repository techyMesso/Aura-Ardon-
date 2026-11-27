import { NextResponse } from "next/server";

import { buildSiteUrl } from "@/lib/env";
import { OWNER_MFA_SKIP_SESSION_COOKIE } from "@/lib/owner-mfa";
import { ADMIN_ACTIVITY_COOKIE } from "@/lib/session-timeout";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();

  const origin = (() => {
    try {
      return new URL(request.url).origin;
    } catch {
      return undefined;
    }
  })();

  const response = NextResponse.redirect(buildSiteUrl("/", origin));
  response.cookies.delete(ADMIN_ACTIVITY_COOKIE);
  response.cookies.delete(OWNER_MFA_SKIP_SESSION_COOKIE);
  return response;
}
