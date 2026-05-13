import { redirect } from "next/navigation";
export default function OrdersShopPendingPage() {
  redirect("/admin/service-orders?status=pending");
}
