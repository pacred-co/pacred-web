/**
 * /admin/report-cnt/customs-doc?cabinet=<code> — เลือกสินค้า "จากตู้" → สร้าง
 * ใบขน/ใบกำกับ (ร่าง) (task #16 · owner 2026-07-01).
 *
 * Entry from the report-cnt floating bar (📦 จัดลงอินวอยซ์/แพคกิ้ง/ใบขน). A cabinet
 * groups N tb_forwarder rows; this reads them all and renders the EXISTING
 * <CargoDocPicker> once per forwarder (ZERO picker change — the picker is per-fid).
 * Each picker creates a DRAFT customs-declaration seeded from that forwarder's
 * items; the doc-mode chooser + issuance live on the cargo-declarations detail page.
 *
 * Mirrors the report-cnt page chrome (PageHeader · Thai labels · §0h ≥11px).
 * Read here — the create mutation is in the guarded action (adminCreateCargo…).
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { CargoDocPicker, type PickItem } from "../../forwarders/[fNo]/customs-doc/cargo-doc-picker";

export const dynamic = "force-dynamic";

type FwRow = { id: number; userid: string | null; ftrackingchn: string | null };

export default async function ReportCntCustomsDocPage({
  searchParams,
}: {
  searchParams: Promise<{ cabinet?: string }>;
}) {
  await requireAdmin(["super", "accounting", "freight_export_doc", "freight_import_doc"]);
  const sp = await searchParams;
  const cabinet = (sp.cabinet ?? "").trim();
  if (!cabinet) notFound();

  const admin = createAdminClient();

  // All forwarder rows in this cabinet (the report-cnt grouping key).
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, ftrackingchn")
    .eq("fcabinetnumber", cabinet)
    .order("id", { ascending: true });
  if (fwdErr) console.error("[report-cnt customs-doc forwarders] failed", { code: fwdErr.code, message: fwdErr.message });
  const forwarders = ((fwdRaw ?? []) as FwRow[]);
  if (forwarders.length === 0) notFound();

  const fids = forwarders.map((f) => f.id);

  // Items for every forwarder in one read, grouped by fid.
  const { data: itemsRaw, error: itemsErr } = await admin
    .from("tb_forwarder_item")
    .select("id, fid, hs_code, productname, productqty, productweightall, declared_value_thb")
    .in("fid", fids)
    .order("id", { ascending: true });
  if (itemsErr) console.error("[report-cnt customs-doc items] failed", { code: itemsErr.code, message: itemsErr.message });
  type ItemRow = {
    id: number; fid: number; hs_code: string | null; productname: string | null;
    productqty: number | null; productweightall: number | string | null; declared_value_thb: number | string | null;
  };
  const itemsByFid = new Map<number, PickItem[]>();
  for (const r of ((itemsRaw ?? []) as ItemRow[])) {
    const list = itemsByFid.get(r.fid) ?? [];
    list.push({
      id: r.id,
      hsCode: r.hs_code ?? "",
      name: r.productname ?? "—",
      qty: Number(r.productqty ?? 0),
      weightKg: Number(r.productweightall ?? 0),
      declaredThb: Number(r.declared_value_thb ?? 0),
    });
    itemsByFid.set(r.fid, list);
  }

  // Existing non-cancelled declarations per forwarder (the action refuses a dup —
  // surface it so the picker is disabled with a link to the open ใบขน).
  const { data: existingRaw, error: existingErr } = await admin
    .from("customs_declarations")
    .select("cargo_forwarder_id, status")
    .in("cargo_forwarder_id", fids)
    .neq("status", "cancelled");
  if (existingErr) console.error("[report-cnt customs-doc existing] failed", { code: existingErr.code, message: existingErr.message });
  const existingByFid = new Map<number, string>();
  for (const r of ((existingRaw ?? []) as Array<{ cargo_forwarder_id: number; status: string }>)) {
    if (!existingByFid.has(r.cargo_forwarder_id)) existingByFid.set(r.cargo_forwarder_id, r.status);
  }

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · รายงานตู้ · ใบกำกับ/ใบขน"
        title={`เลือกสินค้าจากตู้ → สร้างใบขน/ใบกำกับ · ตู้ ${cabinet}`}
        subtitle={`${forwarders.length} รายการฝากนำเข้าในตู้นี้ — ติ๊กสินค้าของแต่ละออเดอร์แล้วสร้างเป็นร่าง (เลือกโหมดเอกสาร + ออกจริงที่หน้าใบขน)`}
        actions={
          <Link href={`/admin/report-cnt/${encodeURIComponent(cabinet)}`} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">← กลับรายงานตู้</Link>
        }
      />

      <div className="space-y-6">
        {forwarders.map((f) => {
          const items = itemsByFid.get(f.id) ?? [];
          const existing = existingByFid.get(f.id) ?? null;
          return (
            <section key={f.id} className="rounded-2xl border border-border bg-white dark:bg-surface p-4 lg:p-5 space-y-3">
              <header className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-bold text-primary-700">F{f.id}</span>
                <span className="text-xs text-muted">ลูกค้า {f.userid || "—"} · แทรคกิ้ง {f.ftrackingchn || "—"}</span>
                <Link href={`/admin/forwarders/${f.id}`} className="ml-auto text-[11px] text-primary-500 hover:underline">เปิดฝากนำเข้า →</Link>
              </header>
              {existing && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
                  มีใบขนของออเดอร์นี้อยู่แล้ว (สถานะ {existing}) —{" "}
                  <Link href="/admin/accounting/customs-declarations" className="font-semibold underline">เปิดหน้าใบขน →</Link>
                </div>
              )}
              <CargoDocPicker fid={f.id} items={items} disabled={!!existing} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
