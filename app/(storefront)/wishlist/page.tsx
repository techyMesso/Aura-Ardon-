import { WishlistPageClient } from "@/components/storefront/wishlist-page-client";
import { buildPageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export const metadata = buildPageMetadata({
  title: "Wishlist",
  description:
    "View your saved Auro Ardon jewelry, watches, and beauty picks ready to move to your bag.",
  pathname: "/wishlist",
  noIndex: true
});

export default function WishlistPage() {
  return <WishlistPageClient />;
}

