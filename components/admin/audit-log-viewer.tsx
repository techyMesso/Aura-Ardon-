"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  Search,
  ShieldCheck
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildCsvContent } from "@/lib/analytics";
import { AUDIT_ENTITY_OPTIONS, type AuditLogEntry } from "@/lib/audit-types";

interface AuditLogViewerProps {
  initialEntries: AuditLogEntry[];
  initialTotal: number;
}

function formatEatTimestamp(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-KE", {
    timeZone: "Africa/Nairobi",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
}

export function AuditLogViewer({
  initialEntries,
  initialTotal
}: AuditLogViewerProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>(initialEntries);
  const [total, setTotal] = useState(initialTotal);
  const [entity, setEntity] = useState("all");
  const [actor, setActor] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 50;

  async function fetchAuditLogs(nextOffset = 0) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(nextOffset)
      });
      if (entity !== "all") params.set("entity", entity);
      if (actor.trim()) params.set("actor", actor.trim());
      if (query.trim()) params.set("q", query.trim());
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const response = await fetch(`/api/admin/audit?${params.toString()}`);
      const payload = (await response.json()) as {
        entries?: AuditLogEntry[];
        total?: number;
        error?: string;
      };
      if (!response.ok || !payload.entries) {
        throw new Error(payload.error || "Unable to load audit log.");
      }

      setEntries(payload.entries);
      setTotal(payload.total ?? payload.entries.length);
      setOffset(nextOffset);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : "Unable to load audit log."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleExportCsv() {
    const csv = buildCsvContent(
      [
        "Timestamp (UTC)",
        "Actor Email",
        "Role",
        "Action",
        "Entity",
        "Entity ID",
        "Before JSON",
        "After JSON"
      ],
      entries.map(item => [
        item.created_at,
        item.actor_email,
        item.actor_role,
        item.action,
        item.entity,
        item.entity_id ?? "",
        item.before_data ? JSON.stringify(item.before_data) : "",
        item.after_data ? JSON.stringify(item.after_data) : ""
      ])
    );

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "auro-ardon-audit-log.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="inline-flex items-center gap-1.5 text-sm font-medium text-brass">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Owner-only · Append-only immutable trail
          </p>
          <h2 className="mt-1 font-serif text-3xl text-text sm:text-4xl">
            Audit log
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            Every price change, stock adjustment, order status transition, payment, credit note, discount edit, setting change, role change, and customer anonymisation is recorded with before/after JSON snapshots.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={entries.length === 0}
            onClick={handleExportCsv}
          >
            <Download className="mr-2 h-4 w-4" aria-hidden />
            Export CSV
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => void fetchAuditLogs(offset)}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              aria-hidden
            />
            Refresh
          </Button>
        </div>
      </section>

      <form
        onSubmit={event => {
          event.preventDefault();
          void fetchAuditLogs(0);
        }}
        className="grid gap-3 border border-border bg-stone/40 p-4 sm:grid-cols-2 lg:grid-cols-6"
      >
        <label className="space-y-1 text-xs text-muted">
          <span>Entity</span>
          <select
            value={entity}
            onChange={event => setEntity(event.target.value)}
            className="h-10 w-full rounded-[2px] border border-text/20 bg-paper px-3 text-sm text-text focus:border-brass focus:outline-none"
          >
            <option value="all">All entities</option>
            {AUDIT_ENTITY_OPTIONS.map(opt => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-xs text-muted">
          <span>Actor email</span>
          <Input
            placeholder="e.g. staff@..."
            value={actor}
            onChange={event => setActor(event.target.value)}
          />
        </label>

        <label className="space-y-1 text-xs text-muted">
          <span>Action / Entity ID</span>
          <Input
            placeholder="e.g. price_updated"
            value={query}
            onChange={event => setQuery(event.target.value)}
          />
        </label>

        <label className="space-y-1 text-xs text-muted">
          <span>From (EAT)</span>
          <Input
            type="date"
            value={from}
            onChange={event => setFrom(event.target.value)}
          />
        </label>

        <label className="space-y-1 text-xs text-muted">
          <span>To (EAT)</span>
          <Input
            type="date"
            value={to}
            onChange={event => setTo(event.target.value)}
          />
        </label>

        <div className="flex items-end">
          <Button type="submit" disabled={loading} className="w-full">
            <Search className="mr-2 h-4 w-4" aria-hidden />
            Filter
          </Button>
        </div>
      </form>

      {error ? (
        <p
          role="alert"
          className="rounded-[2px] border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400"
        >
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between text-xs text-muted">
        <span>
          Showing {entries.length} of {total} immutable audit{" "}
          {total === 1 ? "entry" : "entries"}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            className="h-9 px-3 text-xs"
            variant="ghost"
            disabled={loading || offset === 0}
            onClick={() => void fetchAuditLogs(Math.max(0, offset - limit))}
          >
            Previous
          </Button>
          <Button
            type="button"
            className="h-9 px-3 text-xs"
            variant="ghost"
            disabled={loading || offset + limit >= total}
            onClick={() => void fetchAuditLogs(offset + limit)}
          >
            Next
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="border border-border bg-paper p-8 text-center">
          <p className="font-serif text-2xl text-text">No audit entries match</p>
          <p className="mt-1 text-sm text-muted">
            Admin writes will automatically appear here as changes are made.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border border-border bg-paper">
          {entries.map(item => {
            const expanded = expandedId === item.id;
            return (
              <article key={item.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-[2px] bg-stone px-2 py-0.5 font-mono text-xs font-medium text-text">
                        {item.action}
                      </span>
                      <span className="rounded-[2px] border border-border px-2 py-0.5 text-xs text-muted">
                        {item.entity}
                      </span>
                      <span
                        className={`rounded-[2px] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider ${
                          item.actor_role === "owner"
                            ? "bg-brass/20 text-brass"
                            : "bg-stone text-muted"
                        }`}
                      >
                        {item.actor_role}
                      </span>
                    </div>
                    <p className="text-sm text-text">
                      <strong>{item.actor_email}</strong>
                      {item.entity_id ? (
                        <span className="ml-2 font-mono text-xs text-muted">
                          #{item.entity_id}
                        </span>
                      ) : null}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <time className="text-xs text-muted">
                      {formatEatTimestamp(item.created_at)}
                    </time>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedId(expanded ? null : item.id)
                      }
                      aria-expanded={expanded}
                      className="inline-flex min-h-8 items-center gap-1 rounded-[2px] border border-border px-2.5 text-xs font-medium text-text hover:border-brass hover:text-brass"
                    >
                      {expanded ? (
                        <>
                          Hide diff
                          <ChevronUp className="h-3.5 w-3.5" aria-hidden />
                        </>
                      ) : (
                        <>
                          JSON diff
                          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {expanded ? (
                  <div className="mt-4 grid gap-3 border-t border-border pt-3 md:grid-cols-2">
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                        Before
                      </p>
                      <pre className="max-h-64 overflow-auto border border-border bg-stone/60 p-3 font-mono text-xs text-text">
                        {item.before_data
                          ? JSON.stringify(item.before_data, null, 2)
                          : "null"}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted">
                        After
                      </p>
                      <pre className="max-h-64 overflow-auto border border-border bg-stone/60 p-3 font-mono text-xs text-text">
                        {item.after_data
                          ? JSON.stringify(item.after_data, null, 2)
                          : "null"}
                      </pre>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

