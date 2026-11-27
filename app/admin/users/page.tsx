import {
  TeamRolesManager,
  type TeamMemberRecord
} from "@/components/admin/team-roles-manager";
import { requireOwnerPage } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export const metadata = {
  title: "Team & Roles | Admin",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const ownerUser = await requireOwnerPage();
  const supabase = createAdminSupabaseClient();

  const { data } = await supabase
    .from("admin_users")
    .select("user_id, email, full_name, role, active, created_by, created_at, updated_at")
    .order("role", { ascending: true })
    .order("created_at", { ascending: true });

  return (
    <TeamRolesManager
      currentUserId={ownerUser.id}
      initialUsers={(data ?? []) as unknown as TeamMemberRecord[]}
    />
  );
}

