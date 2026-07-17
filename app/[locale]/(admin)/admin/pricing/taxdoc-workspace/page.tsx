import { Link } from "@/i18n/navigation";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  adminListCargoTaxdocJobs,
  type TaxdocJobListItem,
  type TaxdocStageStatus,
} from "@/actions/admin/cargo-taxdoc-workspace";
import { OpenTaxdocJobButton } from "./open-taxdoc-job-button";

/**
 * /admin/pricing/taxdoc-workspace — CARGO tax-doc 4-role WORKSPACE (P4).
 *
 * The CS→Pricing→Docs→Account job board that carries the THREE numbers
 * (SELLING ≠ COST ≠ DECLARED) through the FOUR roles. Lists existing
 * tb_cargo_taxdoc_job rows + arrived import-forwarders with a doc-mode
 * preference that have no job yet (candidates to "เปิดงาน").
 *
 * ⚠️ Read + workflow only. NO money / issuance / comms (per W9 scope).
 * The 3 numbers are READ from their authoritative sources and surfaced
 * side-by-side — never auto-equalled.
 *
 * RBAC: super + sales (CS) + pricing (Pricing) + freight_import_doc (Docs)
 * + accounting (Account) + ops. §0c destructure error · §0d reachable via
 * the pricing sidebar + (super) the Cargo & Freight sidebar.
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "super", "sales", "sales_admin", "pricing", "freight_import_doc",
  "freight_clearance_both", "accounting", "ops",
] as const;

const DOC_MODE_LABEL: Record<string, string> = {
  none:        "ยังไม่เลือก",
  receipt:     "ไม่รับเอกสาร",
  tax_invoice: "ใบกำกับภาษี",
  customs:     "ใบขน (ในชื่อตัวเอง)",
};
const DOC_MODE_CLS: Record<string, string> = {
  none:        "bg-slate-100 text-slate-600 border-slate-300",
  receipt:     "bg-gray-100 text-gray-600 border-gray-300",
  tax_invoice: "bg-blue-50 text-blue-700 border-blue-200",
  customs:     "bg-purple-50 text-purple-700 border-purple-200",
};

function thb(n: number): string {
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function StagePill({ label, s }: { label: string; s: TaxdocStageStatus }) {
  const cls =
    s === "done"
      ? "bg-green-100 text-green-700 border-green-300"
      : s === "in_progress"
        ? "bg-amber-100 text-amber-700 border-amber-300"
        : "bg-gray-100 text-gray-400 border-gray-200";
  const dot = s === "done" ? "●" : s === "in_progress" ? "◐" : "○";
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      <span aria-hidden>{dot}</span>
      {label}
    </span>
  );
}

export default async function TaxdocWorkspacePage() {
  await requireAdmin([...VIEW_ROLES]);

  const res = await adminListCargoTaxdocJobs();
  if (!res.ok) {
    return (
      <main className="p-6 lg:p-8 space-y-4 max-w-7xl">
        <h1 className="text-2xl font-bold">Tax-doc Workspace</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.error}
        </div>
      </main>
    );
  }
  const { jobs, candidates, stats } = res.data ?? { jobs: [], candidates: [], stats: { jobs: 0, candidates: 0, csDone: 0, pricingDone: 0, docsDone: 0, accountDone: 0 } };

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · PRICING · ใบกำกับ/ใบขน</p>
        <h1 className="mt-1 text-2xl font-bold">Tax-doc Workspace (3 ราคา · 4 บทบาท)</h1>
        <p className="text-xs text-muted mt-1">
          งานออกเอกสารภาษี CARGO · ขั้นตอน <b>CS</b> (ขาย) → <b>Pricing</b> (ต้นทุน) → <b>Docs</b> (สำแดง · ใบขน) → <b>Account</b> (PEAK · ปิดงาน).
          3 ราคาแยกกันเสมอ: <span className="text-blue-700">ขาย (SELLING)</span> ≠ <span className="text-emerald-700">ต้นทุน (COST)</span> ≠ <span className="text-purple-700">สำแดง (DECLARED)</span>.
        </p>
        <p className="text-[11px] text-muted mt-1">
          ⚠️ P4 workspace — บันทึก/ติดตามสถานะเท่านั้น · ยังไม่ยิงเอกสาร/เงิน/แจ้งเตือน. Account ปิดได้เมื่อ CS + Pricing เสร็จ.
        </p>
      </header>

      {/* Stat bar */}
      <section className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
        <Stat label="งานในระบบ" value={String(stats.jobs)} />
        <Stat label="รอเปิดงาน" value={String(stats.candidates)} tone="amber" />
        <Stat label="CS เสร็จ" value={String(stats.csDone)} tone="blue" />
        <Stat label="Pricing เสร็จ" value={String(stats.pricingDone)} tone="emerald" />
        <Stat label="Docs เสร็จ" value={String(stats.docsDone)} tone="purple" />
        <Stat label="ปิดงาน (Account)" value={String(stats.accountDone)} tone="green" />
      </section>

      {/* ── existing jobs ── */}
      <section className="space-y-2">
        <h2 className="font-bold text-sm">📋 งานออกเอกสาร ({jobs.length})</h2>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          {jobs.length === 0 ? (
            <p className="p-8 text-center text-xs text-muted">
              ยังไม่มีงานในระบบ — เปิดงานจากออเดอร์ที่รอด้านล่าง
            </p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">ออเดอร์ / ลูกค้า</th>
                    <th className="px-3 py-2">ตู้</th>
                    <th className="px-3 py-2">เอกสาร</th>
                    <th className="px-3 py-2 text-right text-blue-700">ขาย</th>
                    <th className="px-3 py-2 text-right text-emerald-700">ต้นทุน</th>
                    <th className="px-3 py-2 text-right text-purple-700">สำแดง</th>
                    <th className="px-3 py-2 text-center">สถานะ 4 บทบาท</th>
                    <th className="px-3 py-2 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((j) => (
                    <JobRow key={j.jobId ?? `${j.fid}-${j.hno}`} j={j} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* ── candidates (no job yet) ── */}
      <section className="space-y-2">
        <h2 className="font-bold text-sm">🚢 ออเดอร์เลือกเอกสารแล้ว · ยังไม่เปิดงาน ({candidates.length})</h2>
        <p className="text-[11px] text-muted">
          ฝากนำเข้า (fstatus 4-6 · ถึงไทย/รอชำระ/เตรียมส่ง) + ฝากสั่งซื้อ (hstatus 3-5 · ชำระแล้ว) ที่ลูกค้าเลือก ใบกำกับ/ใบขน — กด &quot;เปิดงาน&quot; เพื่อเริ่ม workflow 4 บทบาท.
        </p>
        <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
          {candidates.length === 0 ? (
            <p className="p-8 text-center text-xs text-muted">ไม่มีออเดอร์รอเปิดงาน</p>
          ) : (
            <div className="overflow-x-auto scrollbar-x-visible">
              <table className="w-full text-sm">
                <thead className="bg-surface-alt/50 text-left text-[11px] uppercase tracking-wide text-muted">
                  <tr>
                    <th className="px-3 py-2">ออเดอร์</th>
                    <th className="px-3 py-2">ลูกค้า</th>
                    <th className="px-3 py-2">ตู้</th>
                    <th className="px-3 py-2">เอกสาร</th>
                    <th className="px-3 py-2 text-right text-blue-700">ขาย</th>
                    <th className="px-3 py-2 text-right">การทำงาน</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => (
                    <tr key={`cand-${c.fid}`} className="border-t border-border hover:bg-surface-alt/30">
                      <td className="px-3 py-2">
                        <Link href={`/admin/forwarders/${c.fid}`} className="font-mono text-xs text-primary-600 hover:underline">
                          #{c.fid}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[11px]"><CustomerCodeLink code={c.userid} className="text-[11px]" /></td>
                      <td className="px-3 py-2 text-[11px] font-mono">{c.cabinetNo ?? "—"}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] ${DOC_MODE_CLS[c.docMode] ?? DOC_MODE_CLS.none}`}>
                          {DOC_MODE_LABEL[c.docMode] ?? c.docMode}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{thb(c.selling)}</td>
                      <td className="px-3 py-2 text-right">
                        <OpenTaxdocJobButton fid={c.fid ?? undefined} hno={c.hno ?? undefined} />
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
        📌 3-number model: ขาย = ราคาขายลูกค้า (→ ใบกำกับ + VAT) · ต้นทุน = ต้นทุนจริง (→ PEAK stock-in) · สำแดง = มูลค่าสำแดงต่อศุลกากร (→ ใบขนรวม · ตั้งจากต้นทุน · Docs ปรับลง).
        ใบขนรวมที่ <Link href="/admin/accounting/cargo-declarations" className="text-primary-600 hover:underline">/admin/accounting/cargo-declarations</Link>.
      </p>
    </main>
  );

  function JobRow({ j }: { j: TaxdocJobListItem }) {
    return (
      <tr className="border-t border-border hover:bg-surface-alt/30">
        <td className="px-3 py-2 text-[11px]">
          {j.jobId ? (
            <Link href={`/admin/pricing/taxdoc-workspace/${j.jobId}`} className="font-mono text-xs text-primary-600 hover:underline">
              {j.source === "forwarder" ? `#${j.fid}` : j.hno}
            </Link>
          ) : (
            <span className="font-mono text-xs">{j.source === "forwarder" ? `#${j.fid}` : j.hno}</span>
          )}
          {j.userid && <span className="ml-2"><CustomerCodeLink code={j.userid} /></span>}
          <span className="ml-2 rounded bg-surface-alt px-1 py-0.5 text-[11px] text-muted">
            {j.source === "forwarder" ? "ฝากนำเข้า" : "ฝากสั่งซื้อ"}
          </span>
        </td>
        <td className="px-3 py-2 text-[11px] font-mono">{j.cabinetNo ?? "—"}</td>
        <td className="px-3 py-2">
          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${DOC_MODE_CLS[j.docMode] ?? DOC_MODE_CLS.none}`}>
            {DOC_MODE_LABEL[j.docMode] ?? j.docMode}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono text-xs text-blue-700">{thb(j.selling)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs text-emerald-700">{thb(j.cost)}</td>
        <td className="px-3 py-2 text-right font-mono text-xs text-purple-700">{thb(j.declared)}</td>
        <td className="px-3 py-2">
          <div className="flex flex-wrap items-center justify-center gap-1">
            <StagePill label="CS" s={j.csStatus} />
            <StagePill label="Pricing" s={j.pricingStatus} />
            <StagePill label="Docs" s={j.docsStatus} />
            <StagePill label="Account" s={j.accountStatus} />
          </div>
        </td>
        <td className="px-3 py-2 text-right">
          {j.jobId && (
            <Link href={`/admin/pricing/taxdoc-workspace/${j.jobId}`} className="text-[11px] text-primary-700 hover:underline">
              เปิดงาน →
            </Link>
          )}
        </td>
      </tr>
    );
  }
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" | "blue" | "emerald" | "purple" | "green" }) {
  const cls =
    tone === "amber" ? "text-amber-700"
    : tone === "blue" ? "text-blue-700"
    : tone === "emerald" ? "text-emerald-700"
    : tone === "purple" ? "text-purple-700"
    : tone === "green" ? "text-green-700"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-white dark:bg-surface p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 font-bold tabular-nums text-xl ${cls}`}>{value}</p>
    </div>
  );
}
