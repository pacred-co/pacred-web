import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin, getAdminRoles, hasRole, isGodRole } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CUSTOMS_DECLARATION_STATUS_LABEL,
  type CustomsDeclarationStatus,
} from "@/lib/validators/customs-declaration";
import { CargoDeclarationLineEditor } from "./cargo-declaration-line-editor";

/**
 * /admin/accounting/cargo-declarations/[id] — CARGO ใบขนรวม detail (P3).
 *
 * Reuses the freight customs_declarations model (mig 0057) bridged to cargo by
 * mig 0162 (`cargo_forwarder_id`). Shows the consolidated declaration header +
 * per-line declared / HS / duty / VAT. The declared value (มูลค่าสำแดง) defaults
 * from the captured COST (mig 0158) and is editable DOWN by Docs while draft.
 *
 * CAPTURE/SURFACE ONLY (P3): no issuance, no money, no comms, no status flips.
 * The submit→accept→release lifecycle + the consolidated ใบขน PDF land in P4/P5.
 *
 * RBAC: super | accounting | freight_import_doc | pricing (view).
 * Edit (the declared-value line editor) = super/accounting/freight_import_doc/
 * pricing AND status === 'draft' (the server action re-checks).
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

type Header = {
  id:                       string;
  declaration_no:           string | null;
  status:                   CustomsDeclarationStatus;
  cargo_forwarder_id:       number | null;
  cargo_cabinet_no:         string | null;
  declared_at:              string | null;
  total_declared_value_thb: number | null;
  total_duty_thb:           number | null;
  total_vat_thb:            number | null;
  total_other_taxes_thb:    number | null;
  notes:                    string | null;
  created_at:               string;
};

type Line = {
  id:                 string;
  position:           number;
  hs_code:            string | null;
  description:        string | null;
  qty:                number | string | null;
  unit:               string | null;
  declared_value_thb: number | string | null;
  duty_rate_pct:      number | string | null;
  duty_thb:           number | string | null;
  vat_thb:            number | string | null;
};

function thb(n: number | string | null | undefined): string {
  if (n == null) return "—";
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return "฿" + v.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function num(n: number | string | null | undefined): string {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString("th-TH") : "—";
}

export default async function CargoDeclarationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin([...VIEW_ROLES]);
  const { id } = await params;
  const roles = await getAdminRoles();
  // Declared value / duty / VAT = MONEY-internal (มูลค่าสำแดง). Visible + editable
  // ONLY to ultra/accounting/pricing (owner 2026-06-18 · super + freight_import_doc
  // keep page access to see status/HS/structure but NOT the money figures).
  const canViewMoney = canViewCostProfit(roles);
  const canEdit =
    canViewMoney &&
    roles != null &&
    (isGodRole(roles) || hasRole(roles, ["accounting", "pricing"]));

  const admin = createAdminClient();

  const { data: header, error: headerErr } = await admin
    .from("customs_declarations")
    .select(
      "id, declaration_no, status, cargo_forwarder_id, cargo_cabinet_no, declared_at, " +
        "total_declared_value_thb, total_duty_thb, total_vat_thb, total_other_taxes_thb, notes, created_at",
    )
    .eq("id", id)
    .maybeSingle<Header>();
  if (headerErr) {
    console.error("[cargo-declaration detail header]", { id, code: headerErr.code, message: headerErr.message });
    throw new Error(`Failed to load customs_declarations (${headerErr.code ?? "unknown"}): ${headerErr.message}`);
  }
  if (!header) notFound();
  // This page only renders CARGO declarations; freight ones live at
  // /admin/freight/declarations/[id].
  if (header.cargo_forwarder_id == null) notFound();

  // Forwarder + customer context.
  const { data: fwd, error: fwdErr } = await admin
    .from("tb_forwarder")
    .select("id, userid, fcabinetnumber, fstatus, ftransporttype, fdatetothai")
    .eq("id", header.cargo_forwarder_id)
    .maybeSingle<{
      id: number; userid: string | null; fcabinetnumber: string | null;
      fstatus: string | null; ftransporttype: string | null; fdatetothai: string | null;
    }>();
  if (fwdErr) {
    console.error("[cargo-declaration detail fwd]", { fid: header.cargo_forwarder_id, code: fwdErr.code, message: fwdErr.message });
  }

  const { data: linesRaw, error: linesErr } = await admin
    .from("customs_declaration_lines")
    .select("id, position, hs_code, description, qty, unit, declared_value_thb, duty_rate_pct, duty_thb, vat_thb")
    .eq("declaration_id", id)
    .order("position", { ascending: true });
  if (linesErr) {
    console.error("[cargo-declaration detail lines]", { id, code: linesErr.code, message: linesErr.message });
  }
  const linesAll = ((linesRaw ?? []) as unknown) as Line[];
  // DATA-LAYER mask: for non-cost roles (super / freight_import_doc), omit the
  // declared value / duty / VAT money figures from BOTH the header totals AND
  // every line before they reach the rendered DOM. HS code + qty + structure
  // stay visible (operational, not money-internal).
  if (!canViewMoney) {
    header.total_declared_value_thb = null;
    header.total_duty_thb = null;
    header.total_vat_thb = null;
    header.total_other_taxes_thb = null;
  }
  const lines: Line[] = canViewMoney
    ? linesAll
    : linesAll.map((l) => ({
        ...l,
        declared_value_thb: null,
        duty_rate_pct: null,
        duty_thb: null,
        vat_thb: null,
      }));

  // Audit timeline.
  const { data: auditRaw, error: auditErr } = await admin
    .from("admin_audit_log")
    .select("id, action, created_at, admin:profiles!admin_id ( member_code, first_name )")
    .eq("target_type", "customs_declaration")
    .eq("target_id", id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (auditErr) {
    console.error("[cargo-declaration detail audit]", { id, code: auditErr.code, message: auditErr.message });
  }
  type AuditRaw = {
    id: string; action: string; created_at: string;
    admin: { member_code: string | null; first_name: string | null } | { member_code: string | null; first_name: string | null }[] | null;
  };
  const audit = ((auditRaw ?? []) as unknown as AuditRaw[]).map((a) => ({
    id: a.id, action: a.action, created_at: a.created_at,
    admin: Array.isArray(a.admin) ? a.admin[0] ?? null : a.admin,
  }));

  const isDraft = header.status === "draft";
  const TRANSPORT_LABEL: Record<string, string> = { "1": "รถ", "2": "เรือ", "3": "แอร์" };

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link href="/admin/accounting/cargo-declarations" className="text-xs text-primary-500 hover:underline">
            ← กลับหน้ารายการ
          </Link>
          <h1 className="mt-1 text-2xl font-bold">
            ใบขนรวม CARGO <span className="font-mono">{header.declaration_no ?? "(ร่าง)"}</span>
          </h1>
          <p className="text-xs text-muted">
            สร้าง {new Date(header.created_at).toLocaleString("th-TH")} · ออเดอร์ฝากนำเข้า{" "}
            <Link href={`/admin/forwarders/${header.cargo_forwarder_id}`} className="font-mono text-primary-500 hover:underline">
              #{header.cargo_forwarder_id}
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* GAP 6 (2026-06-12) — the cargo ใบขนรวม PDF now renders (the route
              gained a cargo branch). An <a> to the /api route (not next/Link). */}
          <a
            href={`/api/customs-declaration/${header.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100"
          >
            📄 ดู / พิมพ์ ใบขน PDF
          </a>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[header.status]}`}>
            {CUSTOMS_DECLARATION_STATUS_LABEL[header.status]}
          </span>
        </div>
      </div>

      {/* Forwarder + cabinet summary */}
      <section className="rounded-2xl border border-border bg-surface-alt/30 p-5 text-xs space-y-1">
        <h2 className="font-bold text-sm mb-2">ออเดอร์ + ตู้</h2>
        <p>
          ออเดอร์: <span className="font-mono">#{header.cargo_forwarder_id}</span>
          {fwd?.userid && <span className="ml-2">· ลูกค้า {fwd.userid}</span>}
        </p>
        <p>
          ตู้ (cabinet): <span className="font-mono">{header.cargo_cabinet_no ?? fwd?.fcabinetnumber?.trim() ?? "—"}</span>
          {fwd?.ftransporttype && ` · ขนส่ง ${TRANSPORT_LABEL[fwd.ftransporttype] ?? fwd.ftransporttype}`}
        </p>
        {fwd?.fdatetothai && (
          <p className="text-muted">ถึงไทย: {new Date(fwd.fdatetothai).toLocaleDateString("th-TH")}</p>
        )}
      </section>

      {/* Totals — MONEY-internal (มูลค่าสำแดง). Hidden for non-cost roles. */}
      {canViewMoney ? (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-1 text-xs">
          <h2 className="font-bold text-sm mb-2">📋 ยอดรวม (จากมูลค่าสำแดง)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-y-1">
            <p>รวมสำแดง: <span className="font-mono">{thb(header.total_declared_value_thb)}</span></p>
            <p>อากรขาเข้า: <span className="font-mono">{thb(header.total_duty_thb)}</span></p>
            <p>VAT 7%: <span className="font-mono">{thb(header.total_vat_thb)}</span></p>
            <p>ภาษีอื่นๆ: <span className="font-mono">{thb(header.total_other_taxes_thb)}</span></p>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            ⚠️ มูลค่าสำแดง ตั้งจาก <b>ต้นทุน</b> (ไม่ใช่ราคาขาย) · duty = สำแดง × อัตรา% · vat = (สำแดง + duty) × 7%
          </p>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-surface-alt/30 p-4 text-xs text-muted">
          🔒 ยอดรวมมูลค่าสำแดง / อากร / VAT เป็นข้อมูลภายใน — แสดงเฉพาะฝ่ายบัญชี / pricing
        </section>
      )}

      {/* Per-line declared / HS / duty / VAT */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        <header className="bg-amber-600 text-white px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <span className="text-base">📦</span>
          <h2 className="text-sm font-bold">รายการสินค้า + มูลค่าสำแดง (ใบขน)</h2>
          <span className="text-[11px] font-medium opacity-90">({lines.length} รายการ)</span>
          <span className="ml-auto text-[11px] bg-white/20 rounded px-1.5 py-0.5">
            {canEdit && isDraft ? "Docs แก้สำแดงได้ (ร่าง)" : "อ่านอย่างเดียว"}
          </span>
        </header>
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">#</th>
                <th className="px-3 py-2">สินค้า</th>
                <th className="px-3 py-2">HS</th>
                <th className="px-3 py-2 text-right">จำนวน</th>
                {canViewMoney && <th className="px-3 py-2 text-right">สำแดง (฿)</th>}
                {canViewMoney && <th className="px-3 py-2 text-right">อากร%</th>}
                {canViewMoney && <th className="px-3 py-2 text-right">อากร (฿)</th>}
                {canViewMoney && <th className="px-3 py-2 text-right">VAT (฿)</th>}
                {canEdit && isDraft && <th className="px-3 py-2 text-right">แก้ไข</th>}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={4 + (canViewMoney ? 4 : 0) + (canEdit && isDraft ? 1 : 0)} className="px-3 py-8 text-center text-xs text-muted">
                    ยังไม่มีรายการ — สร้างใบขนจะดึงรายการจากออเดอร์โดยอัตโนมัติ
                  </td>
                </tr>
              ) : (
                lines.map((l) => (
                  <tr key={l.id} className="border-t border-border align-top hover:bg-surface-alt/30">
                    <td className="px-3 py-2 text-[11px] text-muted">{l.position}</td>
                    <td className="px-3 py-2 text-xs max-w-[18rem]">
                      <span className="break-words line-clamp-2">{l.description || "—"}</span>
                    </td>
                    <td className="px-3 py-2 text-[11px] font-mono">{l.hs_code?.trim() || "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-[11px]">
                      {num(l.qty)} {l.unit ?? ""}
                    </td>
                    {canViewMoney && <td className="px-3 py-2 text-right font-mono text-xs">{thb(l.declared_value_thb)}</td>}
                    {canViewMoney && <td className="px-3 py-2 text-right font-mono text-[11px]">{num(l.duty_rate_pct)}%</td>}
                    {canViewMoney && <td className="px-3 py-2 text-right font-mono text-[11px]">{thb(l.duty_thb)}</td>}
                    {canViewMoney && <td className="px-3 py-2 text-right font-mono text-[11px]">{thb(l.vat_thb)}</td>}
                    {canEdit && isDraft && (
                      <td className="px-3 py-2 text-right">
                        <CargoDeclarationLineEditor
                          lineId={l.id}
                          declaredValueThb={l.declared_value_thb}
                          dutyRatePct={l.duty_rate_pct}
                          hsCode={l.hs_code}
                        />
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {!isDraft && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
          ใบขนนี้ไม่ใช่สถานะร่างแล้ว — แก้มูลค่าสำแดงไม่ได้ (P3 = บันทึก/แสดงผลเท่านั้น · การยื่น/ตรวจรับ/ปล่อย = phase ถัดไป)
        </p>
      )}

      {header.notes && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 text-xs">
          <h2 className="font-bold text-sm mb-1">หมายเหตุ</h2>
          <p className="whitespace-pre-wrap">{header.notes}</p>
        </section>
      )}

      {/* Audit timeline */}
      {audit.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <h2 className="font-bold text-sm mb-3">📜 Audit timeline</h2>
          <ul className="space-y-1.5 text-xs">
            {audit.map((a) => (
              <li key={a.id} className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-muted whitespace-nowrap">
                  {new Date(a.created_at).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" })}
                </span>
                <span className="font-medium">{a.action}</span>
                <span className="text-muted">by {a.admin?.member_code ?? "—"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
