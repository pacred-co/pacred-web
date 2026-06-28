/**
 * /admin/forwarders/[fNo]/customs-doc — เลือกสินค้า → สร้างใบขน/ใบกำกับ (ร่าง)
 * (owner 2026-06-28 #1). The cargo item-picker: tick the ฝากนำเข้า items to
 * include, choose doc type, create a DRAFT customs-declaration seeded from them
 * (HS + มูลค่าสำแดง pre-filled). Editable/issued via the existing customs-
 * declaration flow. Read here · the create mutation is in the guarded action.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { CargoDocPicker, type PickItem } from "./cargo-doc-picker";

export const dynamic = "force-dynamic";

export default async function CargoCustomsDocPage({ params }: { params: Promise<{ fNo: string }> }) {
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);
  const { fNo } = await params;
  const fid = Number(fNo);
  if (!Number.isFinite(fid) || fid <= 0) notFound();

  const admin = createAdminClient();
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, fcabinetnumber, ftrackingchn, userid")
    .eq("id", fid)
    .maybeSingle<{ id: number; fcabinetnumber: string | null; ftrackingchn: string | null; userid: string | null }>();
  if (fwdErr) console.error("[customs-doc forwarder] failed", { code: fwdErr.code, message: fwdErr.message });
  if (!fwd) notFound();

  const { data: itemsRaw, error: itemsErr } = await admin
    .from("tb_forwarder_item")
    .select("id, hs_code, productname, productqty, productweightall, declared_value_thb")
    .eq("fid", fid)
    .order("id", { ascending: true });
  if (itemsErr) console.error("[customs-doc items] failed", { code: itemsErr.code, message: itemsErr.message });

  // Existing non-cancelled declaration? (the action refuses a dup — surface it here.)
  const { data: existing, error: existingErr } = await admin
    .from("customs_declarations")
    .select("id, status")
    .eq("cargo_forwarder_id", fid)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle<{ id: string; status: string }>();
  if (existingErr) console.error("[customs-doc existing] failed", { code: existingErr.code, message: existingErr.message });

  const items: PickItem[] = ((itemsRaw ?? []) as Array<{ id: number; hs_code: string | null; productname: string | null; productqty: number | null; productweightall: number | string | null; declared_value_thb: number | string | null }>).map((r) => ({
    id: r.id,
    hsCode: r.hs_code ?? "",
    name: r.productname ?? "—",
    qty: Number(r.productqty ?? 0),
    weightKg: Number(r.productweightall ?? 0),
    declaredThb: Number(r.declared_value_thb ?? 0),
  }));

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · บัญชี · ใบขนสินค้า"
        title={`เลือกสินค้า → สร้างใบขน/ใบกำกับ · F${fid}`}
        subtitle={`ตู้ ${fwd.fcabinetnumber || "—"} · แทรคกิ้ง ${fwd.ftrackingchn || "—"} · ลูกค้า ${fwd.userid || "—"} — ติ๊กสินค้าที่จะลงเอกสาร แล้วสร้างเป็นร่าง (แก้ไข/ออกจริงที่หน้าใบขน)`}
        actions={
          <Link href={`/admin/forwarders/${fid}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับฝากนำเข้า</Link>
        }
      />
      {existing && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          มีใบขนของรายการนี้อยู่แล้ว (สถานะ {existing.status}) —{" "}
          <Link href="/admin/accounting/customs-declarations" className="font-semibold underline">เปิดหน้าใบขน →</Link>
        </div>
      )}
      <CargoDocPicker fid={fid} items={items} disabled={!!existing} />
    </main>
  );
}
