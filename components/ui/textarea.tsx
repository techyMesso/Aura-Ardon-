import * as React from "react";

import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "min-h-24 w-full rounded-[2px] border border-text/20 bg-paper px-3.5 py-2.5 text-[14px] leading-[1.5] text-text outline-none transition-colors placeholder:text-muted focus:border-brass",
        className
      )}
      {...props}
    />
  )
);

Textarea.displayName = "Textarea";
