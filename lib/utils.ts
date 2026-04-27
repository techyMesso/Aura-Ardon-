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

export interface WhatsAppOrderItem {
  title: string;
  quantity: number;
}

export interface WhatsAppMessageOrder {
  orderId: string;
  customerName: string;
  total: string | number;
  items: WhatsAppOrderItem[];
  confirmationMessage?: string;
  deliveryLocation?: string | null;
}

interface WhatsAppOrderLinkInput extends WhatsAppMessageOrder {
  phoneNumber: string;
}

export function generateWhatsAppMessage({
  orderId,
  customerName,
  total,
  items,
  confirmationMessage = "Your order has been received. We will contact you shortly.",
  deliveryLocation
}: WhatsAppMessageOrder) {
  const itemSummary = items.map(item => `${item.title} x${item.quantity}`).join(", ");
  const formattedTotal = typeof total === "number" ? toMoneyString(total) : total;
  const messageParts = [
    `Hello ${customerName}, your order #${orderId} has been received.`,
    confirmationMessage,
    `Items: ${itemSummary}`,
    `Total: KES ${formattedTotal}`
  ];

  if (deliveryLocation) {
    messageParts.push(`Delivery location: ${deliveryLocation}`);
  }

  return messageParts.join("\n");
}

export function createWhatsAppLink(phoneNumber: string, message: string) {
  const normalizedPhoneNumber = phoneNumber.replace(/[^\d]/g, "");

  return `https://wa.me/${normalizedPhoneNumber}?text=${encodeURIComponent(message)}`;
}

export function createWhatsAppOrderUrl({
  phoneNumber,
  orderId,
  customerName,
  deliveryLocation,
  total,
  items
}: WhatsAppOrderLinkInput) {
  const message = generateWhatsAppMessage({
    orderId,
    customerName,
    total,
    items,
    confirmationMessage: "We will confirm the next steps with you shortly.",
    deliveryLocation
  });

  return createWhatsAppLink(phoneNumber, message);
}
