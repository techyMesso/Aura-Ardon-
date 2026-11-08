import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface SectionProps extends HTMLAttributes<HTMLElement> {
  surface?: "paper" | "stone" | "ink";
  containerClassName?: string;
}

export function Section({
  surface = "paper",
  className,
  containerClassName,
  children,
  ...props
}: SectionProps) {
  const surfaceClass =
    surface === "ink"
      ? "bg-ink text-white"
      : surface === "stone"
        ? "bg-stone text-text"
        : "bg-paper text-text";

  return (
    <section className={cn(surfaceClass, className)} {...props}>
      <div className={cn("mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-10 lg:py-16", containerClassName)}>
        {children}
      </div>
    </section>
  );
}
