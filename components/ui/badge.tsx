import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
}

export function Badge({ children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border border-bronze/30 bg-sand px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-ink",
        className
      )}
    >
      {children}
    </span>
  );
}
