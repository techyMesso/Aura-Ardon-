import Link from "next/link";
import { ArrowUpRight, CheckCircle2, Circle, ListChecks } from "lucide-react";

import type { SetupChecklistSummary } from "@/lib/setup-checklist";

interface SetupChecklistCardProps {
  checklist: SetupChecklistSummary;
}

export function SetupChecklistCard({ checklist }: SetupChecklistCardProps) {
  if (checklist.isComplete) {
    return null;
  }

  return (
    <section
      aria-label="Store setup checklist"
      className="border border-brass/40 bg-paper p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-brass" aria-hidden />
            <h3 className="font-serif text-2xl text-text">Setup checklist</h3>
          </div>
          <p className="text-xs text-muted sm:text-sm">
            Finish these checks to get your store fully launch-ready. This card
            hides automatically once everything is complete.
          </p>
        </div>
        <span className="inline-flex items-center rounded-[2px] border border-brass/40 bg-stone px-2.5 py-1 text-xs font-semibold text-text">
          {checklist.completedCount} of {checklist.totalCount} complete
        </span>
      </div>

      <div
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-stone"
        role="progressbar"
        aria-valuenow={checklist.completedCount}
        aria-valuemin={0}
        aria-valuemax={checklist.totalCount}
        aria-label="Store setup progress"
      >
        <div
          className="h-full bg-brass transition-all duration-300"
          style={{ width: `${checklist.progressPercent}%` }}
        />
      </div>

      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {checklist.items.map(item => (
          <li key={item.id}>
            <Link
              href={item.href}
              className={`group flex h-full items-start justify-between gap-3 rounded-[2px] border p-3 transition focus:outline-none focus:ring-2 focus:ring-brass ${
                item.completed
                  ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50"
                  : "border-border bg-stone/40 hover:border-brass hover:bg-stone/70"
              }`}
            >
              <div className="flex items-start gap-2.5 min-w-0">
                {item.completed ? (
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-300"
                    aria-hidden
                  />
                ) : (
                  <Circle
                    className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
                    aria-hidden
                  />
                )}
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      item.completed
                        ? "text-muted line-through decoration-emerald-600/50"
                        : "text-text group-hover:text-brass"
                    }`}
                  >
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
                </div>
              </div>
              {!item.completed ? (
                <ArrowUpRight
                  className="mt-0.5 h-4 w-4 shrink-0 text-brass transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  aria-hidden
                />
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

