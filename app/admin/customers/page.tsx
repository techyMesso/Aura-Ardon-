import { CustomerList } from "@/components/admin/customer-list";
import { listAdminCustomers, listOptedInCustomers } from "@/lib/data";

export const metadata = {
  title: "Customers Admin",
  robots: { index: false, follow: false }
};

export default async function AdminCustomersPage() {
  const [customers, optedIn] = await Promise.all([
    listAdminCustomers(),
    listOptedInCustomers()
  ]);

  return (
    <CustomerList
      initialCustomers={customers}
      optedInCount={optedIn.length}
    />
  );
}

