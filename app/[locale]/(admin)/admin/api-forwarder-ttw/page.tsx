/**
 * /admin/api-forwarder-ttw — TTW/อี้อู packing (แผนก DOC).
 *
 * owner ภูม 2026-07-25 · แยกหน้าตามแผนก: CS คีย์ใบส่งของที่ /admin/api-forwarder-yiwu →
 * DOC อัปไฟล์ packing list ที่หน้านี้.
 *
 *   ① อัปไฟล์ packing list → จับคู่กับ 单号 ที่ CS คีย์ไว้ → ผูกเลขตู้จริง + เลื่อนสถานะเป็น
 *      "กำลังเดินทางมาไทย" (money-free · ไม่แตะน้ำหนัก/ราคา · reuse yiwu-packing-reconcile).
 *   ② ด้านล่าง — staging `ttw_packing_line` (ตู้ที่ ingest ไว้ · ยังไม่รู้ของใคร 会员=YY) →
 *      CS จับคู่ มาร์ค(唛头) → ใส่ PR.
 *
 * 🔴 STAGE 2 (money-path · ทำแยกรอบ): ปุ่ม "เอาเข้าระบบ" สำหรับ 单号 ที่เป็นของเราแต่ยังไม่ในระบบ
 *    (CS ลืมคีย์ · packing reconcile รายงานเป็น unmatched) → สร้าง tb_forwarder อี้อู + กันซ้ำ.
 */
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { TtwStagingClient, type TtwLine } from "./ttw-staging-client";
import { YiwuPackingClient } from "../api-forwarder-yiwu/yiwu-packing-client";

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
    const { data: us, error: usErr } = await admin.from("tb_users").select("userID, userName").in("userID", prs);
    if (usErr) {
      console.error("[api-forwarder-ttw] customer-name lookup failed", { code: usErr.code, message: usErr.message });
    }
    for (const u of (us ?? []) as { userID: string; userName: string | null }[]) {
      nameByPr[u.userID] = u.userName ?? "";
    }
  }

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/forwarders" className="hover:text-primary-600">ฝากนำเข้า</Link>
        <span>›</span>
        <span className="text-foreground font-medium">TTW / อี้อู · packing</span>
      </nav>

      {/* Header */}
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">
          ADMIN · TTW / อี้อู · PACKING LIST <span className="ml-1 rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">แผนก DOC</span>
        </p>
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-white shadow-sm">📦</span>
          TTW / อี้อู — Packing List
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          แผนก DOC อัปไฟล์ <strong>packing list</strong> → <strong>ผูกเลขตู้จริง</strong> + เลื่อนสถานะเป็น{" "}
          <strong className="text-sky-700">กำลังเดินทางมาไทย</strong> (จับคู่กับใบส่งของที่ CS คีย์ไว้ · ไม่แตะน้ำหนัก/ราคา).
        </p>
      </header>

      {/* ① upload packing list (ย้ายจากหน้า CS · owner ภูม 2026-07-25) */}
      <YiwuPackingClient />

      {/* ② staging — ใส่ PR (มาร์ค→ลูกค้า) */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-medium tracking-widest text-muted">รายการค้างในตู้ · ใส่ PR ให้ลูกค้า</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>
      <TtwStagingClient rows={rows} nameByPr={nameByPr} loadError={!!error} hideTitle />
    </main>
  );
}
