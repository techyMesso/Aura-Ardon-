import { permanentRedirect } from "next/navigation";

import { productHref } from "@/lib/catalog";
import { getProductBySlug } from "@/lib/data";

interface LegacyProductPageProps {
  params: Promise<{ category: string; product: string }>;
}

export default async function LegacyProductRedirectPage({
  params
}: LegacyProductPageProps) {
  const { product: productSlug } = await params;
  const decodedSlug = decodeURIComponent(productSlug);
  const product = await getProductBySlug(decodedSlug);

  if (product) {
    permanentRedirect(productHref(product));
  }

  permanentRedirect(`/p/${encodeURIComponent(decodedSlug)}`);
}
