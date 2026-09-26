import Link from "next/link";
import { Gem } from "lucide-react";

export default function StorefrontNotFound() {
  return (
    <div className="flex min-h-[60dvh] items-center justify-center px-4 py-12 text-center">
      <div className="max-w-md rounded-[2rem] border border-border bg-white/75 p-7 shadow-card">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-champagne/35 text-bronze"><Gem className="h-6 w-6" aria-hidden /></span>
        <h1 className="mt-5 font-serif text-3xl text-ink">This piece has moved on</h1>
        <p className="mt-3 text-sm leading-6 text-muted">Browse the latest collection to find a new signature.</p>
        <Link href="/shop" className="btn-primary mt-6 min-h-12">Browse collection</Link>
      </div>
    </div>
  );
}
