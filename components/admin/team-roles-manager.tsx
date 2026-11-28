"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface TeamMemberRecord {
  user_id: string;
  email: string;
  full_name: string | null;
  role: "owner" | "staff";
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface TeamRolesManagerProps {
  currentUserId: string;
  initialUsers: TeamMemberRecord[];
}

export function TeamRolesManager({
  currentUserId,
  initialUsers
}: TeamRolesManagerProps) {
  const [users, setUsers] = useState<TeamMemberRecord[]>(initialUsers);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"staff" | "owner">("staff");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFeedback(null);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          fullName: fullName.trim(),
          role,
          password
        })
      });
      const payload = (await response.json()) as {
        user?: TeamMemberRecord;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Unable to create team account.");
      }

      setUsers(prev => [...prev, payload.user!]);
      setEmail("");
      setFullName("");
      setPassword("");
      setRole("staff");
      setFeedback({
        ok: true,
        message: `Created ${payload.user.role} account for ${payload.user.email}.`
      });
    } catch (caughtError) {
      setFeedback({
        ok: false,
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to create team account."
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateUser(
    userId: string,
    updates: { role?: "owner" | "staff"; active?: boolean }
  ) {
    setBusyId(userId);
    setFeedback(null);

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates)
      });
      const payload = (await response.json()) as {
        user?: TeamMemberRecord;
        error?: string;
      };
      if (!response.ok || !payload.user) {
        throw new Error(payload.error || "Unable to update team account.");
      }

      setUsers(prev =>
        prev.map(item => (item.user_id === userId ? payload.user! : item))
      );
      setFeedback({
        ok: true,
        message: `Updated permissions for ${payload.user.email}.`
      });
    } catch (caughtError) {
      setFeedback({
        ok: false,
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to update team account."
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-8">
      <section className="border-b border-border pb-6">
        <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brass">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Owner-only access control
        </p>
        <h2 className="mt-1 font-serif text-3xl text-text sm:text-4xl">
          Team &amp; roles
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm text-muted">
          Roles are enforced in Postgres RLS policies, API routes, and admin pages.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="border border-border bg-paper p-4 text-xs">
            <p className="font-semibold uppercase tracking-wider text-brass">
              Owner role
            </p>
            <p className="mt-1 text-muted">
              Full access: orders, customers, stock, invoices, riders, settings, cost prices, profit/margins, discounts admin, team management, and the immutable audit log.
            </p>
          </div>
          <div className="border border-border bg-paper p-4 text-xs">
            <p className="font-semibold uppercase tracking-wider text-text">
              Staff role
            </p>
            <p className="mt-1 text-muted">
              Operational access: orders, customers, stock adjustments, invoices &amp; payments, riders, and review moderation. Blocked from settings, cost prices, profit, discounts admin, user management, and the audit log.
            </p>
          </div>
        </div>
      </section>

      {feedback ? (
        <div
          role={feedback.ok ? "status" : "alert"}
          className={`rounded-[2px] border px-4 py-3 text-sm ${
            feedback.ok
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-red-400/50 bg-red-500/10 text-red-600 dark:text-red-400"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="border border-border bg-paper p-5">
        <h3 className="font-serif text-2xl text-text">Add team account</h3>
        <form
          onSubmit={handleCreateUser}
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="space-y-1 text-xs text-muted">
            <span>Full name</span>
            <Input
              required
              placeholder="e.g. Mercy Njeri"
              value={fullName}
              onChange={event => setFullName(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>Email address</span>
            <Input
              required
              type="email"
              placeholder="staff@auroardon.co.ke"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>Role</span>
            <select
              value={role}
              onChange={event =>
                setRole(event.target.value === "owner" ? "owner" : "staff")
              }
              className="h-10 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text focus:border-brass focus:outline-none"
            >
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </select>
          </label>
          <label className="space-y-1 text-xs text-muted">
            <span>Initial password (min 10 chars)</span>
            <Input
              required
              type="password"
              minLength={10}
              placeholder="Strong password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </label>
          <div className="sm:col-span-2 lg:col-span-4">
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                  Creating account...
                </>
              ) : (
                <>
                  <UserPlus className="mr-2 h-4 w-4" aria-hidden />
                  Create account
                </>
              )}
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <h3 className="font-serif text-2xl text-text">
          Current accounts ({users.length})
        </h3>
        <div className="divide-y divide-border border border-border bg-paper">
          {users.map(member => {
            const isSelf = member.user_id === currentUserId;
            const busy = busyId === member.user_id;
            return (
              <div
                key={member.user_id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-text">
                      {member.full_name || member.email}
                    </p>
                    <span
                      className={`rounded-[2px] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${
                        member.role === "owner"
                          ? "bg-brass text-ink"
                          : "bg-stone text-text"
                      }`}
                    >
                      {member.role}
                    </span>
                    {!member.active ? (
                      <span className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                        Disabled
                      </span>
                    ) : null}
                    {isSelf ? (
                      <span className="text-xs text-muted">(You)</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted">{member.email}</p>
                </div>

                {!isSelf ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      className="h-9 px-3 text-xs"
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void handleUpdateUser(member.user_id, {
                          role: member.role === "owner" ? "staff" : "owner"
                        })
                      }
                    >
                      Switch to {member.role === "owner" ? "staff" : "owner"}
                    </Button>
                    <Button
                      type="button"
                      className="h-9 px-3 text-xs"
                      variant={member.active ? "destructive" : "default"}
                      disabled={busy}
                      onClick={() =>
                        void handleUpdateUser(member.user_id, {
                          active: !member.active
                        })
                      }
                    >
                      {member.active ? "Disable access" : "Re-enable"}
                    </Button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

