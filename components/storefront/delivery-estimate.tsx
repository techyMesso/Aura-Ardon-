"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { computeDeliveryEstimate } from "@/lib/delivery-estimate";

interface DeliveryEstimateProps {
  sameDayCutoff: string;
  businessHours: string;
  isStoreOpen: boolean;
  holidayBannerMessage: string;
}

export function DeliveryEstimate({
  sameDayCutoff,
  businessHours,
  isStoreOpen,
  holidayBannerMessage
}: DeliveryEstimateProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const interval = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (!now) {
    return (
      <div className="space-y-1 pt-1 font-sans text-[14px] leading-[1.5] text-muted">
        <p>
          Same-day delivery in Nairobi for orders before {sameDayCutoff} EAT ({businessHours}).
        </p>
        <p className="text-[13px]">
          1–2 business days via courier outside Nairobi. Pay cash or M-Pesa on delivery.
        </p>
      </div>
    );
  }

  const estimate = computeDeliveryEstimate({
    now,
    sameDayCutoff,
    businessHours,
    isStoreOpen,
    holidayBannerMessage
  });

  return (
    <div className="space-y-1 rounded-[2px] border border-text/12 bg-stone px-3.5 py-3 font-sans text-[14px] leading-[1.45]">
      <p className="flex items-start gap-2 font-medium text-text">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brass" aria-hidden />
        <span>{estimate.headline}</span>
      </p>
      <p className="pl-6 text-[13px] text-muted">{estimate.subline}</p>
    </div>
  );
}

