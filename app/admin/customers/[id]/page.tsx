import { notFound } from "next/navigation";

import { CustomerDetailClient } from "@/components/admin/customer-detail-client";
import { getCustomerDetailBundle } from "@/lib/data";

export const metadata = {
  title: "Customer Detail",
  robots: { index: false, follow: false }
};

export default async function AdminCustomerDetailPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const bundle = await getCustomerDetailBundle(id);

  if (!bundle) notFound();

  return <CustomerDetailClient initialBundle={bundle} />;
}

