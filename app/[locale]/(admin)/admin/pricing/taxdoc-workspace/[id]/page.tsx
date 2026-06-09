import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { requireAdmin, getAdminRoles, hasRole } from "@/lib/auth/require-admin";
import { adminGetCargoTaxdocJob } from "@/actions/admin/cargo-taxdoc-workspace";
import { TaxdocStageActions } from "./taxdoc-stage-actions";
import { TaxdocDocModeEditor } from "./taxdoc-doc-mode-editor";

/**
 * /admin/pricing/taxdoc-workspace/[id] — single CARGO tax-doc job (P4).
 *
 * Renders the THREE numbers (selling / cost / declared) + the FOUR section
 * status pills + per-stage advance actions (gated by the viewer's role).
 * Account stage advance is GATED on CS + Pricing both done (state machine ·
 * server-enforced, mirrored in the UI).
 *
 * ⚠️ Workflow only — no money / issuance / comms. The grossProfit shown is
 * display-only (selling − cost), NOT the money path.
 *
 * RBAC: super + the 4 section roles + ops. §0c destructure error.
 */

export const dynamic = "force-dynamic";

const VIEW_ROLES = [
  "super", "sales", "sales_admin", "pricing", "freight_import_doc",
  "freight_clearance_both", "accounting", "ops",
] as const;

const DOC_MODE_LABEL: Record<string, string> = {
  none:        "ยังไม่เลือก",
  receipt:     "ไม่รับเอกสาร",
  tax_invoice: "ใบกำกับภาษี (+VAT)",
  customs:     "ใบขน (ในชื่อตัวเอง)",
};

