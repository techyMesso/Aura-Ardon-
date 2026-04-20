import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: string | number) {
  const amount = typeof value === "number" ? value : Number(value);

  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 2
  }).format(amount);
}

export function normalizeKenyanPhoneNumber(phone: string) {
  const digits = phone.replace(/[^\d]/g, "");

  if (digits.startsWith("254") && digits.length === 12) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `254${digits.slice(1)}`;
  }

  if (digits.startsWith("7") && digits.length === 9) {
    return `254${digits}`;
  }

  throw new Error("Enter a valid Safaricom phone number in 07xx or 2547xx format.");
}

export function toMoneyString(amount: number) {
  return amount.toFixed(2);
}
