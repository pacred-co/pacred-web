/**
 * /admin/service-orders/[hNo]/edit — UNIFIED EDIT HUB for ฝากสั่งซื้อ.
 *
 * ── Why this exists (ภูม flag 2026-06-04):
 *   หน้าฝากสั่งซื้อ detail (`legacy-view.tsx`) ตามรูปแบบฝากนำเข้า [fNo]/edit
 *   ต้องเป็น INFO-FIRST · ตารางสินค้า read-only · มีปุ่ม "แก้ไข/อัปเดต"
 *   นำมาที่หน้านี้ ที่เปลี่ยนรายการสินค้าได้ + ปุ่มอัปเดตสถานะแบบใหญ่ทั้งหมด.
 *
 *   Symmetric กับ /admin/forwarders/[fNo]/edit:
 *     forwarder detail → info display + inline edits + "แก้ไข/อัปเดต" → /edit
 *     forwarder /edit  → primary status-update form + collapsible action panels
 *     service-order detail → info display + 4 inline edits + "แก้ไข/อัปเดต" → /edit
 *     service-order /edit → primary items-editor + status-aware workflow actions
 *
 * ── Layout (matches the legacy `pcs-admin/include/pages/shops/update.php`
 *    + `update/update1.php` + `update/update4.php` workspaces):
 *   1. Breadcrumb
 *   2. PCS-style header card: order# + status badge + tracking summary
 *   3. 5-step pipeline timeline
 *   4. PRIMARY EDIT — รายการสินค้า (ShopItemsEditor)
 *       status 1/2/6: editable price/qty/shippingCHN (the legacy update1+update2 core)
 *       status 3/4/5: read-only summary (locked — items already committed)
 *   5. STATUS-AWARE WORKFLOW ACTIONS
 *       status 1/2: 💰 บันทึกชำระจาก wallet (MarkPaidTbForm)
 *       status 3  : 📝 บันทึกเลขสั่งซื้อร้านจีน (AdminMarkShopOrderOrderedForm)
 *       status 4  : 🚛 สร้าง tb_forwarder จาก tracking (SpawnForwarderForm) +
 *                   ✓ มาร์คทุก tracking ว่าได้ tb_forwarder แล้ว
 *       status 5  : ✓ สำเร็จ (banner)
 *   6. 🔄 คืนเงินรายชิ้น (AdminRefundItemPanel · status 3/4/5)
 *   7. Bottom nav (back to detail · back to list)
 *
 * Per AGENTS.md §0a — faithful WORKFLOW (fields/columns/formula/loop) +
 * Pacred Tailwind UI. §0d reachability — every action visible. §0c — every
 * Supabase read destructures error.
 *
 * Reads the LIVE legacy `tb_header_order` + `tb_order` + `tb_users` +
 * `tb_settings` (rebuilt `service_orders` is empty on prod).
 */

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ArrowLeft, Eye, CheckCircle2, Lock } from "lucide-react";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { buildSpawnRows } from "../spawn-utils";
import SpawnForwarderForm from "../spawn-form";
import { ShopItemsEditor, type EditorItem } from "../items-editor";
import {
  AdminMarkShopOrderOrderedForm,
  AdminSpawnToCompletedButton,
} from "../mark-ordered-form";
import { AdminRefundItemPanel } from "../refund-item-form";
import { MarkPaidTbForm } from "../mark-paid-tb-form";
import { OrderInlineEdits, OrderRateInlineEdit } from "../inline-edits";

export const dynamic = "force-dynamic";