function thb(n: number): string {
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function TaxdocJobDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin([...VIEW_ROLES]);
  const roles = (await getAdminRoles()) ?? [];
  const { id } = await params;

  const res = await adminGetCargoTaxdocJob({ jobId: id });
  if (!res.ok || !res.data) {
    if (res.ok === false && res.error === "job_not_found") notFound();
    return (
      <main className="p-6 lg:p-8 space-y-4 max-w-4xl">
        <h1 className="text-2xl font-bold">Tax-doc Job</h1>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          โหลดข้อมูลไม่สำเร็จ: {res.ok ? "no_data" : res.error}
        </div>
      </main>
    );
  }
  const j = res.data;

  // Per-stage edit capability (the server re-checks; this drives the UI).
  const canCs      = hasRole(roles, ["sales", "sales_admin", "ops"]);
  const canPricing = hasRole(roles, ["pricing", "accounting", "ops"]);
  const canDocs    = hasRole(roles, ["freight_import_doc", "freight_clearance_both", "ops"]);
  const canAccount = hasRole(roles, ["accounting"]);
  const accountUnlocked = j.csStatus === "done" && j.pricingStatus === "done";

  const sourceHref = j.source === "forwarder" ? `/admin/forwarders/${j.fid}` : `/admin/service-orders/${j.hno}`;
  const sourceLabel = j.source === "forwarder" ? `ฝากนำเข้า #${j.fid}` : `ฝากสั่งซื้อ ${j.hno}`;

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-5xl">
      <nav className="text-xs text-muted">
        <Link href="/admin/pricing/taxdoc-workspace" className="hover:underline">Tax-doc Workspace</Link>
        <span className="mx-1">/</span>
        <span className="font-mono">{sourceLabel}</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ใบกำกับ/ใบขน · งาน</p>
        <h1 className="mt-1 text-2xl font-bold">
          {sourceLabel}
          {j.userid && <span className="ml-2 text-base font-normal text-muted">{j.userid}</span>}
        </h1>
        <p className="text-xs text-muted mt-1 flex flex-wrap items-center gap-2">
          <span>ตู้ <span className="font-mono">{j.cabinetNo ?? "—"}</span></span>
          <span>·</span>
          <span>เอกสาร <b>{DOC_MODE_LABEL[j.docMode] ?? j.docMode}</b></span>
          <TaxdocDocModeEditor jobId={j.jobId} docMode={j.docMode} canEdit={canCs || canAccount} />
          <span>·</span>
          <span>รายการ {j.lineCount}</span>
          <span>·</span>
          <Link href={sourceHref} className="text-primary-600 hover:underline">ดูออเดอร์ต้นทาง</Link>
        </p>
      </header>

      {/* ── The 3 numbers ── */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <NumberCard tone="blue" role="CS" label="ราคาขาย (SELLING)" value={thb(j.selling)}
          hint="ราคาที่เรียกเก็บลูกค้า → ใบกำกับภาษี + VAT 7%" />
        <NumberCard tone="emerald" role="Pricing" label="ต้นทุน (COST)" value={thb(j.cost)}
          hint="ต้นทุนจริงของเรา → PEAK stock-in + กำไร" />
        <NumberCard tone="purple" role="Docs" label="มูลค่าสำแดง (DECLARED)" value={thb(j.declared)}
          hint="ค่าที่สำแดงต่อศุลกากร → ใบขนรวม · ตั้งจากต้นทุน · ปรับลง" />
      </section>
      <div className="rounded-xl border border-border bg-white dark:bg-surface p-3 flex flex-wrap items-center gap-4 text-xs">
        <span>กำไรขั้นต้น (ขาย − ต้นทุน · แสดงผลเท่านั้น):{" "}
          <b className={j.grossProfit >= 0 ? "text-green-700" : "text-red-600"}>{thb(j.grossProfit)}</b>
        </span>
        <span className="text-muted">⚠️ 3 ราคาแยกกันเสมอ — ห้ามให้สำแดง = ราคาขาย</span>
      </div>

      {/* ── 4-role state machine ── */}
      <section className="space-y-3">
        <h2 className="font-bold text-sm">ขั้นตอน 4 บทบาท (CS → Pricing → Docs → Account)</h2>
        <p className="text-[11px] text-muted">
          Account (ปิดงาน) จะปิดได้เมื่อ <b>CS</b> และ <b>Pricing</b> เสร็จแล้วเท่านั้น.
        </p>
        <TaxdocStageActions
          jobId={j.jobId}
          csStatus={j.csStatus}
          pricingStatus={j.pricingStatus}
          docsStatus={j.docsStatus}
          accountStatus={j.accountStatus}
          canCs={canCs}
          canPricing={canPricing}
          canDocs={canDocs}
          canAccount={canAccount}
          accountUnlocked={accountUnlocked}
        />
      </section>

      {/* ── linked ใบขนรวม (Docs) ── */}
      <section className="rounded-2xl border border-purple-200 bg-purple-50/30 dark:bg-purple-950/10 p-4 space-y-2">
        <h2 className="font-bold text-sm text-purple-800">ใบขนรวม (DECLARED · Docs)</h2>
        {j.declarationId ? (
          <p className="text-xs">
            ใบขนรวม: <Link href={`/admin/accounting/cargo-declarations/${j.declarationId}`} className="font-mono text-primary-600 hover:underline">
              {j.declarationNo ?? "(ร่าง)"}
            </Link>
          </p>
        ) : (
          <p className="text-xs text-muted">
            ยังไม่มีใบขนรวม — Docs สร้างได้ที่{" "}
            <Link href="/admin/accounting/cargo-declarations" className="text-primary-600 hover:underline">
              /admin/accounting/cargo-declarations
            </Link>{" "}
            (มูลค่าสำแดงตั้งจากต้นทุน · ปรับลงตามแผน).
          </p>
        )}
      </section>

      {/* ── PEAK + issuance gate note ── */}
      <section className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-xs space-y-1.5">
        <p className="font-medium">📌 ปลายทาง (ยังไม่เปิดทำงานในขั้นนี้):</p>
        <ul className="list-disc list-inside text-muted space-y-1">
          <li>PEAK: ต้นทุน + ขาย + สำแดง สรุปต่องาน ส่งออกที่ <Link href="/admin/accounting/peak-export" className="underline">/admin/accounting/peak-export</Link> (รหัสบัญชี GL รอนักบัญชี)</li>
          <li>ใบกำกับ/ใบขน (issuance): รอ accounting sign-off ฐาน VAT ใบขน + owner เปิด flag</li>
        </ul>
      </section>
    </main>
  );
}

function NumberCard({
  tone, role, label, value, hint,
}: {
  tone: "blue" | "emerald" | "purple";
  role: string;
  label: string;
  value: string;
  hint: string;
}) {
  const accent =
    tone === "blue" ? "border-blue-200 bg-blue-50/40"
    : tone === "emerald" ? "border-emerald-200 bg-emerald-50/40"
    : "border-purple-200 bg-purple-50/40";
  const head =
    tone === "blue" ? "text-blue-700" : tone === "emerald" ? "text-emerald-700" : "text-purple-700";
  return (
    <div className={`rounded-2xl border ${accent} p-4`}>
      <div className="flex items-center justify-between">
        <p className={`text-[10px] font-semibold uppercase tracking-wide ${head}`}>{role}</p>
      </div>
      <p className="mt-0.5 text-[11px] text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${head}`}>{value}</p>
      <p className="mt-1.5 text-[10px] text-muted leading-snug">{hint}</p>
    </div>
  );
}
