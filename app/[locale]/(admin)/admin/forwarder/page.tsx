import { redirect } from "next/navigation";

export default function ForwarderRedirect() {
  redirect("/admin/forwarders");
}