// round_up(x,2) — CEIL to 2dp (matches legacy round_up + lib roundUp).
function roundUp2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const eps = 1e-9 * Math.max(1, Math.abs(v * 100));
  const r = Math.ceil(v * 100 - eps) / 100;
  return r === 0 ? 0 : r;
}
function cny(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── status taxonomy (legacy '1'..'6') — mirrors legacy-view.tsx ──
const STATUS_STEPS: { code: string; label: string }[] = [
  { code: "1", label: "รอดำเนินการ" },
  { code: "2", label: "รอชำระเงิน" },
  { code: "3", label: "สั่งสินค้า" },
  { code: "4", label: "รอร้านจีนจัดส่ง" },
  { code: "5", label: "สำเร็จ" },
];
const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ", "2": "รอชำระเงิน", "3": "สั่งสินค้าแล้ว",
  "4": "รอร้านจีนจัดส่ง", "5": "สำเร็จ", "6": "ยกเลิก",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-orange-100 text-orange-700 border-orange-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "5": "bg-green-100 text-green-700 border-green-200",
  "6": "bg-gray-100 text-gray-600 border-gray-200",
};

type HRow = {
  id: number; hno: string; hstatus: string | null; htransporttype: string | null;
  htotalpricechn: number | null;
  hshippingservice: number | null; hshippingchn: number | null; hrate: number | null;
  hratecost: number | null; hcostall: number | null;
  hshipby: string | null; userid: string;
  crate: string | null; paymethod: string | null;
};
type URow = {
  userID: string; userName: string | null; userLastName: string | null;
};
type ORow = {
  id: number; cprovider: string | null; cnameshop: string | null; ctitle: string | null;
  curl: string | null; cimages: string | null; ccolor: string | null; csize: string | null;
  cdetails: string | null; camount: number | null; cprice: number | null;
  cshippingchn: number | null; cpriceupdate: number | null; crewallet: string | null;
  cnote: string | null; cshippingnumber: string | null; ctrackingnumber: string | null;
};

