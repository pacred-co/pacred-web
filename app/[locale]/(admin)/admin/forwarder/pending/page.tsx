import { redirect } from "next/navigation";
export default function ForwarderPendingPage() {
  redirect("/admin/forwarders?status=pending_payment");
}
