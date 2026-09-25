import { PackageCheck, PackageX, TriangleAlert } from "lucide-react";

import { getProductStockStatus } from "@/lib/admin-product-filters";

interface ProductStockStatusProps {
  quantity: number;
}

const statusStyles = {
  "in-stock": "border-green-200 bg-green-50 text-green-800",
  "low-stock": "border-amber-300 bg-amber-50 text-amber-900",
  "out-of-stock": "border-red-200 bg-red-50 text-red-800"
};

export function ProductStockStatus({ quantity }: ProductStockStatusProps) {
  const status = getProductStockStatus(quantity);
  const details = {
    "in-stock": { label: "In stock", Icon: PackageCheck },
    "low-stock": { label: "Low stock", Icon: TriangleAlert },
    "out-of-stock": { label: "Out of stock", Icon: PackageX }
  }[status];
  const { Icon } = details;

  return (
    <span
      className={`inline-flex min-w-28 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[status]}`}
      aria-label={`${details.label}: ${quantity} available`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span>{quantity} - {details.label}</span>
    </span>
  );
}