export default async function AdminServiceOrderEditPage({
  params,
}: {
  params: Promise<{ hNo: string }>;
}) {
  const { hNo } = await params;
  const { roles } = await requireAdmin();
  const superAdmin = roles.includes("super");
  const admin = createAdminClient();

  const { data: rowRaw, error: rowErr } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hstatus,htransporttype,htotalpricechn," +
      "hshippingservice,hshippingchn,hrate,hratecost,hcostall,hshipby,userid," +
      "crate,paymethod",
    )
    .eq("hno", hNo)
    .maybeSingle();
  if (rowErr) {
    console.error(`[tb_header_order edit lookup] failed`, {
      code: rowErr.code, message: rowErr.message, details: rowErr.details, hint: rowErr.hint, hNo,
    });
    throw new Error(`Failed to load tb_header_order (${rowErr.code ?? "unknown"}): ${rowErr.message}`);
  }
  if (!rowRaw) notFound();
  const r = rowRaw as unknown as HRow;

  const { data: userRaw, error: userErr } = await admin
    .from("tb_users")
    .select("userID,userName,userLastName")
    .eq("userID", r.userid)
    .maybeSingle();
  if (userErr) {
    console.error(`[tb_users edit lookup] failed`, { code: userErr.code, message: userErr.message });
  }
  const u = userRaw as unknown as URow | null;

  const { data: itemsRaw, error: itemsErr } = await admin
    .from("tb_order")
    .select(
      "id,cprovider,cnameshop,ctitle,curl,cimages,ccolor,csize,cdetails," +
      "camount,cprice,cshippingchn,cpriceupdate,crewallet,cnote," +
      "cshippingnumber,ctrackingnumber",
    )
    .eq("hno", r.hno)
    .order("id", { ascending: true })
    .limit(500);
  if (itemsErr) {
    console.error(`[tb_order edit list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const items = (itemsRaw ?? []) as unknown as ORow[];

  const { data: settingsRow, error: settingsErr } = await admin
    .from("tb_settings")
    .select("hratecostdefault")
    .eq("id", 1)
    .maybeSingle<{ hratecostdefault: number | null }>();
  if (settingsErr) {
    console.error(`[tb_settings edit lookup] failed`, { code: settingsErr.code, message: settingsErr.message });
  }
  const hRateCostDefault = Number(settingsRow?.hratecostdefault ?? 0);

  // Resolve every item cover image (cimages → URL) in parallel.
  const coverUrls = await Promise.all(
    items.map((it) => resolveLegacyUrl(it.cimages, "cover").catch(() => null)),
  );
  const editorItems: EditorItem[] = items.map((it, i) => ({
    id:           it.id,
    provider:     it.cprovider,
    cnameshop:    it.cnameshop,
    ctitle:       it.ctitle,
    curl:         it.curl,
    coverUrl:     coverUrls[i] ?? null,
    ccolor:       it.ccolor,
    csize:        it.csize,
    cdetails:     it.cdetails,
    cnote:        it.cnote,
    camount:      Number(it.camount ?? 0),
    cprice:       Number(it.cprice ?? 0),
    cshippingchn: Number(it.cshippingchn ?? 0),
    cpriceupdate: Number(it.cpriceupdate ?? 0),
    crewallet:    it.crewallet,
  }));

  // Spawn rows (status 4) + refundable items (status 3/4/5).
  const spawnRows = buildSpawnRows(
    items.map((it) => ({
      cnameshop:       it.cnameshop ?? "",
      cshippingnumber: it.cshippingnumber ?? "",
      ctrackingnumber: it.ctrackingnumber,
    })),
  );
  const refundableItems = items
    .filter((it) => Number(it.camount ?? 0) > 0 && it.crewallet !== "1")
    .map((it) => ({
      id: it.id, title: it.ctitle ?? "", cprice: Number(it.cprice ?? 0),
      camount: Number(it.camount ?? 0), cnameshop: it.cnameshop ?? "",
    }));

  const status = r.hstatus ?? "1";
  const customerName = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || "—";

  // Price breakdown (legacy update.php L277-292) — for the read-only summary
  // shown when items are locked (status 3/4/5).
  const chn      = Number(r.htotalpricechn ?? 0);
  const shipChn  = Number(r.hshippingchn ?? 0);
  const rate     = Number(r.hrate ?? 0);
  const svc      = Number(r.hshippingservice ?? 0);
  const rateCost = Number(r.hratecost ?? 0);
  const costAll  = Number(r.hcostall ?? 0);
  const netThb   = roundUp2((chn + shipChn) * rate + svc);

  // Status workflow eligibility.
  const isEditable     = status === "1" || status === "2" || status === "6";
  const showMarkPaid   = status === "1" || status === "2";
  const showMarkOrdered = status === "3";
  const showSpawn      = status === "4";
  const showCompleted  = status === "5";
  const showRefund     = status === "3" || status === "4" || status === "5";

  const detailHref = `/admin/service-orders/${encodeURIComponent(r.hno)}`;

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-6xl mx-auto">
      {/* ── 1. Breadcrumb ── */}
      <nav className="text-xs text-muted flex flex-wrap items-center gap-1.5">
        <Link href="/admin" className="hover:text-primary-600">หน้าแรก</Link>
        <span>/</span>
        <Link href="/admin/service-orders" className="hover:text-primary-600">รายการฝากสั่งซื้อ</Link>
        <span>/</span>
        <Link href={detailHref} className="hover:text-primary-600 font-mono">#{r.hno}</Link>
        <span>/</span>
        <span className="font-medium text-foreground">แก้ไข / อัปเดต</span>
      </nav>

      {/* ── 2. Header card ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ฝากสั่งซื้อ · แก้ไข/อัปเดต</p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold font-mono">{r.hno}</h1>
              <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {STATUS_LABEL[status] ?? `status ${status}`}
              </span>
            </div>
            <p className="text-xs text-muted">
              ลูกค้า:{" "}
              <Link href={`/admin/customers/${encodeURIComponent(r.userid)}`} className="text-primary-600 hover:underline">
                {customerName}
              </Link>
              <span className="text-muted/70"> · {r.userid}</span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={detailHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white dark:bg-surface-alt px-3 py-1.5 text-sm hover:bg-surface-alt"
            >
              <Eye className="h-3.5 w-3.5" /> ดูข้อมูล
            </Link>
            <Link
              href="/admin/service-orders"
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
            >
              ← กลับรายการ
            </Link>
          </div>
        </div>
      </section>

      {/* ── 3. 5-step process bar ── */}
      <ol className="flex items-stretch gap-1 overflow-x-auto rounded-2xl border border-border bg-white dark:bg-surface p-2 sm:p-3">
        {STATUS_STEPS.map((step) => {
          const cur = step.code === status;
          const visited = Number(status) > Number(step.code) && status !== "6";
          return (
            <li key={step.code} className="flex-1 min-w-[88px]">
              <div className={`flex h-full flex-col items-center gap-1 rounded-xl px-2 py-2 text-center ${cur ? "bg-primary-500 text-white" : visited ? "bg-primary-50 text-primary-700" : "bg-surface-alt/40 text-muted"}`}>
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${cur ? "bg-white text-primary-600" : visited ? "bg-primary-500 text-white" : "bg-border text-muted"}`}>
                  {step.code}
                </span>
                <span className="text-[10px] font-medium leading-tight">{step.label}</span>
              </div>
            </li>
          );
        })}
      </ol>

      {status === "6" && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
          ออเดอร์นี้ถูกยกเลิก — ยังแก้ราคา/ตั้งราคาใหม่ได้ (จะเปลี่ยนสถานะกลับเป็น &ldquo;รอชำระเงิน&rdquo;)
        </div>
      )}

      {/* ── 3b. INLINE FIELD EDITS — order-header attributes (legacy update.php
          L156-265 left col + L268-276 rate). Each field shows current value
          with a [แก้ไข] toggle → save via existing server actions. ── */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-4">
        <h3 className="font-bold text-sm">ข้อมูลออเดอร์ (แก้ไขรายฟิลด์)</h3>
        <OrderInlineEdits
          hNo={r.hno}
          htransporttype={r.htransporttype}
          crate={r.crate}
          hshipby={r.hshipby}
          paymethod={r.paymethod}
        />
        <div className="border-t border-border pt-3 flex items-baseline justify-between gap-3 text-sm">
          <span className="text-xs font-medium text-muted" title="เรทฝากสั่งในวันสร้างออเดอร์">อัตราแลกเปลี่ยน</span>
          <OrderRateInlineEdit hNo={r.hno} hRate={rate} />
        </div>
      </section>

      {/* ── 4. PRIMARY — รายการสินค้า (editable / read-only) ── */}
      {isEditable ? (
        <ShopItemsEditor
          hNo={r.hno}
          hRate={rate}
          hShippingService={svc}
          hRateCostDefault={hRateCostDefault}
          hRateCostInit={rateCost}
          hCostAllInit={costAll}
          items={editorItems}
          superAdmin={superAdmin}
        />
      ) : (
        <ItemSummaryReadOnly items={editorItems} netThb={netThb} status={status} />
      )}

      {/* ── 5. STATUS-AWARE WORKFLOW ACTIONS ── */}

      {/* status 1/2 → 💰 mark-paid from wallet (self-gates inside the form) */}
      {showMarkPaid && (
        <MarkPaidTbForm hno={r.hno} status={status} totalThb={netThb} />
      )}

      {/* status 3 → 📝 mark-ordered (write cshippingnumber + flip 3→4) */}
      {showMarkOrdered && (
        <section className="rounded-2xl border-2 border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 shadow-md overflow-hidden">
          <header className="bg-primary-500 text-white px-4 py-2.5 flex items-center gap-2">
            <span className="text-sm font-bold">📝 บันทึกเลขสั่งซื้อร้านจีน (สถานะ 3 → 4)</span>
            <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">ใช้บ่อย</span>
          </header>
          <div className="p-4">
            <AdminMarkShopOrderOrderedForm hNo={r.hno} />
          </div>
        </section>
      )}

      {/* status 4 → 🚛 spawn forwarder per tracking + auto-spawn-to-completed */}
      {showSpawn && (
        <>
          <section className="rounded-2xl border-2 border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 shadow-md overflow-hidden">
            <header className="bg-primary-500 text-white px-4 py-2.5 flex items-center gap-2">
              <span className="text-sm font-bold">🚛 สร้างฝากนำเข้า (tb_forwarder) จากเลข tracking</span>
              <span className="ml-auto text-[10px] bg-white/20 rounded px-1.5 py-0.5">ใช้บ่อย</span>
            </header>
            <div className="p-4">
              <SpawnForwarderForm
                hNo={r.hno}
                rows={spawnRows}
                defaultShipBy={r.hshipby ?? undefined}
                defaultTransportType={r.htransporttype ?? undefined}
              />
            </div>
          </section>
          <AdminSpawnToCompletedButton hNo={r.hno} />
        </>
      )}

      {/* status 5 → ✓ completed (read-only banner) */}
      {showCompleted && (
        <div className="rounded-2xl border border-green-300 bg-green-50 p-4 sm:p-5 shadow-sm flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-green-700">ออเดอร์นี้สำเร็จแล้ว</p>
            <p className="text-xs text-green-600">
              ทุก tracking สร้าง tb_forwarder แล้ว · งานต่อเนื่องอยู่ที่ ฝากนำเข้า (forwarders)
            </p>
          </div>
        </div>
      )}

      {/* ── 6. Refund (status 3/4/5) ── self-hides via internal guard */}
      {showRefund && (
        <AdminRefundItemPanel hNo={r.hno} hstatus={status} refundableItems={refundableItems} />
      )}

      {/* ── 7. Bottom nav ── */}
      <div className="flex gap-2 flex-wrap pt-2 pb-4">
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white dark:bg-surface-alt px-3 py-2 text-xs hover:bg-surface-alt"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> กลับหน้ารายละเอียด
        </Link>
        <Link
          href="/admin/service-orders"
          className="rounded-md border border-border bg-white dark:bg-surface-alt px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← กลับรายการฝากสั่งซื้อ
        </Link>
      </div>
    </main>
  );
}

