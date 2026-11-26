"use client";

import { useEffect } from "react";

export function AdminPwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    navigator.serviceWorker
      .register("/admin-sw.js", { scope: "/admin/" })
      .catch(() => {
        // Non-blocking: browsers without SW or private windows simply skip push
      });
  }, []);

  return null;
}

