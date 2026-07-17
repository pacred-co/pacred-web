import { Link } from "@/i18n/navigation";
import { requireAdmin, getAdminRoles, hasRole } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AccountingMenubar } from "@/components/admin/accounting-menubar";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";

import {
  CUSTOMS_DECLARATION_STATUS_LABEL,
  type CustomsDeclarationStatus,
} from "@/lib/validators/customs-declaration";
import { CreateCargoDeclarationButton } from "./create-cargo-declaration-button";

/**
 * /admin/accounting/cargo-declarations — CARGO ใบขนรวม hub (P3 · tax-invoice platform).
 *
 * A CARGO import (ฝากสั่งซื้อ / ฝากนำเข้า) is a Freight-LCL job where Pacred issues
 * ONE consolidated customs declaration (ใบขนรวม) under the shipping company name —
 * the customer sees only the ใบกำกับภาษี (docs/learnings/pacred-cargo-tax-invoice-flow.md).
 *
 * This page reuses the SAME `customs_declarations` model the freight side uses
 * (mig 0057), bridged to cargo by mig 0162 (`cargo_forwarder_id`). It surfaces:
 *   1. existing CARGO declarations (cargo_forwarder_id IS NOT NULL)
 *   2. import-forwarders that have arrived in Thailand (fstatus ≥ 4) with NO active
 *      ใบขน yet → a "สร้างใบขนรวม" button (Docs/accounting/pricing/super)
 *
 * P3 = CAPTURE/SURFACE ONLY. No issuance, no money, no comms, no status flips.
 * Per-line declared values default from the captured COST (mig 0158) and are
 * edited DOWN by Docs on the detail page.
 *
 * RBAC: super | accounting | freight_import_doc (Docs) | pricing.
 * §0c: every Supabase read destructures `error`. §0d: reachable via the
 * accounting menubar "รายรับ → ใบขนรวม (CARGO)" leaf + the sidebar.
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = ["super", "accounting", "freight_import_doc", "pricing"] as const;

const STATUS_CLS: Record<CustomsDeclarationStatus, string> = {
  draft:     "bg-slate-100 text-slate-700 border-slate-300",
  submitted: "bg-blue-100 text-blue-700 border-blue-300",
  accepted:  "bg-purple-100 text-purple-700 border-purple-300",
  released:  "bg-emerald-100 text-emerald-700 border-emerald-300",
  cancelled: "bg-red-100 text-red-700 border-red-300",
};

function thb(n: number | null | undefined): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

type DeclRow = {
  id:                       string;
  declaration_no:           string | null;
  status:                   CustomsDeclarationStatus;
  cargo_forwarder_id:       number | null;
  cargo_cabinet_no:         string | null;
  total_declared_value_thb: number | null;
  total_duty_thb:           number | null;
  total_vat_thb:            number | null;
  created_at:               string | null;
  declared_at:              string | null;
};

type FwdRow = {
  id:             number;
  userid:         string | null;
  fcabinetnumber: string | null;
  fstatus:        string | null;
  ftransporttype: string | null;
  fdatetothai:    string | null;
  fdate:          string | null;
};

const TRANSPORT_LABEL: Record<string, string> = { "1": "รถ", "2": "เรือ", "3": "แอร์" };

export default async function CargoDeclarationsPage() {
  await requireAdmin([...VIEW_ROLES]);
  const roles = await getAdminRoles();
  const canCreate = roles != null && hasRole(roles, ["accounting", "freight_import_doc", "pricing"]);

  const admin = createAdminClient();

  // ── 1) Existing CARGO declarations (cargo_forwarder_id IS NOT NULL) ──
  const { data: declRaw, error: declErr } = await admin
    .from("customs_declarations")
    .select(
      "id, declaration_no, status, cargo_forwarder_id, cargo_cabinet_no, " +
        "total_declared_value_thb, total_duty_thb, total_vat_thb, created_at, declared_at",
    )
    .not("cargo_forwarder_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (declErr) {
    console.error("[cargo-declarations list decls]", { code: declErr.code, message: declErr.message });
  }
  const decls = ((declRaw ?? []) as unknown) as DeclRow[];
  const fwdIdsWithDecl = new Set(
    decls.filter((d) => d.status !== "cancelled" && d.cargo_forwarder_id != null).map((d) => d.cargo_forwarder_id!),
  );

  // ── 2) Import-forwarders arrived in TH (fstatus ≥ 4) awaiting a ใบขน ──
  const { data: fwdRaw, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fcabinetnumber, fstatus, ftransporttype, fdatetothai, fdate")
    .in("fstatus", ["4", "5", "6"])
    .order("fdatetothai", { ascending: false, nullsFirst: false })
    .limit(150);
  if (fwdErr) {
    console.error("[cargo-declarations list forwarders]", { code: fwdErr.code, message: fwdErr.message });
  }
  const arrived = ((fwdRaw ?? []) as unknown) as FwdRow[];
  const awaiting = arrived.filter((f) => !fwdIdsWithDecl.has(f.id));

  // Resolve customer member-codes/names for both lists (one batched lookup).
  const fwdIdsNeeded = new Set<number>();
  for (const d of decls) if (d.cargo_forwarder_id != null) fwdIdsNeeded.add(d.cargo_forwarder_id);
  for (const f of awaiting) fwdIdsNeeded.add(f.id);
  const declFwdById = new Map<number, { userid: string | null; fcabinetnumber: string | null }>();
  if (fwdIdsNeeded.size > 0) {
    const { data: fwds, error: fwdsErr } = await admin
      .from("tb_forwarder")
      .select("id, userid, fcabinetnumber")
      .in("id", Array.from(fwdIdsNeeded));
    if (fwdsErr) {
      console.error("[cargo-declarations list fwd-map]", { code: fwdsErr.code, message: fwdsErr.message });
    }
    for (const f of (fwds ?? []) as Array<{ id: number; userid: string | null; fcabinetnumber: string | null }>) {
      declFwdById.set(f.id, { userid: f.userid, fcabinetnumber: f.fcabinetnumber });
    }
  }

  return (
    <>
      <AccountingMenubar activeHref="/admin/accounting/cargo-declarations" />
      <main className="p-6 lg:p-8 space-y-6 max-w-6xl">
        <header>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · บัญชี · CARGO</p>
          <h1 className="mt-1 text-2xl font-bold">ใบขนรวม (CARGO Customs Declaration)</h1>
          <p className="text-xs text-muted mt-1">
            ฝากสั่งซื้อ / ฝากนำเข้า = งาน Freight-LCL ที่ Pacred ออก <b>ใบขนรวมใบเดียวในชื่อบริษัทขนส่ง</b> —
            ลูกค้าเห็นแค่ใบกำกับภาษี. หน้านี้รวม ใบขนรวม CARGO + ออเดอร์ที่ถึงไทยแล้วและยังไม่มีใบขน.
          </p>
          <p className="text-[11px] text-muted mt-1">
            ⚠️ P3 — บันทึก/แสดงผลเท่านั้น · ยังไม่ยิงใบขน · ไม่กระทบเงิน/สถานะ/แจ้งเตือน ·
            มูลค่าสำแดง ตั้งค่าเริ่มจาก <b>ต้นทุน</b> (Docs ปรับลดได้)
          </p>
        </header>

        {/* ── existing cargo declarations ── */}
        <section className="space-y-2">
          <h2 className="font-bold text-sm">📋 ใบขนรวม CARGO ({decls.length})</h2>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
            {decls.length === 0 ? (
              <p className="p-8 text-center text-xs text-muted">
                ยังไม่มีใบขนรวม CARGO — สร้างจากออเดอร์ที่ถึงไทยแล้วด้านล่าง
              </p>
            ) : (
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                  <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">เลขที่</th>
                      <th className="px-3 py-2">ออเดอร์ / ลูกค้า</th>
                      <th className="px-3 py-2">ตู้</th>
                      <th className="px-3 py-2 text-right">สำแดง</th>
                      <th className="px-3 py-2 text-right">อากร + VAT</th>
                      <th className="px-3 py-2">สถานะ</th>
                      <th className="px-3 py-2">สร้าง</th>
                    </tr>
                  </thead>
                  <tbody>
                    {decls.map((d) => {
                      const fwd = d.cargo_forwarder_id != null ? declFwdById.get(d.cargo_forwarder_id) : undefined;
                      const totalTax = Number(d.total_duty_thb ?? 0) + Number(d.total_vat_thb ?? 0);
                      return (
                        <tr key={d.id} className="border-t border-border hover:bg-surface-alt/30">
                          <td className="px-3 py-2">
                            <Link
                              href={`/admin/accounting/cargo-declarations/${d.id}`}
                              className="font-mono text-xs text-primary-600 hover:underline"
                            >
                              {d.declaration_no ?? "(ร่าง)"}
                            </Link>
                          </td>
                          <td className="px-3 py-2 text-[11px]">
                            <span className="font-mono">#{d.cargo_forwarder_id}</span>
                            {fwd?.userid && <CustomerCodeLink code={fwd.userid} className="ml-2" />}
                          </td>
                          <td className="px-3 py-2 text-[11px] font-mono">{d.cargo_cabinet_no ?? "—"}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{thb(d.total_declared_value_thb)}</td>
                          <td className="px-3 py-2 text-right font-mono text-xs">{thb(totalTax)}</td>
                          <td className="px-3 py-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLS[d.status]}`}>
                              {CUSTOMS_DECLARATION_STATUS_LABEL[d.status]}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-[11px] text-muted">{fmtDate(d.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* ── forwarders awaiting a ใบขน ── */}
        <section className="space-y-2">
          <h2 className="font-bold text-sm">🚢 ออเดอร์ถึงไทยแล้ว · ยังไม่มีใบขน ({awaiting.length})</h2>
          <p className="text-[11px] text-muted">
            ฝากนำเข้า fstatus 4-6 (ถึงไทย / รอชำระ / เตรียมส่ง). สร้างใบขนรวมเพื่อดึงรายการสินค้า + มูลค่าสำแดง.
          </p>
          <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
            {awaiting.length === 0 ? (
              <p className="p-8 text-center text-xs text-muted">ไม่มีออเดอร์ที่รอสร้างใบขน</p>
            ) : (
              <div className="overflow-x-auto scrollbar-x-visible">
                <table className="w-full text-sm border-collapse [&>thead>tr>th]:border [&>thead>tr>th]:border-border/60 [&>tbody>tr>td]:border [&>tbody>tr>td]:border-border/60">
                  <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                    <tr>
                      <th className="px-3 py-2">ออเดอร์</th>
                      <th className="px-3 py-2">ลูกค้า</th>
                      <th className="px-3 py-2">ตู้</th>
                      <th className="px-3 py-2">ขนส่ง</th>
                      <th className="px-3 py-2">ถึงไทย</th>
                      <th className="px-3 py-2 text-right">การทำงาน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {awaiting.map((f) => (
                      <tr key={f.id} className="border-t border-border hover:bg-surface-alt/30">
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/forwarders/${f.id}`}
                            className="font-mono text-xs text-primary-600 hover:underline"
                          >
                            #{f.id}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-[11px]"><CustomerCodeLink code={f.userid} className="text-[11px]" /></td>
                        <td className="px-3 py-2 text-[11px] font-mono">{f.fcabinetnumber?.trim() || "—"}</td>
                        <td className="px-3 py-2 text-[11px]">{TRANSPORT_LABEL[f.ftransporttype ?? ""] ?? "—"}</td>
                        <td className="px-3 py-2 text-[11px] text-muted">{fmtDate(f.fdatetothai ?? f.fdate)}</td>
                        <td className="px-3 py-2 text-right">
                          {canCreate ? (
                            <CreateCargoDeclarationButton forwarderId={f.id} />
                          ) : (
                            <span className="text-[11px] text-muted">อ่านอย่างเดียว</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        <p className="text-[11px] text-muted">
          📌 ใบขนรวม CARGO ใช้โมเดล customs_declarations ตัวเดียวกับ Freight (mig 0162 bridge) ·
          ดูใบขน Freight ที่ <Link href="/admin/freight/declarations" className="text-primary-600 hover:underline">/admin/freight/declarations</Link>
        </p>
      </main>
    </>
  );
}
