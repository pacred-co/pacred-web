/**
 * /admin/api-forwarder-ttw — TTW/อี้อู (Yiwu) packing-list STAGING + CS PR-assign.
 *
 * The Yiwu warehouse's packing lists (mig 0262 · ttw_packing_line) land here with the
 * warehouse's own 单号 tracking + a 唛头 mark but NO customer/PR yet (会员="YY"). CS
 * matches the mark ↔ a delivery note → the real PR + fills it in (owner 2026-07-18:
 * "เอาแทรคกิ้งและ data เข้าระบบไปก่อน · CS มาช่วยกันใส่ PR เอาใบส่งของมาจับคู่").
 *
 * READ-only reference + PR-assign only — NOT a billable surface. Committing a staged
 * row to a real tb_forwarder shipment (grouping) is a separate later step.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { TtwStagingClient, type TtwLine } from "./ttw-staging-client";

export const dynamic = "force-dynamic";

export default async function AdminApiForwarderTtwPage() {
  await requireAdmin(["super", "ops", "sales", "sales_admin", "accounting", "warehouse"]);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("ttw_packing_line")
    .select(
      "id,container_no,base_tracking,shipping_mark,member_code,pr_source,warehouse,origin,transport_mode,boxes,weight_kg,cbm,product_name,sm_date,committed_forwarder_id",
    )
    .order("container_no", { ascending: true })
    .order("base_tracking", { ascending: true })
    .limit(5000);
  if (error) {
    console.error("[api-forwarder-ttw] load failed", { code: error.code, message: error.message });
  }

  const rows = (data ?? []) as TtwLine[];

  // Resolve customer names for the assigned PRs (feedback badge · one query).
  const prs = Array.from(new Set(rows.map((r) => r.member_code).filter((v): v is string => !!v)));
  const nameByPr: Record<string, string> = {};
  if (prs.length > 0) {
    // Soft-fail — the name is a decorative badge beside the PR; on error the rows
    // still render with their PR (same fail-soft posture as the main load above).
    const { data: us, error: usErr } = await admin.from("tb_users").select("userID, userName").in("userID", prs);
    if (usErr) {
      console.error("[api-forwarder-ttw] customer-name lookup failed", { code: usErr.code, message: usErr.message });
    }
    for (const u of (us ?? []) as { userID: string; userName: string | null }[]) {
      nameByPr[u.userID] = u.userName ?? "";
    }
  }

  return <TtwStagingClient rows={rows} nameByPr={nameByPr} loadError={!!error} />;
}
