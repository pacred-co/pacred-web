import { redirect } from "next/navigation";
export default function OrdersPendingPage() {
  redirect("/admin/service-orders?status=pending");
}
