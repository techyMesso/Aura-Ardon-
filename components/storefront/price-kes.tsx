import { cn } from "@/lib/utils";

export const DEFAULT_PRODUCT_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNGRkZGRkYiLz48L3N2Zz4=";

export function formatKES(amount: string | number): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(num)) {
    return "KES 0";
  }

  const hasFraction = Math.abs(num - Math.round(num)) > 0.001;
  const formatted = new Intl.NumberFormat("en-KE", {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0
  }).format(num);

  return `KES ${formatted}`;
}

export function PriceKES({
  amount,
  className
}: {
  amount: string | number;
  className?: string;
}) {
  return (
    <span className={cn("font-sans text-[14px] leading-[1.5] text-brass", className)}>
      {formatKES(amount)}
    </span>
  );
}
