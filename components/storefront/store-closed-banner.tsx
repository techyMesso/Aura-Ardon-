import { Info } from "lucide-react";

interface StoreClosedBannerProps {
  isStoreOpen: boolean;
  holidayBannerMessage: string;
}

export function StoreClosedBanner({
  isStoreOpen,
  holidayBannerMessage
}: StoreClosedBannerProps) {
  const customMessage = holidayBannerMessage.trim();
  if (isStoreOpen && !customMessage) {
    return null;
  }

  const displayMessage = !isStoreOpen
    ? customMessage ||
      "Our Nairobi studio is currently closed for orders. You are welcome to browse — sending orders will resume as soon as we reopen."
    : customMessage;

  return (
    <div
      role="status"
      className="border-b border-brass/40 bg-stone px-4 py-2.5 text-center font-sans text-[13px] leading-[1.45] text-text"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2">
        <Info className="h-4 w-4 shrink-0 text-brass" aria-hidden />
        <span>{displayMessage}</span>
      </div>
    </div>
  );
}

