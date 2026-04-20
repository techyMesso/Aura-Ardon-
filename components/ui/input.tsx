import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-2xl border border-border bg-white/80 px-4 text-sm text-ink outline-none transition placeholder:text-muted focus:border-bronze focus:ring-2 focus:ring-bronze/20",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";
