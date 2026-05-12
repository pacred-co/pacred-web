import { notFound } from "next/navigation";
import { getMyTeamRoles } from "@/actions/sales";

/**
 * Layout for /sales routes — gates access to users who have at least
 * one active team_leader row. Non-leaders get a 404 (matches the
 * legacy hardcoded whitelist behavior, but extensible via DB).
 */
export default async function SalesLayout({ children }: { children: React.ReactNode }) {
  const res = await getMyTeamRoles();
  if (!res.ok || (res.data ?? []).length === 0) {
    notFound();
  }
  return <>{children}</>;
}
