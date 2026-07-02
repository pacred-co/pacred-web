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
 *       status 3  : 📝 บันทึกเลขออเดอร์ร้านจีน per-shop (ShopFieldsBoard)
 *                   → flip 3→4 + notify
 *       status 4  : 🚛 บันทึกเลข Tracking per-shop (ShopFieldsBoard) +
 *                   สร้าง tb_forwarder จาก tracking (SpawnForwarderForm) +
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

import type React from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin, isGodRole } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import {
  ArrowLeft, Eye, CheckCircle2,
  ClipboardList, CircleDollarSign, ShoppingCart, Clock, PackageCheck, Warehouse,
} from "lucide-react";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { buildSpawnRows } from "../spawn-utils";
import SpawnForwarderForm from "../spawn-form";
import { ShopItemsEditor, type EditorItem } from "../items-editor";
import { ShopFieldsBoard, type TrackingGroup } from "../shop-fields-board";
import { CratePriceBox } from "../crate-price-box";
import { countShopArrivals } from "@/lib/admin/shop-order-arrivals";
import { buildTrackingGroups } from "@/lib/admin/shop-order-tracking-groups";
import { AdminSpawnToCompletedButton } from "../mark-ordered-form";
import { AdminRefundItemPanel } from "../refund-item-form";
import { MarkPaidTbForm } from "../mark-paid-tb-form";
import { MarkArrivedChinaButton } from "@/components/admin/mark-arrived-china-button";
import { OrderInlineEdits, OrderRateInlineEdit } from "../inline-edits";
import { CostInlineEdit } from "../cost-inline-edit";
import { canViewCost } from "@/lib/admin/money-visibility";
import { autoExpireOverdueShopOrder } from "@/lib/service-order/auto-expire";
import { OrderAddressPanel, type SavedAddress } from "../order-address-panel";
import { createClient } from "@/lib/supabase/server";
import { safeLegacyAdminId } from "@/lib/auth/safe-legacy-admin-id";
import { HeartbeatLock } from "./heartbeat-lock";
import { nameShipBy } from "@/lib/freight/shipping-methods";
import { fstatusBadge } from "@/lib/admin/forwarder-status";

export const dynamic = "force-dynamic";

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

// 2026-06-29 (owner: "อยากให้ขึ้นรายละเอียด เหมือนหน้ารอชำระเงิน — มีราคาขายบอก
// มีรายละเอียดบอก") — small label maps mirrored from legacy-view.tsx so the
// order-context block on /edit reads the same as the read-only detail page.
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 ขนส่งทางรถ",
  "2": "🚢 ขนส่งทางเรือ",
  "3": "✈️ ขนส่งทางเครื่องบิน",
};
const CRATE_LABEL: Record<string, string> = { "1": "ตีลังไม้", "2": "ไม่ตีลังไม้" };
const PAY_LABEL: Record<string, string> = { "1": "ต้นทาง", "2": "ปลายทาง" };

// KV row — same shape as legacy-view.tsx (label left · value right · optional mono).
function KV({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted shrink-0 text-xs">{label}</span>
      <span className={`text-sm ${mono ? "font-mono tabular-nums text-right" : "text-right"}`}>{value}</span>
    </div>
  );
}

