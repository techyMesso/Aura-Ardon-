import * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 text-[14px] leading-[1.5] text-text outline-none transition-colors placeholder:text-muted focus:border-brass",
        className
      )}
      {...props}
    />
  )
);

Input.displayName = "Input";
