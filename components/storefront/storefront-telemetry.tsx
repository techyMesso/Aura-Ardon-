"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { shouldDropTelemetryEvent } from "@/lib/internal-traffic";

function readBrowserCookies(): string {
  return typeof document !== "undefined" ? document.cookie : "";
}

export function StorefrontTelemetry() {
  return (
    <>
      <Analytics
        beforeSend={(event: BeforeSendEvent) => {
          if (shouldDropTelemetryEvent(event.url, readBrowserCookies())) {
            return null;
          }
          return event;
        }}
      />
      <SpeedInsights
        beforeSend={event => {
          if (shouldDropTelemetryEvent(event.url, readBrowserCookies())) {
            return null;
          }
          return event;
        }}
      />
    </>
  );
}