// Resolve the current admin's legacy adminID for the heartbeat-lock banner.
// Mirrors the helper in actions/admin/service-orders-lock.ts so the page can
// pass `currentAdminId` to <HeartbeatLock> without a client round-trip.
async function resolveCurrentLegacyAdminId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) {
    console.error(`[service-orders/edit resolveCurrentLegacyAdminId auth] failed`, {
      code: authErr.code, message: authErr.message,
    });
  }
  const email = user?.email ?? null;
  if (!email) return "system";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_admin")
    .select("adminID")
    .eq("adminEmail", email)
    .maybeSingle<{ adminID: string | null }>();
  if (error) {
    console.error(`[service-orders/edit resolveCurrentLegacyAdminId tb_admin] failed`, {
      code: error.code, message: error.message,
    });
  }
  if (data?.adminID) return data.adminID;
  return (email.split("@")[0] || "system").slice(0, 50);
}
// ── status taxonomy (legacy '1'..'6') — mirrors legacy-view.tsx ──
// 2026-06-04 (ภูม flag): step bar เปลี่ยนจาก "เลข 1-5 ในวงกลม" → "icon + label"
// แบบเดียวกับ /admin/forwarders/[fNo]/edit (ที่ภูมบอก "ทำถูกต้องสวยเลย").
// Icons map ตาม legacy shops.php status workflow + customer screenshot
// (👩‍💼 รอดำเนินการ · 🤚💵 รอชำระเงิน · 🛒 สั่งสินค้า · ⏰ รอร้านจีนจัดส่ง · 📦✓ สำเร็จ).
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
// Display-order rank for the step strip — "40" (ถึงโกดังจีน) slots between
// 4 and 5. Using Number() would rank "40" as 40 (after สำเร็จ) → wrong.
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
  id: number; hno: string; hstatus: string | null; htransporttype: string | null;
  htotalpricechn: number | null; htotalpriceuser: number | null; hpriceupdate: number | null;
  hshippingservice: number | null; hshippingchn: number | null; hrate: number | null;
  hratecost: number | null; hcostall: number | null;
  hshipby: string | null; hfreeshipping: string | null; userid: string;
  crate: string | null; pricecrate: number | null; paymethod: string | null;
  hdatepayment: string | null; hdate: string | null;
  haddressname: string | null; haddresslastname: string | null; haddressno: string | null;
  haddresssubdistrict: string | null; haddressdistrict: string | null;
  haddressprovince: string | null; haddresszipcode: string | null;
  haddresstel: string | null; haddressnote: string | null;
};
type URow = {
  userID: string; userName: string | null; userLastName: string | null;
  userTel: string | null; userEmail: string | null;
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
  const superAdmin = isGodRole(roles);
  // COST visibility (ต้นทุน / margin) — strict cost-role gate (ultra/accounting/
  // pricing · §0e data-layer gate). super sees profit but NOT cost, so the
  // always-status cost editor is mounted only for cost-authority roles.
  const canSeeCost = canViewCost(roles);
  const admin = createAdminClient();

  const { data: rowRaw, error: rowErr } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,hstatus,htransporttype,htotalpricechn,htotalpriceuser,hpriceupdate," +
      "hshippingservice,hshippingchn,hrate,hratecost,hcostall,hshipby,hfreeshipping,userid," +
      "crate,pricecrate,paymethod,hdatepayment,hdate," +
      "haddressname,haddresslastname,haddressno,haddresssubdistrict,haddressdistrict," +
      "haddressprovince,haddresszipcode,haddresstel,haddressnote",
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

  // Auto-expire overdue (legacy detail.php L73 / update.php L72): a status-2
  // order past its hdatepayment deadline flips to 6 on open. Recoverable —
  // staff can re-quote a 6 back to 2. No notify (legacy doesn't).
  const autoExpired = await autoExpireOverdueShopOrder({
    id: r.id, hstatus: r.hstatus, hdatepayment: r.hdatepayment,
  });

  const { data: userRaw, error: userErr } = await admin
    .from("tb_users")
    .select("userID,userName,userLastName,userTel,userEmail")
    .eq("userID", r.userid)
    .maybeSingle();
  if (userErr) {
    console.error(`[tb_users edit lookup] failed`, { code: userErr.code, message: userErr.message });
  }
  const u = userRaw as unknown as URow | null;

  // Customer's saved address book (tb_address) — for the address re-pick
  // panel (legacy update_hAddress). lowercase columns.
  const { data: addrRaw, error: addrErr } = await admin
    .from("tb_address")
    .select("addressid,addressname,addresslastname,addressno,addresssubdistrict,addressdistrict,addressprovince,addresszipcode,addressnote,addresstel")
    .eq("userid", r.userid)
    .order("addressid", { ascending: true })
    .limit(50);
  if (addrErr) {
    console.error(`[tb_address edit lookup] failed`, { code: addrErr.code, message: addrErr.message });
  }
  const savedAddresses = (addrRaw ?? []) as unknown as SavedAddress[];

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

  // 2026-06-04 (ภูม flag #4 · A-path) — per-shop group for ShopFieldsBoard.
  // legacy update3/update4 → SELECT DISTINCT cnameshop, cshippingnumber,
  // ctrackingnumber FROM tb_order WHERE hno=? GROUP BY cnameshop.
  // We do the dedup client-side here against the already-loaded items list.
  //
  // 2026-06-05 (ภูม flag — merge tracking inputs INTO the items table per
  // legacy PCS shops/update.php) — pass coverUrl/curl/ccolor/csize/cshippingchn
  // so `ShopFieldsBoard` can render the full per-shop items table itself.
  const coverUrlById = new Map<number, string | null>(
    items.map((it, i) => [it.id, coverUrls[i] ?? null]),
  );
  const shopFieldsMap = new Map<string, {
    cshippingnumber: string; ctrackingnumber: string;
    items: {
      id: number; ctitle: string; camount: number; cprice: number;
      cpriceupdate: number; crewallet: string | null;
      coverUrl: string | null; curl: string | null;
      ccolor: string | null; csize: string | null; cshippingchn: number;
    }[];
  }>();
  for (const it of items) {
    const shop = (it.cnameshop ?? "").trim();
    if (!shop) continue;
    let g = shopFieldsMap.get(shop);
    if (!g) {
      g = {
        cshippingnumber: it.cshippingnumber ?? "",
        ctrackingnumber: it.ctrackingnumber ?? "",
        items: [],
      };
      shopFieldsMap.set(shop, g);
    }
    g.items.push({
      id: it.id, ctitle: it.ctitle ?? "", camount: Number(it.camount ?? 0),
      cprice: Number(it.cprice ?? 0), cpriceupdate: Number(it.cpriceupdate ?? 0),
      crewallet: it.crewallet,
      coverUrl: coverUrlById.get(it.id) ?? null,
      curl: it.curl ?? null,
      ccolor: it.ccolor ?? null, csize: it.csize ?? null,
      cshippingchn: Number(it.cshippingchn ?? 0),
    });
  }
  const shopFields = Array.from(shopFieldsMap.entries()).map(([cnameshop, v]) => ({
    cnameshop, cshippingnumber: v.cshippingnumber, ctrackingnumber: v.ctrackingnumber, items: v.items,
  }));

  // 2026-06-29 (owner: "เพิ่มแทรกกิ้งร้านที่เหลือยังไง") — per-tracking-token →
  // spawned tb_forwarder lookup, so each shop card shows ✓ฝากนำเข้าแล้ว #fNo /
  // ⌛รอ tracking + an overall "ครบ X/N ร้าน" progress. Mirrors legacy
  // update4.php L126-131/L168-173 (SELECT ID FROM tb_forwarder WHERE
  // refOrder=hNo AND fTrackingCHN=<token> → badge "ตรวจสอบสถานะนำเข้า #ID").
  // Linked by reforder=hno OR forwarder.ftrackingchn = a recorded China tracking
  // (MOMO-created rows have reforder=""). §0c — destructure error.
  const trackingTokens = Array.from(new Set(
    items
      .flatMap((it) => (it.ctrackingnumber ?? "").split(","))
      .map((t) => t.trim())
      .filter((t) => t.length > 0),
  ));
  const spawnedByTracking = new Map<string, { id: number; fstatus: string | null }>();
  {
    const orParts = [`reforder.eq.${r.hno}`];
    if (trackingTokens.length > 0) orParts.push(`ftrackingchn.in.(${trackingTokens.join(",")})`);
    const { data: imps, error: impErr } = await admin
      .from("tb_forwarder")
      .select("id,ftrackingchn,fstatus")
      .eq("userid", r.userid)
      .or(orParts.join(","))
      .neq("fstatus", "99")
      .order("id", { ascending: false })
      .limit(500);
    if (impErr) {
      console.error(`[service-order edit linked imports] failed`, { code: impErr.code, message: impErr.message });
    }
    for (const f of (imps ?? []) as Array<{ id: number; ftrackingchn: string | null; fstatus: string | null }>) {
      const key = (f.ftrackingchn ?? "").trim();
      if (key && !spawnedByTracking.has(key)) spawnedByTracking.set(key, { id: f.id, fstatus: f.fstatus });
    }
  }
  // Per-shop spawned summary — for each shop, which of its tracking tokens
  // already have a tb_forwarder (with its fNo + status badge), and which are
  // still waiting. A shop is "done" when it has ≥1 tracking AND every tracking
  // token resolved to a forwarder.
  const shopSpawnSummary = shopFields.map((s) => {
    const toks = (s.ctrackingnumber ?? "").split(",").map((t) => t.trim()).filter(Boolean);
    const resolved = toks.map((tok) => {
      const f = spawnedByTracking.get(tok);
      const badge = f ? fstatusBadge(f.fstatus ?? "") : null;
      return { tracking: tok, fNo: f?.id ?? null, statusLabel: badge?.label ?? null, statusChip: badge?.chip ?? null };
    });
    const hasTracking = toks.length > 0;
    const done = hasTracking && resolved.every((x) => x.fNo != null);
    return { cnameshop: s.cnameshop, hasTracking, resolved, done };
  });
  const shopsDoneCount = shopSpawnSummary.filter((x) => x.done).length;
  const shopsTotalCount = shopSpawnSummary.length;

  // 2026-06-30 (spec §5 GROUPING) — collapse items by `ctrackingnumber` into the
  // at-a-glance SUMMARY view (collapsible dropdowns). P22328 = 16 ร้าน / 150
  // รายการ → grouping by tracking lets staff scan "this tracking = N รายการ ·
  // ¥รวม · arrival pill · #fNo" instead of 150 flat rows. Read/display-only:
  // resolves arrival per tracking from the SAME `countShopArrivals` data the
  // 3-stage gate uses (so SUMMARY ⇄ gate agree to the satang) + reuses the
  // `spawnedByTracking` map for the #fNo deep link. The per-shop EDIT cards
  // (ShopFieldsBoard) stay the edit surface; this is a SUMMARY only. §0c — every
  // read destructures error (countShopArrivals logs + returns empty on error).
  const trackingGroups: TrackingGroup[] = await (async () => {
    // Only meaningful once the order is past payment (3/4/40/5) — the same
    // statuses the board renders. Skip the extra DB round-trip otherwise.
    const st = autoExpired ? "6" : (r.hstatus ?? "1");
    if (!(st === "3" || st === "4" || st === "40" || st === "5")) return [];
    const summary = await countShopArrivals(admin, r.hno);
    // Grouping math lives in the SHARED helper (ภูม 2026-07-01 · §12) so /edit +
    // the read-only detail panel render the SAME groups. Pure · display-only.
    return buildTrackingGroups({
      items,
      coverUrlById,
      spawnedByTracking,
      arrivalSummary: summary,
    });
  })();

  const refundableItems = items
    .filter((it) => Number(it.camount ?? 0) > 0 && it.crewallet !== "1")
    .map((it) => ({
      id: it.id, title: it.ctitle ?? "", cprice: Number(it.cprice ?? 0),
      camount: Number(it.camount ?? 0), cnameshop: it.cnameshop ?? "",
    }));

  const status = autoExpired ? "6" : (r.hstatus ?? "1");
  const customerName = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || "—";

  // 2026-06-09 E4 — heartbeat lock (legacy updateLock.php · faithful port). The
  // current admin's legacy adminID drives the banner copy + the per-admin grant
  // check inside lockServiceOrder. safeLegacyAdminId clips to 50 chars to match
  // the new tb_header_order.hlockedby varchar(50) column (migration 0159).
  const currentAdminId = safeLegacyAdminId(await resolveCurrentLegacyAdminId(), 50);

  // Price breakdown (legacy update.php L277-292) — for the read-only summary
  // shown when items are locked (status 3/4/5).
  const chn      = Number(r.htotalpricechn ?? 0);
  const shipChn  = Number(r.hshippingchn ?? 0);
  const rate     = Number(r.hrate ?? 0);
  const svc      = Number(r.hshippingservice ?? 0);
  const rateCost = Number(r.hratecost ?? 0);
  const costAll  = Number(r.hcostall ?? 0);
  const netThb   = roundUp2((chn + shipChn) * rate + svc);
  // กำไรสุทธิ (legacy update.php L280) — cost-authority view only (§0e).
  const profit   = (chn + shipChn) * rate - rateCost * costAll;
  const priceUpdate = Number(r.hpriceupdate ?? 0);

  // Customer-detail derivation (mirrors legacy-view.tsx) — for the order-context
  // block shown at the tracking step so the admin sees "ของใคร / ที่อยู่ไหน".
  const addr = [
    r.haddressno,
    r.haddresssubdistrict ? `ต.${r.haddresssubdistrict}` : "",
    r.haddressdistrict ? `อ.${r.haddressdistrict}` : "",
    r.haddressprovince ? `จ.${r.haddressprovince}` : "",
    r.haddresszipcode,
  ].filter(Boolean).join(" ");

  // Status workflow eligibility.
  const isEditable     = status === "1" || status === "2" || status === "6";
  const showMarkPaid   = status === "1" || status === "2";
  // 2026-06-29 (owner P22328 bug "พอกดแก้ รายการและร้านหายหมด" · multi-shop 10
  // ร้าน): status 40 (ถึงโกดังจีน) is reached as soon as the FIRST shop's
  // forwarder hits the China warehouse — but the OTHER shops still need their
  // tracking entered + ฝากนำเข้า spawned LATER (each shop ships separately). So
  // the per-shop tracking-entry board + spawn must stay open at 40 too, not only
  // 4 — otherwise the board vanishes the moment one shop arrives.
  const showSpawn      = status === "4" || status === "40";
  const showCompleted  = status === "5";
  const showRefund     = status === "3" || status === "4" || status === "40" || status === "5";
  // 2026-06-29 (owner: "อยากให้ขึ้นรายละเอียด เหมือนหน้ารอชำระเงิน") — render the
  // rich order-context block (customer + price breakdown like the detail view)
  // at the post-payment / tracking steps (3 / 4 / ถึงโกดังจีน 40 / สำเร็จ 5).
  // At status 1/2/6 the editable ShopItemsEditor already shows the prices.
  const showOrderContext = status === "3" || status === "4" || status === "40" || status === "5";

  const detailHref = `/admin/service-orders/${encodeURIComponent(r.hno)}`;

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-6xl mx-auto">
      {/* ── 0. Heartbeat lock banner (legacy updateLock.php · E4 · 2026-06-09) ──
          Mounted first so the "กำลังถูกแก้ไขโดย admin XYZ" warning is the FIRST
          thing the second admin sees before they start typing into any of the
          inline edits below. Pure UI/courtesy guard — server-side mutation
          blocks are deferred (see actions/admin/service-orders-lock.ts). */}
      <HeartbeatLock hNo={r.hno} currentAdminId={currentAdminId} />

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

      {/* ── 3. 5-step process bar ──
          2026-06-04 (ภูม flag #3): same icon + label style as
          /admin/forwarders/[fNo]/edit · current = ring-2 + primary fill,
          visited = emerald-50 + emerald icon, pending = surface-alt + muted */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-3 lg:p-4 shadow-sm">
        <div className="grid grid-cols-6 gap-2">
          {STATUS_STEPS.map((step) => {
            const cur = step.code === status;
            // Rank-based (not Number()) so "40" ถึงโกดังจีน ranks between 4 and 5.
            const curRank = STATUS_ORDER_RANK[status] ?? 0;
            const stepRank = STATUS_ORDER_RANK[step.code] ?? 0;
            const visited = curRank > stepRank && status !== "6";
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

      {/* ── 3a. ORDER CONTEXT (owner 2026-06-29 "อยากให้ขึ้นรายละเอียด เหมือนหน้า
          รอชำระเงิน — มีราคาขายบอก มีรายละเอียดบอก") ──
          At the post-payment / tracking steps the editable items table is gone,
          so this block surfaces the SAME info the read-only detail (legacy-view)
          shows: ลูกค้า + ที่อยู่จัดส่ง + ตัวเลือกขนส่ง (LEFT) · ราคาขาย breakdown
          (RIGHT · ราคาสินค้า / ค่าขนส่งจีน / ราคารวมสุทธิ + กำไรถ้าเป็น cost-role).
          Status 1/2/6 already see prices in the editable ShopItemsEditor. */}
      {showOrderContext && (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* LEFT — customer + delivery + transport options */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted">ลูกค้า</p>
              <Link
                href={`/admin/customers/${encodeURIComponent(r.userid)}`}
                className="block truncate font-semibold text-primary-600 hover:underline"
              >
                {customerName}
              </Link>
              <p className="text-xs text-muted">รหัสสมาชิก: {r.userid}</p>
              <div className="space-y-1 pt-1 text-sm">
                {u?.userEmail && (
                  <KV label="อีเมล" value={<a href={`mailto:${u.userEmail}`} className="text-primary-600 hover:underline">{u.userEmail}</a>} />
                )}
                {u?.userTel && (
                  <KV label="โทร." value={<a href={`tel:${u.userTel}`} className="text-primary-600 hover:underline">{u.userTel}</a>} />
                )}
              </div>
            </div>

            <div className="border-t border-border pt-3 space-y-2 text-sm">
              <KV label="รูปแบบขนส่ง จีน-ไทย" value={TRANSPORT_LABEL[r.htransporttype ?? ""] ?? `mode ${r.htransporttype ?? "-"}`} />
              <KV label="การตีลังไม้" value={CRATE_LABEL[r.crate ?? ""] ?? "—"} />
              <KV label="บริษัทขนส่ง" value={r.hshipby ? `${nameShipBy(r.hshipby)} (${r.hshipby})` : "—"} />
              <KV label="การเก็บเงินค่าขนส่งในไทย" value={PAY_LABEL[r.paymethod ?? ""] ?? "—"} />
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

          {/* RIGHT — price (sell) breakdown · legacy update.php L277-292 */}
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-4 sm:p-5 shadow-sm space-y-2 text-sm">
            <p className="text-xs font-semibold text-muted">ราคาขาย (สรุป)</p>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted text-xs" title="เรทฝากสั่งในวันสร้างออเดอร์">อัตราแลกเปลี่ยน</span>
              <span className="text-right text-sm">
                <span className="font-mono tabular-nums">{rate.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</span>
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
            <KV label="ชำระเงิน เพิ่ม/ลด" value={`¥${cny(priceUpdate)}`} mono />
            {canSeeCost && (
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
            )}
            <p className="text-[11px] text-muted">*ชำระเงิน เพิ่ม/ลด จะถูกคำนวณกำไรในรายการฝากนำเข้าสินค้า</p>
          </div>
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
          pricecrate={Number(r.pricecrate ?? 0)}
          hshipby={r.hshipby}
          paymethod={r.paymethod}
          hfreeshipping={r.hfreeshipping}
        />
        <div className="border-t border-border pt-3 flex items-baseline justify-between gap-3 text-sm">
          <span className="text-xs font-medium text-muted" title="เรทฝากสั่งในวันสร้างออเดอร์">อัตราแลกเปลี่ยน</span>
          <OrderRateInlineEdit hNo={r.hno} hRate={rate} />
        </div>
      </section>

      {/* ── 3c. CHANGE DELIVERY ADDRESS (จากสมุดที่อยู่ลูกค้า · legacy
          update_hAddress · wires orphan adminUpdateOrderAddress §0d).
          Hidden once the order is closed (status 5/6). ── */}
      {status !== "5" && status !== "6" && (
        <OrderAddressPanel hNo={r.hno} hShipBy={r.hshipby} addresses={savedAddresses} />
      )}

      {/* ── 3d. COST editor (เรทต้นทุน + ราคาซื้อจริง) — [[cost-editable-sell-locked]]
          แก้ได้ทุกสถานะแม้ลูกค้าจ่ายแล้ว (กระทบเฉพาะกำไร/บัญชี · ราคาขายล็อก).
          §0e data-layer gate: rendered ONLY for cost-authority roles, so cost
          numbers are never sent to a role that can't see them. The status-1/2/6
          ShopItemsEditor below also has a cost editor (for the quote flow); this
          card extends cost-editing to status 3/4/5/40. ── */}
      {canSeeCost && !isEditable && (
        <CostInlineEdit
          hNo={r.hno}
          hRateCost={rateCost}
          hCostAll={costAll}
          hRateCostDefault={hRateCostDefault}
        />
      )}

      {/* ── 4. PRIMARY — รายการสินค้า ──
          status 1/2/6  → editable `ShopItemsEditor` (price/qty/cshippingchn)
          status 3/4/5  → SKIP this section; the items table is rendered per
                          shop INSIDE `ShopFieldsBoard` below (2026-06-05 ภูม
                          flag · merge tracking inputs INTO the items table
                          per legacy PCS shops/update.php). Showing both =
                          two-tables drift; the unified per-shop card wins. */}
      {isEditable && (
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
      )}

      {/* 🪵 ราคาลังไม้ (ภูม 2026-07-01) — กรอบแยกใต้ "รายการสินค้า" เมื่อลูกค้าเลือก
          ตีลังไม้ (crate="1") · พนักงานใส่ค่าลังไม้แยก ไม่ปนกับค่าส่งจีน. status 1/2/6. */}
      {isEditable && r.crate === "1" && (
        <CratePriceBox hNo={r.hno} pricecrate={Number(r.pricecrate ?? 0)} />
      )}

      {/* ── 5. STATUS-AWARE WORKFLOW ACTIONS ── */}

      {/* status 1/2 → 💰 mark-paid from wallet (self-gates inside the form) */}
      {showMarkPaid && (
        <MarkPaidTbForm hno={r.hno} status={status} totalThb={netThb} />
      )}

      {/* 2026-06-04 (ภูม flag #4 · A-path) — per-shop status-aware board
          replaces the old single-input AdminMarkShopOrderOrderedForm.
          Active at status 3/4/5 · self-hides at status 1/2 (items-editor
          handles those). Mirrors legacy update3.php + update4.php.
          2026-06-29 (owner: "เพิ่มแทรกกิ้งร้านที่เหลือยังไง") — pass the per-shop
          spawned-forwarder summary so each shop card shows ✓ฝากนำเข้าแล้ว #fNo /
          ⌛รอ tracking + an overall "ครบ X/N ร้าน" progress (legacy update4.php
          per-shop "ตรวจสอบสถานะนำเข้า #fNo" badge). */}
      {(status === "3" || status === "4" || status === "40" || status === "5") && shopFields.length > 0 && (
        <ShopFieldsBoard
          hNo={r.hno}
          status={status}
          shops={shopFields}
          spawnSummary={shopSpawnSummary}
          doneCount={shopsDoneCount}
          totalCount={shopsTotalCount}
          trackingGroups={trackingGroups}
          hRate={rate}
        />
      )}

      {/* 🪵 ราคาลังไม้ — ใต้ per-shop board (รายการสินค้า) สำหรับ status 3/4/40/5. */}
      {(status === "3" || status === "4" || status === "40" || status === "5") && r.crate === "1" && (
        <CratePriceBox hNo={r.hno} pricecrate={Number(r.pricecrate ?? 0)} />
      )}

      {/* owner 2026-06-25 (status-sync · PR018) — manual "ถึงโกดังจีน" escape for a
          stuck status-4 order whose SF tracking never matched MOMO auto-sync. */}
      {status === "4" && <MarkArrivedChinaButton hno={r.hno} />}

      {/* status 4 → 🚛 spawn forwarder per tracking + auto-spawn-to-completed */}
      {showSpawn && (
        <>
          <section className="rounded-2xl border-2 border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 shadow-md overflow-hidden">
            <header className="bg-primary-500 text-white px-4 py-2.5 flex items-center gap-2">
              <span className="text-sm font-bold">🚛 สร้างฝากนำเข้า (tb_forwarder) จากเลข tracking</span>
              <span className="ml-auto text-[11px] bg-white/20 rounded px-1.5 py-0.5">ใช้บ่อย</span>
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

// 2026-06-05 (ภูม flag — merge tracking into items table) — the prior
// `ItemSummaryReadOnly` is deleted; the per-shop items table is now
// rendered INSIDE `ShopFieldsBoard` (legacy shops/update.php layout) so
// the admin sees ONE table with shop band + tracking input + items.
