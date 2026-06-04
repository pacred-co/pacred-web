/**
 * /admin/service-orders/[hNo] — the SINGLE coherent shop-order (ฝากสั่งซื้อ)
 * detail page, faithful to legacy `pcs-admin/include/pages/shops/update.php`.
 *
 * 2026-06-04 ภูม UX flag #2 — PURE READ-ONLY detail (PCS pattern):
 *   - The detail page is INFO-FIRST · READ-ONLY ALWAYS · no inline [แก้ไข]
 *     buttons anywhere · just data display + the prominent "✏️ แก้ไข/อัปเดต"
 *     CTA in the header that bounces to /edit.
 *   - ALL field edits (transport · crate · shipBy · payMethod · rate) live on
 *     /edit alongside the items editor + status-aware workflow actions
 *     (mark-paid, mark-ordered, spawn, refund).
 *
 * 2026-06-03 rewrite (owner directive "(B) รื้อทั้งหน้าให้เป็นหน้าเดียวเหมือน
 * legacy เป๊ะ"): the original "single coherent page" structure remains —
 *   header (order#, IPC/Sale badges, status badge, 5-step process bar,
 *           print buttons for status 3/4/5, "แก้ไข/อัปเดต" CTA)
 *   2 columns:
 *     LEFT  — customer block + read-only field summary (transport · crate ·
 *             shipBy · payMethod) + shipping address
 *     RIGHT — price breakdown (rate read-only · CHN · net THB · cost ·
 *             profit) — the exact formulas from update.php L277-292
 *   read-only items table (ItemSummary) for ALL statuses
 *   footer     → note form + bill-to + danger zone (super-only)
 *
 * Per AGENTS.md §0a — faithful WORKFLOW (fields/columns/formula/loop), Pacred
 * Tailwind UI (NOT Bootstrap markup). §0d reachability — every action has a
 * visible button on this page (CTA → /edit). §0c — every Supabase read
 * destructures error.
 *
 * Reads the LIVE legacy `tb_header_order` + `tb_order` + `tb_users` +
 * `tb_settings` (the rebuilt `service_orders` is empty on prod).
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { Pencil } from "lucide-react";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { BillToOverridePanel } from "@/components/admin/bill-to-override-panel";
import type { EditorItem } from "./items-editor";
import { OrderNoteForm, OrderDangerZone } from "./order-actions";

// ── inline-edits labels mirrored here for read-only display (the editor in
// inline-edits.tsx owns the canonical maps; we duplicate the 3 small ones
// rather than import a "use client" module for label lookup).
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 ขนส่งทางรถ",
  "2": "🚢 ขนส่งทางเรือ",
  "3": "✈️ ขนส่งทางเครื่องบิน",
};
const CRATE_LABEL: Record<string, string> = { "1": "ตีลังไม้", "2": "ไม่ตีลังไม้" };
const PAY_LABEL: Record<string, string> = { "1": "ต้นทาง", "2": "ปลายทาง" };

// round_up(x,2) — CEIL to 2dp (matches legacy round_up + lib roundUp).
function roundUp2(v: number): number {
  if (!Number.isFinite(v)) return 0;
  const eps = 1e-9 * Math.max(1, Math.abs(v * 100));
  const r = Math.ceil(v * 100 - eps) / 100;
  return r === 0 ? 0 : r;
}
function thb(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function cny(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── status taxonomy (legacy '1'..'6') ──
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
  id: number; hno: string; htitle: string | null; hcover: string | null;
  hcount: number | null; hdate: string | null; hdate2: string | null;
  hdatepayment: string | null; hstatus: string | null; htransporttype: string | null;
  htotalpricechn: number | null; htotalpriceuser: number | null;
  hshippingservice: number | null; hshippingchn: number | null; hrate: number | null;
  hpriceupdate: number | null; hcostall: number | null; hcostallth: number | null;
  hratecost: number | null; hnote: string | null; hnoteuser: string | null;
  hshipby: string | null; hfreeshipping: string | null;
  haddressname: string | null; haddresslastname: string | null; haddressno: string | null;
  haddresssubdistrict: string | null; haddressdistrict: string | null;
  haddressprovince: string | null; haddresszipcode: string | null;
  haddresstel: string | null; haddressnote: string | null;
  userid: string; paymethod: string | null; crate: string | null;
  adminidip: string | null; adminidcreate: string | null;
};
type URow = {
  userID: string; userName: string | null; userLastName: string | null;
  userTel: string | null; userEmail: string | null; userImage: string | null;
  adminIDSale: string | null;
};
type ORow = {
  id: number; cprovider: string | null; cnameshop: string | null; ctitle: string | null;
  curl: string | null; cimages: string | null; ccolor: string | null; csize: string | null;
  cdetails: string | null; camount: number | null; cprice: number | null;
  cshippingchn: number | null; cpriceupdate: number | null; crewallet: string | null;
  cnote: string | null; cshippingnumber: string | null; ctrackingnumber: string | null;
};

export async function renderLegacyServiceOrderView(hno: string) {
  const { roles } = await requireAdmin();
  const superAdmin = roles.includes("super");
  const admin = createAdminClient();

  const { data: rowRaw, error: rowErr } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,htitle,hcover,hcount,hdate,hdate2,hdatepayment,hstatus,htransporttype,htotalpricechn,htotalpriceuser,hshippingservice,hshippingchn,hrate,hpriceupdate,hcostall,hcostallth,hratecost,hnote,hnoteuser,hshipby,hfreeshipping,haddressname,haddresslastname,haddressno,haddresssubdistrict,haddressdistrict,haddressprovince,haddresszipcode,haddresstel,haddressnote,userid,paymethod,crate,adminidip,adminidcreate",
    )
    .eq("hno", hno)
    .maybeSingle();
  if (rowErr) {
    console.error(`[tb_header_order lookup] failed`, { code: rowErr.code, message: rowErr.message, details: rowErr.details, hint: rowErr.hint });
    throw new Error(`Failed to load tb_header_order (${rowErr.code ?? "unknown"}): ${rowErr.message}`);
  }
  if (!rowRaw) return null;
  const r = rowRaw as unknown as HRow;

  const { data: userRaw, error: userErr } = await admin
    .from("tb_users")
    .select("userID,userName,userLastName,userTel,userEmail,userImage,adminIDSale")
    .eq("userID", r.userid)
    .maybeSingle();
  if (userErr) {
    console.error(`[tb_users lookup] failed`, { code: userErr.code, message: userErr.message });
  }
  const u = userRaw as unknown as URow | null;

  const { data: itemsRaw, error: itemsErr } = await admin
    .from("tb_order")
    .select("id,cprovider,cnameshop,ctitle,curl,cimages,ccolor,csize,cdetails,camount,cprice,cshippingchn,cpriceupdate,crewallet,cnote,cshippingnumber,ctrackingnumber")
    .eq("hno", r.hno)
    .order("id", { ascending: true })
    .limit(500);
  if (itemsErr) {
    console.error(`[tb_order list] failed`, { code: itemsErr.code, message: itemsErr.message });
  }
  const items = (itemsRaw ?? []) as unknown as ORow[];

  // Resolve every item cover image (cimages → displayable URL) in parallel.
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

  // Bill-to default — for juristic customers the receipt/PDF uses the company
  // name (legacy F-1). tb_corporate is keyed by userid (member code).
  const { data: corp, error: corpErr } = await admin
    .from("tb_corporate")
    .select("corporatename")
    .eq("userid", r.userid)
    .maybeSingle<{ corporatename: string | null }>();
  if (corpErr) {
    console.error(`[tb_corporate bill-to lookup] failed`, { code: corpErr.code, message: corpErr.message });
  }
  const corporateName = corp?.corporatename ?? null;

  const status = r.hstatus ?? "1";
  const customerName = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || "—";
  const userAvatar = await resolveLegacyUrl(u?.userImage, "profile").catch(() => null);
  const addr = [r.haddressno, r.haddresssubdistrict ? `ต.${r.haddresssubdistrict}` : "", r.haddressdistrict ? `อ.${r.haddressdistrict}` : "", r.haddressprovince ? `จ.${r.haddressprovince}` : "", r.haddresszipcode]
    .filter(Boolean).join(" ");

  // ── Price breakdown (legacy update.php L277-292) ──
  const chn      = Number(r.htotalpricechn ?? 0);
  const shipChn  = Number(r.hshippingchn ?? 0);
  const rate     = Number(r.hrate ?? 0);
  const svc      = Number(r.hshippingservice ?? 0);
  const rateCost = Number(r.hratecost ?? 0);
  const costAll  = Number(r.hcostall ?? 0);
  const netThb   = roundUp2((chn + shipChn) * rate + svc);
  const profit   = (chn + shipChn) * rate - rateCost * costAll;

  const showPrint = status === "3" || status === "4" || status === "5";
  // legacy printShop: status 5 → print=1 ใบเสร็จ + print=2 ใบแจ้งหนี้; else print=2 only.
  const printHref = (mode: 1 | 2) =>
    `/admin/service-orders/print?print=${mode}&${encodeURIComponent("id[]")}=${encodeURIComponent(r.hno)}`;
  const editHref = `/admin/service-orders/${encodeURIComponent(r.hno)}/edit`;

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ฝากสั่งซื้อ</p>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold font-mono">{r.hno}</h1>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {STATUS_LABEL[status] ?? `status ${status}`}
            </span>
            {r.adminidip && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] text-amber-700">ล่าม: {r.adminidip}</span>
            )}
            {u?.adminIDSale && (
              <span className="rounded-full border border-border bg-surface-alt px-2.5 py-1 text-[11px]">เซล: {u.adminIDSale}</span>
            )}
          </div>
          {r.hdate && (
            <p className="text-xs text-muted">วันที่เปิดออเดอร์: {new Date(r.hdate).toLocaleString("th-TH")}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Link href="/admin/service-orders" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt">
              ← กลับรายการ
            </Link>
            <Link
              href={editHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-primary-500 bg-primary-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-600"
            >
              <Pencil className="h-3.5 w-3.5" />
              แก้ไข / อัปเดต
            </Link>
          </div>
          {showPrint && (
            <div className="flex gap-2">
              <a href={printHref(2)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100">
                พิมพ์ใบแจ้งหนี้
              </a>
              {status === "5" && (
                <a href={printHref(1)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100">
                  พิมพ์ใบเสร็จ
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── 5-step process bar ── */}
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

      {/* ── 2-column header: customer + price ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* LEFT — customer + inline edits */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-3">
            {userAvatar ? (
              <a href={userAvatar} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={userAvatar} alt={customerName} className="h-11 w-11 rounded-full border border-border object-cover" />
              </a>
            ) : (
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-100 text-sm font-bold text-primary-700">
                {customerName.slice(0, 1)}
              </span>
            )}
            <div className="min-w-0">
              <Link href={`/admin/customers/${encodeURIComponent(r.userid)}`} className="block truncate font-semibold text-primary-600 hover:underline">
                {customerName}
              </Link>
              <p className="text-xs text-muted">รหัสสมาชิก: {r.userid}</p>
            </div>
          </div>
          <div className="space-y-1 text-sm">
            {u?.userEmail && (
              <KV label="อีเมล" value={<a href={`mailto:${u.userEmail}`} className="text-primary-600 hover:underline">{u.userEmail}</a>} />
            )}
            {u?.userTel && (
              <KV label="โทร." value={<a href={`tel:${u.userTel}`} className="text-primary-600 hover:underline">{u.userTel}</a>} />
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-2 text-sm">
            <KV
              label="รูปแบบขนส่ง จีน-ไทย"
              value={TRANSPORT_LABEL[r.htransporttype ?? ""] ?? `mode ${r.htransporttype ?? "-"}`}
            />
            <KV
              label="การตีลังไม้"
              value={CRATE_LABEL[r.crate ?? ""] ?? "—"}
            />
            <KV
              label="บริษัทขนส่ง"
              value={r.hshipby || "—"}
            />
            <KV
              label="การเก็บเงินค่าขนส่งในไทย"
              value={PAY_LABEL[r.paymethod ?? ""] ?? "—"}
            />
          </div>

          <div className="border-t border-border pt-3 space-y-1 text-sm">
            <p className="text-xs font-semibold text-muted">ที่อยู่จัดส่งสินค้า</p>
            <p>{`${r.haddressname ?? ""} ${r.haddresslastname ?? ""}`.trim() || "—"}</p>
            {r.haddresstel && <p className="text-xs text-muted">📞 {r.haddresstel}</p>}
            <p className="text-sm">{addr || "—"}</p>
            {r.haddressnote && <p className="text-xs text-muted">หมายเหตุ: {r.haddressnote}</p>}
            {r.hfreeshipping === "1" && <p className="text-xs text-green-600">✓ ส่งฟรี (Pacred zone)</p>}
          </div>
        </div>

        {/* RIGHT — price breakdown */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted" title="เรทฝากสั่งในวันสร้างออเดอร์">อัตราแลกเปลี่ยน</span>
            <span className="text-right">
              <span className="font-mono tabular-nums">
                {rate.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-muted"> บาท/หยวน</span>
            </span>
          </div>
          <KV label="ราคาสินค้า" value={`¥${cny(chn)}`} mono />
          <KV label="ค่าขนส่งในจีน" value={`¥${cny(shipChn)}`} mono />
          <KV label="ราคารวมหยวนจีน" value={`¥${cny(chn + shipChn)}`} mono />
          {svc > 0 && <KV label="ค่าบริการฝากสั่ง" value={`฿${thb(svc)}`} mono />}
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
            <span>ราคารวมสุทธิ</span>
            <span className="font-mono text-primary-600 tabular-nums">฿{thb(netThb)}</span>
          </div>
          <KV label="ชำระเงิน เพิ่ม/ลด" value={`¥${cny(Number(r.hpriceupdate ?? 0))}`} mono />
          <div className="border-t border-border pt-2 space-y-1">
            <KV label="อัตราแลกเปลี่ยนจริง" value={`${cny(rateCost)} บาท/หยวน`} mono />
            <KV label="ราคาซื้อจริงทั้งหมด" value={`¥${cny(costAll)}`} mono />
            {costAll !== 0 && (
              <div className="flex justify-between font-semibold">
                <span>กำไรสุทธิ</span>
                <span className={`font-mono tabular-nums ${profit >= 0 ? "text-green-600" : "text-red-600"}`}>฿{thb(profit)}</span>
              </div>
            )}
          </div>
          <p className="text-[10px] text-muted">*ชำระเงิน เพิ่ม/ลด จะถูกคำนวณกำไรในรายการฝากนำเข้าสินค้า</p>
          {r.hdatepayment && status === "2" && (
            <p className="rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-700">
              กรุณาชำระภายใน: {new Date(r.hdatepayment).toLocaleString("th-TH")}
            </p>
          )}
        </div>
      </div>

      {/* ── Items — READ-ONLY on detail (to edit prices/qty, advance status,
          spawn, refund, or settle from wallet → click "แก้ไข/อัปเดต") ── */}
      <ItemSummary items={editorItems} completed={status === "5"} />

      {/* ── Edit-page CTA — repeated near the items as a discoverability nudge.
          Staff used to "ราคา แก้ตรงไหน" — now the next click is right here. ── */}
      <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/40 px-4 py-3 sm:px-5 sm:py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-primary-700">
            <p className="font-semibold">ต้องการแก้ราคา / จำนวน / สั่งสินค้า / ปั่นเข้าฝากนำเข้า / คืนเงิน?</p>
            <p className="text-xs text-primary-600/80">
              ทุกการเปลี่ยนแปลงตารางสินค้า + ฟังก์ชั่นอัปเดตสถานะ ทำในหน้าแก้ไข
            </p>
          </div>
          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-primary-500 bg-primary-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-600"
          >
            <Pencil className="h-3.5 w-3.5" />
            ไปหน้าแก้ไข / อัปเดต
          </Link>
        </div>
      </div>

      {/* ── footer: note + bill-to + danger zone ── */}
      <div className="grid gap-5 lg:grid-cols-2">
        <OrderNoteForm hNo={r.hno} hnote={r.hnote} hnoteuser={r.hnoteuser} />
        <BillToOverridePanel
          kind="service_order"
          hNo={r.hno}
          defaultName={(corporateName ?? `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim()) || ""}
          current={null}
        />
      </div>

      <OrderDangerZone hNo={r.hno} hstatus={status} adminIdCreate={r.adminidcreate} superAdmin={superAdmin} />
    </main>
  );
}

/** Read-only item list for non-editable steps (3/4/5). */
function ItemSummary({ items, completed }: { items: EditorItem[]; completed?: boolean }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-3">
      <h3 className="font-bold text-sm">
        รายการสินค้า ({items.length}){completed ? " · สำเร็จ" : ""}
      </h3>
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
    </div>
  );
}

function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono tabular-nums text-right" : "text-right"}>{value}</span>
    </div>
  );
}
