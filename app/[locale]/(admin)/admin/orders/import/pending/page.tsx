import { redirect } from "next/navigation";
export default function OrdersImportPendingPage() {
  redirect("/admin/forwarders?status=pending_payment");
}