/**
 * Read-only items table for status 3/4/5 — shown on /edit when items are
 * already committed (locked). Banner explains why no editor + points back
 * to detail for full context.
 */
function ItemSummaryReadOnly({
  items,
  netThb,
  status,
}: {
  items: EditorItem[];
  netThb: number;
  status: string;
}) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-sm">รายการสินค้า ({items.length})</h3>
          <p className="text-xs text-muted">
            ราคาสุทธิ ฿{netThb.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs text-amber-700">
          <Lock className="h-3 w-3" />
          ตารางสินค้าล็อกแล้ว (สถานะ {status})
        </div>
      </div>
      <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-surface-alt/60 text-[10px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-left">ข้อมูลสินค้า</th>
              <th className="px-2 py-2 text-right w-16">จำนวน</th>
              <th className="px-2 py-2 text-right w-24">¥/ชิ้น</th>
              <th className="px-2 py-2 text-right w-24">ค่าส่งจีน</th>
              <th className="px-2 py-2 text-right w-28">รวม (¥)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const refunded = it.crewallet === "1";
              const line = refunded ? 0 : roundUp2(it.camount * it.cprice + it.cshippingchn);
              return (
                <tr key={it.id} className={`border-t border-border ${refunded ? "bg-red-50/40" : ""}`}>
                  <td className="px-2 py-2">
                    <div className="flex gap-2">
                      {it.coverUrl ? (
                        <a href={it.coverUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={it.coverUrl} alt={it.ctitle ?? ""} className="h-10 w-10 rounded border border-border object-cover" />
                        </a>
                      ) : null}
                      <div className="min-w-0">
                        {it.curl ? (
                          <a href={it.curl} target="_blank" rel="noopener noreferrer" className="block truncate max-w-[280px] text-primary-600 hover:underline" title={it.ctitle ?? ""}>
                            {it.ctitle || it.curl}
                          </a>
                        ) : (
                          <span className="block truncate max-w-[280px]">{it.ctitle || "—"}</span>
                        )}
                        {(it.ccolor || it.csize) && (
                          <p className="text-[10px] text-muted">{it.ccolor}{it.ccolor && it.csize ? " · " : ""}{it.csize}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{refunded ? 0 : it.camount}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{cny(it.cprice)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{cny(it.cshippingchn)}</td>
                  <td className="px-2 py-2 text-right font-mono tabular-nums">{cny(line)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
