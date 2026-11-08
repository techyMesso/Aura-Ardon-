"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  side?: "right" | "left" | "bottom";
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  side = "right",
  children,
  footer,
  className
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  const panelPosition =
    side === "bottom"
      ? cn(
          "inset-x-0 bottom-0 max-h-[85dvh] w-full border-t border-text/15",
          open ? "translate-y-0" : "translate-y-full"
        )
      : side === "left"
        ? cn(
            "inset-y-0 left-0 h-full w-[min(22rem,calc(100%-2.5rem))] border-r border-text/15",
            open ? "translate-x-0" : "-translate-x-full"
          )
        : cn(
            "inset-y-0 right-0 h-full w-[min(26rem,100%)] border-l border-text/15",
            open ? "translate-x-0" : "translate-x-full"
          );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className={cn(
        "fixed inset-0 z-[70]",
        open ? "visible" : "invisible pointer-events-none"
      )}
    >
      <button
        type="button"
        tabIndex={open ? 0 : -1}
        aria-label={`Close ${title}`}
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/60 transition-opacity duration-200",
          open ? "opacity-100" : "opacity-0"
        )}
      />
      <div
        ref={panelRef}
        className={cn(
          "absolute flex flex-col bg-paper text-text transition-transform duration-200",
          panelPosition,
          className
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-text/12 px-5">
          <h2 className="font-sans text-[14px] font-medium text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="flex h-9 w-9 items-center justify-center rounded-[2px] text-text hover:text-brass"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <div className="shrink-0 border-t border-text/12 bg-paper px-5 py-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
