import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "destructive";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-brass text-ink transition-colors duration-150 hover:bg-brass/90 disabled:opacity-50",
  secondary:
    "border border-text/30 bg-transparent text-text transition-colors duration-150 hover:border-brass hover:text-brass disabled:opacity-50",
  ghost:
    "bg-transparent text-text transition-colors duration-150 hover:text-brass disabled:opacity-50",
  destructive:
    "bg-red-700 text-white transition-colors duration-150 hover:bg-red-800 disabled:opacity-50"
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex min-h-11 items-center justify-center rounded-[2px] px-5 py-2.5 text-[14px] font-medium leading-[1.5]",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
