import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "secondary" | "ghost" | "destructive";
};

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default:
    "bg-ink text-white shadow-luxe transition hover:bg-[#3d3025] disabled:opacity-60",
  secondary:
    "bg-champagne text-ink transition hover:bg-[#b88e40] disabled:opacity-60",
  ghost:
    "bg-transparent text-ink transition hover:bg-white/70 disabled:opacity-60",
  destructive:
    "bg-red-700 text-white transition hover:bg-red-800 disabled:opacity-60"
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold tracking-[0.18em] uppercase",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);

Button.displayName = "Button";
