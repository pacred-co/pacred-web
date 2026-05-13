import { redirect } from "next/navigation";

export default function AdminWithdrawalsPage() {
  redirect("/admin/wallet?kind=withdraw&status=pending");
}
