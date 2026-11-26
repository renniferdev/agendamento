import { AdminLayout } from "../components/AdminLayout";
import { CustomerList } from "../components/CustomerList";

export function AdminCustomersPage() {
  return (
    <AdminLayout title="Clientes">
      <CustomerList endpoint="/admin/customers" />
    </AdminLayout>
  );
}
