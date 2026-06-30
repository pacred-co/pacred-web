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

import type React from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  Pencil,
  ClipboardList, CircleDollarSign, ShoppingCart, Clock, PackageCheck, Warehouse,
} from "lucide-react";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { fstatusBadge } from "@/lib/admin/forwarder-status";
// Carrier label SOT — show the Thai carrier name (legacy nameShipBy) not the
// raw code on the read-only detail (owner 2026-06-29: faithful display).
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { getShopOrderDocuments } from "@/lib/admin/order-documents";
import { countShopArrivals } from "@/lib/admin/shop-order-arrivals";
import { OrderDocumentsPanel } from "@/components/admin/order-documents-panel";
import { BillToOverridePanel } from "@/components/admin/bill-to-override-panel";
import { autoExpireOverdueShopOrder } from "@/lib/service-order/auto-expire";
import type { EditorItem } from "./items-editor";
import { OrderNoteForm, OrderDangerZone } from "./order-actions";
// 2026-06-09 (P2 · tax-invoice platform): per-line COST + DECLARED capture
// (the `pricing` role) — isolated from the selling-price/quote flow.
import { ShopOrderCostSection } from "./shop-cost-section";
// 2026-06-12 (GAP 2 · cargo-acct workflow audit) — surface the customer's
// tax-document choice + juristic-WHT signal on the shop detail header (the
// forwarder detail already has it; the shop side was the gap). Display-only.
import { TaxDocBadge, JuristicWhtChip } from "@/components/admin/tax-doc-badge";

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
// 2026-06-04 (ภูม flag #1) — same icon + label style as /edit step bar
// (matches /admin/forwarders/[fNo]/edit · ภูมบอก "ทำถูกต้องสวยเลย" + ขอ
// "แก้หน้าลายละเอียดด้วยหงะ" ให้ตรงกัน).
const STATUS_STEPS: {
  code: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}[] = [
  { code: "1",  label: "รอดำเนินการ",     Icon: ClipboardList },
  { code: "2",  label: "รอชำระเงิน",       Icon: CircleDollarSign },
  { code: "3",  label: "สั่งสินค้า",         Icon: ShoppingCart },
  { code: "4",  label: "รอร้านจีนจัดส่ง", Icon: Clock },
  { code: "40", label: "ถึงโกดังจีน",      Icon: Warehouse }, // owner 2026-06-16 · MOMO arrival
  { code: "5",  label: "สำเร็จ",            Icon: PackageCheck },
];
// Display-order rank — "40" ถึงโกดังจีน slots between 4 and 5 (Number() would
// rank it 40, AFTER สำเร็จ → wrong).
const STATUS_ORDER_RANK: Record<string, number> = {
  "1": 1, "2": 2, "3": 3, "4": 4, "40": 5, "5": 6, "6": 99,
};
const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ", "2": "รอชำระเงิน", "3": "สั่งสินค้าแล้ว",
  "4": "รอร้านจีนจัดส่ง", "40": "ถึงโกดังจีน", "5": "สำเร็จ", "6": "ยกเลิก",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-orange-100 text-orange-700 border-orange-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "40": "bg-teal-100 text-teal-700 border-teal-200",
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
  tax_doc_pref: string | null;
};
type URow = {
  userID: string; userName: string | null; userLastName: string | null;
  userTel: string | null; userEmail: string | null; userPicture: string | null;
  adminIDSale: string | null; userCompany: string | null;
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
  const superAdmin = isGodRole(roles);
  const admin = createAdminClient();

  const { data: rowRaw, error: rowErr } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,htitle,hcover,hcount,hdate,hdate2,hdatepayment,hstatus,htransporttype,htotalpricechn,htotalpriceuser,hshippingservice,hshippingchn,hrate,hpriceupdate,hcostall,hcostallth,hratecost,hnote,hnoteuser,hshipby,hfreeshipping,haddressname,haddresslastname,haddressno,haddresssubdistrict,haddressdistrict,haddressprovince,haddresszipcode,haddresstel,haddressnote,userid,paymethod,crate,adminidip,adminidcreate,tax_doc_pref",
    )
    .eq("hno", hno)
    .maybeSingle();
  if (rowErr) {
    console.error(`[tb_header_order lookup] failed`, { code: rowErr.code, message: rowErr.message, details: rowErr.details, hint: rowErr.hint });
    throw new Error(`Failed to load tb_header_order (${rowErr.code ?? "unknown"}): ${rowErr.message}`);
  }
  if (!rowRaw) return null;
  const r = rowRaw as unknown as HRow;

  // legacy fidelity gap fixed 2026-06-08 · ภูม B5 lane
  // Auto-expire overdue (legacy detail.php L73-79): a status-2 order past its
  // hdatepayment deadline flips to 6 the moment ANY admin opens the page —
  // detail OR /edit. /edit already calls this (edit/page.tsx:152); detail did
  // not, so an overdue row stayed visually at status=2 if staff opened detail
  // first. Idempotent + recoverable (re-quote 6 → 2 via /edit).
  const autoExpired = await autoExpireOverdueShopOrder({
    id: r.id, hstatus: r.hstatus, hdatepayment: r.hdatepayment,
  });

  const { data: userRaw, error: userErr } = await admin
    .from("tb_users")
    .select("userID,userName,userLastName,userTel,userEmail,userPicture,adminIDSale,userCompany")
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

  // ฝากนำเข้า imports linked to this shop order (owner 2026-06-22 · "คนทำงาน งง").
  // Once the goods become an import, the shop order completes (สำเร็จ) and the
  // import (tb_forwarder) carries the tracking — so staff need the SAME handoff
  // link the customer detail shows. Linked by reforder=hno OR forwarder.ftrackingchn
  // = a recorded China tracking (MOMO rows have reforder="").
  type AdminLinkedImport = { id: number; ftrackingchn: string | null; fstatus: string | null };
  let linkedImports: AdminLinkedImport[] = [];
  {
    const trackings = Array.from(new Set(
      ((itemsRaw ?? []) as Array<{ ctrackingnumber: string | null }>)
        .map((t) => (t.ctrackingnumber ?? "").trim()).filter((t) => t.length > 0)));
    const orParts = [`reforder.eq.${r.hno}`];
    if (trackings.length > 0) orParts.push(`ftrackingchn.in.(${trackings.join(",")})`);
    const { data: imports, error: impErr } = await admin
      .from("tb_forwarder")
      .select("id, ftrackingchn, fstatus")
      .eq("userid", r.userid)
      .or(orParts.join(","))
      .neq("fstatus", "99")
      .order("id", { ascending: false });
    if (impErr) console.error(`[admin service-order linked imports] failed`, { code: impErr.code, message: impErr.message });
    const seen = new Set<number>();
    linkedImports = ((imports ?? []) as AdminLinkedImport[]).filter((x) => !seen.has(x.id) && seen.add(x.id));
  }

  // ภูม 2026-06-30 — per-shop arrival breakdown (ร้านมาถึงโกดังจีนกี่ร้าน · แทรคกิ้ง
  // ที่มี/ที่ขาด) so staff see it WITHOUT opening อัพเดต/แก้ไข, and so a multi-shop
  // order shows "X/Y ร้าน" instead of jumping to สำเร็จ when only one shop arrives.
  const shopArrivals = await countShopArrivals(admin, r.hno);

  // B3 (2026-06-22) — per-order document registry (read-only · tax invoices +
  // receipts issued for this hno). Empty until tax-doc issuance is enabled.
  const orderDocs = await getShopOrderDocuments(r.hno);

  // legacy fidelity gap fixed 2026-06-08 · ภูม B5 lane — reflect the
  // auto-expire flip in the rendered status (matches /edit/page.tsx:287).
  const status = autoExpired ? "6" : (r.hstatus ?? "1");
  const customerName = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || "—";
  const userAvatar = await resolveLegacyUrl(u?.userPicture, "profile").catch(() => null);
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
            {/* 2026-06-12 (GAP 2) — the customer's tax-document choice + juristic
                WHT signal, so back-office sees "ทำเอกสารมั้ย · VAT/ไม่ VAT" at a
                glance (mirrors the forwarder detail header). Display-only. */}
            <TaxDocBadge pref={r.tax_doc_pref} />
            <JuristicWhtChip
              isJuristic={u?.userCompany === "1" || corporateName != null}
              totalThb={Number(r.htotalpriceuser ?? netThb)}
            />
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

      {/* ── 5-step process bar ──
          2026-06-04 (ภูม flag #1) — match /edit + /admin/forwarders/[fNo]/edit
          icon+label style (was number-in-circle pills). */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-3 lg:p-4 shadow-sm">
        <div className="grid grid-cols-6 gap-2">
          {STATUS_STEPS.map((step) => {
            const cur = step.code === status;
            // Rank-based (not Number()) so "40" ถึงโกดังจีน ranks between 4 and 5.
            const visited =
              (STATUS_ORDER_RANK[status] ?? 0) > (STATUS_ORDER_RANK[step.code] ?? 0) &&
              status !== "6";
            return (
              <div
                key={step.code}
                className={`flex flex-col items-center text-center p-2 rounded-lg border transition-colors ${
                  cur
                    ? "border-primary-500 bg-primary-50 dark:bg-primary-950/20 ring-2 ring-primary-300"
                    : visited
                      ? "border-emerald-300 bg-emerald-50/40"
                      : "border-border bg-surface-alt/30 opacity-60"
                }`}
              >
                <step.Icon className={`h-5 w-5 mb-1 ${
                  cur ? "text-primary-600" : visited ? "text-emerald-600" : "text-gray-400"
                }`} />
                <span className={`text-[11px] leading-tight ${
                  cur ? "font-bold text-primary-700" : visited ? "text-emerald-700" : "text-muted"
                }`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {status === "6" && (
        <div className="rounded-xl border border-gray-300 bg-gray-50 p-3 text-sm text-gray-600">
          ออเดอร์นี้ถูกยกเลิก — ยังแก้ราคา/ตั้งราคาใหม่ได้ (จะเปลี่ยนสถานะกลับเป็น &ldquo;รอชำระเงิน&rdquo;)
        </div>
      )}

      {/* ── ฝากนำเข้าที่เชื่อมโยง (owner 2026-06-22) — when the goods became an import,
          this shop order completes (สำเร็จ) + the work CONTINUES in the import below.
          Lets staff jump straight to the active ฝากนำเข้า instead of wondering where
          a "สำเร็จ" order went. ── */}
      {linkedImports.length > 0 && (
        <section className="rounded-2xl border border-blue-200 bg-blue-50/50 dark:bg-blue-900/10 p-4 sm:p-5 shadow-sm space-y-2">
          <h2 className="font-bold text-sm flex items-center gap-2">
            🚢 ฝากนำเข้าที่เชื่อมโยง ({linkedImports.length})
            {status === "5" && (
              <span className="rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 text-[11px] px-2 py-0.5 font-medium">
                ฝากสั่งซื้อสำเร็จ — ส่งต่อขั้นตอนนำเข้าแล้ว
              </span>
            )}
          </h2>
          <p className="text-xs text-muted">
            สินค้าเข้าสู่ขั้นตอนฝากนำเข้าแล้ว — ติดตามสถานะการนำเข้าต่อได้ที่รายการด้านล่าง
          </p>
          <ul className="space-y-1.5">
            {linkedImports.map((f) => {
              const b = fstatusBadge(f.fstatus ?? "");
              return (
                <li key={f.id}>
                  <a
                    href={`/admin/forwarders/${f.id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 hover:border-blue-300"
                  >
                    <span className="font-mono text-xs truncate">{f.ftrackingchn || `#${f.id}`}</span>
                    <span className={`inline-block rounded-full text-[11px] px-2 py-0.5 font-medium whitespace-nowrap ${b.chip}`}>
                      {b.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── ร้านที่สั่ง · สถานะการมาถึงโกดังจีน (ภูม 2026-06-30) — โชว์แทรคกิ้งที่มี/
          ที่ขาด + "X/Y ร้าน" ตรงนี้เลย ไม่ต้องกดอัพเดต/แก้ไข. สถานะออเดอร์จะขึ้น
          สำเร็จ ก็ต่อเมื่อ "ทุกร้าน" ถึงครบ (กันเคส 1 ร้านถึงแล้วเด้งสำเร็จทั้งออเดอร์). ── */}
      {shopArrivals.totalShops >= 1 && (
        <section className={`rounded-2xl border p-4 sm:p-5 shadow-sm space-y-3 ${shopArrivals.allDone ? "border-emerald-200 bg-emerald-50/40" : "border-amber-200 bg-amber-50/40"}`}>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-bold text-sm">🏪 ร้านที่สั่ง ({shopArrivals.totalShops} ร้าน)</h2>
            <span className={`rounded-full text-[11px] px-2.5 py-0.5 font-semibold border ${shopArrivals.allDone ? "bg-emerald-100 text-emerald-700 border-emerald-300" : "bg-amber-100 text-amber-800 border-amber-300"}`}>
              {shopArrivals.allDone
                ? `✓ ครบทุกร้านแล้ว (${shopArrivals.doneShops}/${shopArrivals.totalShops})`
                : `มาถึงโกดังจีน ${shopArrivals.arrivedShops}/${shopArrivals.totalShops} · เหลืออีก ${shopArrivals.totalShops - shopArrivals.arrivedShops} ร้าน`}
            </span>
          </div>
          {!shopArrivals.allDone && (
            <p className="text-[11px] text-amber-800">
              ยังมีร้านที่ของยังไม่เข้าโกดังจีน — สถานะจะคงไว้ที่ “รอร้านจีนจัดส่ง” จนกว่าจะครบทุกร้าน
            </p>
          )}
          <ul className="space-y-1.5">
            {shopArrivals.shops.map((s) => {
              const pill = s.done
                ? { t: "✓ ออกจากจีน/ได้ตู้", c: "bg-emerald-100 text-emerald-700 border-emerald-300" }
                : s.arrived
                  ? { t: "📦 ถึงโกดังจีนแล้ว", c: "bg-sky-100 text-sky-700 border-sky-300" }
                  : s.tracking
                    ? { t: "🚚 รอเข้าโกดังจีน", c: "bg-stone-100 text-stone-600 border-stone-300" }
                    : { t: "⏳ ร้านยังไม่ส่ง", c: "bg-stone-100 text-stone-500 border-stone-300" };
              return (
                <li key={s.orderRowId} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">{s.shopName || s.productTitle || `รายการ #${s.orderRowId}`}</div>
                    <div className="font-mono text-[11px] text-muted truncate">
                      {s.tracking ? s.tracking : <span className="italic">ยังไม่มีแทรคกิ้ง</span>}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full border text-[11px] px-2 py-0.5 font-medium whitespace-nowrap ${pill.c}`}>{pill.t}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── B3: เอกสารของออเดอร์ (read-only doc registry) ── */}
      <OrderDocumentsPanel docs={orderDocs} />

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
              value={r.hshipby ? `${nameShipBy(r.hshipby)} (${r.hshipby})` : "—"}
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
          <p className="text-[11px] text-muted">*ชำระเงิน เพิ่ม/ลด จะถูกคำนวณกำไรในรายการฝากนำเข้าสินค้า</p>
          {r.hdatepayment && status === "2" && (
            <p className="rounded-md bg-orange-50 px-2 py-1 text-xs text-orange-700">
              กรุณาชำระภายใน: {new Date(r.hdatepayment).toLocaleString("th-TH")}
            </p>
          )}
        </div>
      </div>

      {/* ── Items — READ-ONLY on detail (to edit prices/qty, advance status,
          spawn, refund, or settle from wallet → click "แก้ไข/อัปเดต" สีแดง
          มุมขวาบนของหน้า · top-of-page CTA cover นี้แล้ว) ── */}
      <ItemSummary items={editorItems} completed={status === "5"} />

      {/* 2026-06-09 (P2 · tax-invoice platform) — per-line COST + DECLARED
          capture (Pricing role). Separate control · calls ONLY the cost action
          (setShopOrderItemCost) · does NOT touch selling price / hStatus /
          notifications (AGENTS.md §0e). */}
      <ShopOrderCostSection hno={r.hno} />

      {/* 2026-06-05 (ภูม flag) — amber signpost "ไปหน้าแก้ไข/อัปเดต" ลบออก
          เพราะซ้ำกับปุ่ม "แก้ไข/อัปเดต" สีแดงมุมขวาบน (เด่นกว่าอยู่แล้ว ·
          ไปที่ editHref เดียวกัน). หน้านี้ = read-only display · footer ต่อด้วย
          note + bill-to + danger zone อย่างเดียว */}

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
          <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
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
                          <p className="text-[11px] text-muted">{it.ccolor}{it.ccolor && it.csize ? " · " : ""}{it.csize}</p>
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
