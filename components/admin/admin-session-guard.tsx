"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";

import { Button } from "@/components/ui/button";

interface AdminSessionGuardProps {
  timeoutMinutes?: number;
}

const WARNING_LEAD_MS = 2 * 60 * 1000; // warn 2 minutes before idle sign-out
const PING_THROTTLE_MS = 60 * 1000;

export function AdminSessionGuard({
  timeoutMinutes = 30
}: AdminSessionGuardProps) {
  const timeoutMs = Math.max(5, timeoutMinutes) * 60 * 1000;
  const lastActivityRef = useRef<number>(Date.now());
  const lastPingRef = useRef<number>(Date.now());
  const signingOutRef = useRef(false);
  const [showWarning, setShowWarning] = useState(false);

  const pingServer = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/session/ping", {
        method: "POST"
      });
      if (response.status === 401) {
        window.location.href = "/login?reason=timeout";
        return;
      }
      lastActivityRef.current = Date.now();
      lastPingRef.current = Date.now();
      setShowWarning(false);
    } catch {
      // Ignore transient network failures
    }
  }, []);

  useEffect(() => {
    const markActive = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      setShowWarning(false);

      if (now - lastPingRef.current >= PING_THROTTLE_MS) {
        lastPingRef.current = now;
        void fetch("/api/admin/session/ping", { method: "POST" }).catch(() => {});
      }
    };

    const events: Array<keyof WindowEventMap> = [
      "pointerdown",
      "keydown",
      "scroll",
      "touchstart"
    ];
    for (const evt of events) {
      window.addEventListener(evt, markActive, { passive: true });
    }

    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityRef.current;
      if (idleMs >= timeoutMs && !signingOutRef.current) {
        signingOutRef.current = true;
        void fetch("/auth/signout", { method: "POST" }).finally(() => {
          window.location.href = "/login?reason=timeout";
        });
        return;
      }

      if (idleMs >= timeoutMs - WARNING_LEAD_MS) {
        setShowWarning(true);
      }
    }, 15_000);

    return () => {
      for (const evt of events) {
        window.removeEventListener(evt, markActive);
      }
      window.clearInterval(timer);
    };
  }, [timeoutMs]);

  if (!showWarning) return null;

  return (
    <div
      role="alertdialog"
      aria-label="Session expiring soon"
      className="fixed bottom-20 right-4 z-[65] max-w-sm border border-amber-500/60 bg-paper p-4 shadow-lg md:bottom-6"
    >
      <div className="flex items-start gap-2.5">
        <Clock
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300"
          aria-hidden
        />
        <div className="space-y-2">
          <p className="text-sm font-medium text-text">
            Session timing out soon
          </p>
          <p className="text-xs text-muted">
            For security, inactive admin sessions sign out after {timeoutMinutes}{" "}
            minutes.
          </p>
          <Button type="button" className="h-9 px-3 text-xs" onClick={() => void pingServer()}>
            Stay signed in
          </Button>
        </div>
      </div>
    </div>
  );
}

