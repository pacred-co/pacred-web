/**
 * /admin/service-orders/[hNo] — legacy fallback view (Wave 7 fix · 2026-05-21 night).
 *
 * Without this fallback every click from the `/admin` dashboard "shop1/shop2/
 * shop4" tab → `/admin/service-orders/[hNo]` 404'd because the rebuilt
 * `service_orders` table is empty on prod (the real data lives in
 * `tb_header_order` after the D1 pivot · ~ thousands of rows per customer).
 *
 * Same pattern as `forwarders/[fNo]/page.tsx` legacy fallback. Read-only.
 * Wave 8 will layer status-update + bill-to-override on top.
 *
 * Verified prod schema 2026-05-21 via REST:
 *   tb_header_order(id, hno, htitle, hcover, hcount, hdate, hdate*, hstatus,
 *                   htransporttype, htotalpricechn, htotalpriceuser,
 *                   hshippingservice, hshippingchn, hrate, hcostall, hcostallth,
 *                   hnote, hnoteuser, hshipby, hfreeshipping,
 *                   haddressname, haddresslastname, haddressno, haddresssubdistrict,
 *                   haddressdistrict, haddressprovince, haddresszipcode,
 *                   haddressnote, haddresstel, userid, paymethod, crate)
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import SpawnForwarderForm from "./spawn-form";
import { buildSpawnRows } from "./spawn-utils";
import { MarkPaidTbForm } from "./mark-paid-tb-form";
import { AdminServiceOrderUpdateForm } from "./update-form";
import { AdminQuoteShopOrderForm } from "./quote-form";
import { AdminExtraEditsPanel } from "./extra-edits-form";
import { AdminRefundItemPanel } from "./refund-item-form";
import {
  AdminMarkShopOrderOrderedForm,
  AdminSpawnToCompletedButton,
} from "./mark-ordered-form";

// Wave 31 / P0-14 — map legacy `tb_header_order.hstatus` char ('1'..'6') to
// the rebuilt-string key the update-form Server Action expects. The action
// `adminUpdateServiceOrder` (actions/admin/service-orders.ts) re-maps this
// back to the legacy char on write via REBUILT_TO_LEGACY_HSTATUS — single
// source of truth, see service-orders.ts L119-126. Without this mapping the
// form would push a legacy code into a Zod enum that only accepts the
// rebuilt-string keys → invalid_input.
const LEGACY_TO_REBUILT_KEY: Record<string, string> = {
  "1": "pending",
  "2": "awaiting_payment",
  "3": "ordered",
  "4": "awaiting_chn_dispatch",
  "5": "completed",
  "6": "cancelled",
};

const STATUS_LABEL: Record<string, string> = {
  "1": "รอดำเนินการ",
  "2": "รอชำระเงิน",
  "3": "สั่งสินค้าแล้ว",
  "4": "รอร้านจีนจัดส่ง",
  "5": "สำเร็จ",
  "6": "ออเดอร์ที่ยกเลิก",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-orange-100 text-orange-700 border-orange-200",
  "3": "bg-blue-100 text-blue-700 border-blue-200",
  "4": "bg-indigo-100 text-indigo-700 border-indigo-200",
  "5": "bg-green-100 text-green-700 border-green-200",
  "6": "bg-gray-100 text-gray-600 border-gray-200",
};
const TRANSPORT_LABEL: Record<string, string> = {
  "1": "🚚 รถ",
  "2": "🚢 เรือ",
  "3": "✈️ เครื่องบิน",
};

type HRow = {
  id: number;
  hno: string;
  htitle: string | null;
  hcover: string | null;
  hcount: number | null;
  hdate: string | null;
  hdatepayment: string | null;
  hstatus: string | null;
  htransporttype: string | null;
  htotalpricechn: number | null;
  htotalpriceuser: number | null;
  hshippingservice: number | null;
  hshippingchn: number | null;
  hrate: number | null;
  hcostall: number | null;
  hcostallth: number | null;
  hnote: string | null;
  hnoteuser: string | null;
  hshipby: string | null;
  hfreeshipping: string | null;
  haddressname: string | null;
  haddresslastname: string | null;
  haddressno: string | null;
  haddresssubdistrict: string | null;
  haddressdistrict: string | null;
  haddressprovince: string | null;
  haddresszipcode: string | null;
  haddresstel: string | null;
  haddressnote: string | null;
  userid: string;
  paymethod: string | null;
  crate: string | null;
};
type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
};

export async function renderLegacyServiceOrderView(hno: string) {
  const admin = createAdminClient();
  const { data: rowRaw, error: rowRawErr } = await admin
    .from("tb_header_order")
    .select(
      "id,hno,htitle,hcover,hcount,hdate,hdatepayment,hstatus,htransporttype,htotalpricechn,htotalpriceuser,hshippingservice,hshippingchn,hrate,hcostall,hcostallth,hnote,hnoteuser,hshipby,hfreeshipping,haddressname,haddresslastname,haddressno,haddresssubdistrict,haddressdistrict,haddressprovince,haddresszipcode,haddresstel,haddressnote,userid,paymethod,crate",
    )
    .eq("hno", hno)
    .maybeSingle();
  if (rowRawErr) {
    console.error(`[tb_header_order lookup] failed`, { code: rowRawErr.code, message: rowRawErr.message, details: rowRawErr.details, hint: rowRawErr.hint });
    throw new Error(`Failed to load tb_header_order (${rowRawErr.code ?? "unknown"}): ${rowRawErr.message}`);
  }
  if (!rowRaw) return null;
  const r = rowRaw as unknown as HRow;

  const { data: userRaw, error: userRawErr } = await admin
    .from("tb_users")
    .select("userID,userName,userLastName,userTel,userEmail")
    .eq("userID", r.userid)
    .maybeSingle();
  if (userRawErr) {
    console.error(`[tb_users list] failed`, { code: userRawErr.code, message: userRawErr.message });
  }
  const u = userRaw as unknown as URow | null;

  // Wave 21 P0 · Task #106 — load tb_order line items for the spawn form.
  // Same pattern as the rebuilt-path branch in page.tsx; expansion lives
  // in spawn-utils.buildSpawnRows so server + client share the contract.
  //
  // Sitting G — extended SELECT to include id + ctitle + cprice + camount +
  // crewallet so the new per-item refund button has the full item detail
  // it needs (closes §0d gap for P0-16 sitting-F adminRefundShopOrderItem).
  const { data: trackingItems, error: trackingErr } = await admin
    .from("tb_order")
    .select("id, cnameshop, cshippingnumber, ctrackingnumber, ctitle, cprice, camount, crewallet")
    .eq("hno", r.hno)
    .order("id", { ascending: true })
    .limit(200);
  if (trackingErr) {
    console.error(`[tb_order spawn list legacy-view] failed`, {
      code: trackingErr.code, message: trackingErr.message,
    });
  }
  const spawnRows = buildSpawnRows(trackingItems ?? []);
  // Refundable items = anything with remaining camount > 0 and NOT yet
  // marked crewallet='1' (already refunded full-qty).
  const refundableItems = (trackingItems ?? [])
    .filter((it: { id?: number; ctitle?: string; cprice?: number; camount?: number; crewallet?: string | null }) =>
      Number(it.camount ?? 0) > 0 && it.crewallet !== "1")
    .map((it: { id?: number; ctitle?: string; cprice?: number; camount?: number; cnameshop?: string }) => ({
      id:        Number(it.id ?? 0),
      title:     it.ctitle ?? "",
      cprice:    Number(it.cprice ?? 0),
      camount:   Number(it.camount ?? 0),
      cnameshop: it.cnameshop ?? "",
    }));

  const customerName = `${u?.userName ?? ""} ${u?.userLastName ?? ""}`.trim() || "—";
  const status = r.hstatus ?? "1";
  const transport = r.htransporttype ?? "";
  const addr = [
    r.haddressno,
    r.haddresssubdistrict,
    r.haddressdistrict,
    r.haddressprovince,
    r.haddresszipcode,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <main className="p-6 lg:p-8 max-w-4xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · ฝากสั่งซื้อ</p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">{r.hno}</h1>
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"
              }`}
            >
              {STATUS_LABEL[status] ?? `status ${status}`}
            </span>
            {transport ? (
              <span className="rounded-full border border-border bg-surface-alt px-3 py-1 text-xs">
                {TRANSPORT_LABEL[transport] ?? `mode ${transport}`}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted mt-1">
            Wave 31 / P0-14 · admin status/cancel/note now writes tb_header_order for 21,950 legacy orders
          </p>
        </div>
        <Link href="/admin/service-orders" className="text-xs text-primary-600 hover:underline">
          ← รายการฝากสั่ง
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <KV label="ลูกค้า" value={`${customerName} (${r.userid})`} />
        <KV label="โทร · อีเมล" value={`${u?.userTel ?? "-"} · ${u?.userEmail ?? "-"}`} />
        <KV label="สินค้า" value={r.htitle ?? "-"} />
        <KV label="จำนวน" value={String(r.hcount ?? 0)} mono />
        <KV
          label="ยอด CNY"
          value={`¥${Number(r.htotalpricechn ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV
          label="ยอด THB"
          value={`฿${Number(r.htotalpriceuser ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
          mono
        />
        <KV label="เรท" value={String(r.hrate ?? 0)} mono />
        <KV label="วันที่สร้าง" value={r.hdate ? new Date(r.hdate).toLocaleString("th-TH") : "-"} />
        <KV
          label="วันที่ชำระ"
          value={r.hdatepayment ? new Date(r.hdatepayment).toLocaleString("th-TH") : "-"}
        />
        {r.hshipby ? <KV label="ขนส่ง" value={r.hshipby} /> : null}
        {r.hfreeshipping === "1" ? <KV label="ขนส่งฟรี" value="ใช่" /> : null}
        {r.crate === "1" ? <KV label="ตีลังไม้" value="ใช่" /> : null}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <p className="text-xs font-semibold text-muted">ที่อยู่จัดส่ง</p>
        <KV label="ผู้รับ" value={`${r.haddressname ?? ""} ${r.haddresslastname ?? ""}`.trim() || "-"} />
        <KV label="โทร" value={r.haddresstel ?? "-"} />
        <KV label="ที่อยู่" value={addr || "-"} />
        {r.haddressnote ? <KV label="หมายเหตุที่อยู่" value={r.haddressnote} /> : null}
      </div>

      {(r.hnote || r.hnoteuser) && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
          {r.hnote ? <KV label="หมายเหตุแอดมิน" value={r.hnote} /> : null}
          {r.hnoteuser ? <KV label="หมายเหตุลูกค้า" value={r.hnoteuser} /> : null}
        </div>
      )}

      {r.hcover ? (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <p className="text-xs font-semibold text-muted mb-2">รูปสินค้า</p>
          <a
            href={r.hcover}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={r.hcover} alt={r.htitle ?? "สินค้า"} className="max-w-full max-h-[480px]" />
          </a>
        </div>
      ) : null}

      {/* P0-13 Phase 1 #1 — QUOTE handler (hstatus '1' → '2').
          Renders only when hstatus = '1' (รอดำเนินการ). Admin types the THB
          price; action UPDATEs tb_header_order + sets hdatepayment NOW+5d +
          4-CH notify customer. Closes legacy-gap S12. */}
      {status === "1" ? (
        <AdminQuoteShopOrderForm
          hNo={r.hno}
          totalCny={Number(r.htotalpricechn ?? 0)}
          hrate={Number(r.hrate ?? 0)}
        />
      ) : null}

      {/* Tier A2 fix · 2026-05-29 — admin "Mark as Paid" against tb_header_order.
          Closes the revenue leak: existing /service-orders/page.tsx's mark-paid
          action wrote to the empty rebuilt service_orders table; this form
          targets the live tb_header_order + tb_wallet + tb_wallet_hs trio.
          Mounts on status ∈ {'1','2'} per its own internal guard. */}
      <MarkPaidTbForm
        hno={r.hno}
        status={status}
        totalThb={Number(r.htotalpriceuser ?? 0)}
      />

      {/* P0-13 Phase 1 #2 — ORDERED handler (hstatus '3' → '4').
          Renders only when hstatus = '3' (สั่งสินค้าแล้ว · ลูกค้าได้จ่ายแล้ว).
          Admin pastes the China shop order number; action UPDATEs every
          tb_order line + flips header to '4' + 3-CH notify. Closes legacy-gap S13. */}
      {status === "3" ? <AdminMarkShopOrderOrderedForm hNo={r.hno} /> : null}

      {/* P0-13 Phase 1 #3 — AUTO-SPAWN to completed (hstatus '4' → '5').
          Renders only when hstatus = '4' (รอจีนจัดส่ง). Admin clicks once after
          all tracking is on tb_order; action spawns tb_forwarder per shop,
          carries tb_promotion, flips header to '5', 2-3 CH notify. Closes
          legacy-gap S14 missing 4→5 + tb_promotion carry. */}
      {status === "4" ? <AdminSpawnToCompletedButton hNo={r.hno} /> : null}

      {/* Wave 31 / P0-14 — admin status flip + cancel + saveNote panel.
          Before this render, all 21,950 real `tb_header_order` rows had no
          editable form on the legacy path — staff fell back to legacy PHP.
          `adminUpdateServiceOrder` (actions/admin/service-orders.ts) already
          targets tb_header_order correctly (Tier A4); this just mounts the
          existing form. Status is mapped legacy char → rebuilt-string key
          because the action's Zod enum accepts the rebuilt vocabulary; the
          action re-maps back to the legacy char on write. */}
      <AdminServiceOrderUpdateForm
        hNo={r.hno}
        status={LEGACY_TO_REBUILT_KEY[r.hstatus ?? "1"] ?? "pending"}
        note_admin={r.hnote ?? null}
      />

      {/* Sitting G — 3 Phase-2 header-edit handlers from P0-13 batch
          (sitting F) now have UI buttons. Address / Transport / Note
          editing on real `tb_header_order` rows without leaving Pacred.
          Closes §0d reachability gap from sitting F. */}
      <AdminExtraEditsPanel
        hNo={r.hno}
        hstatus={r.hstatus ?? "1"}
        haddressname={r.haddressname}
        haddresslastname={r.haddresslastname}
        haddressno={r.haddressno}
        haddresssubdistrict={r.haddresssubdistrict}
        haddressdistrict={r.haddressdistrict}
        haddressprovince={r.haddressprovince}
        haddresszipcode={r.haddresszipcode}
        haddresstel={r.haddresstel}
        haddressnote={r.haddressnote}
        htransporttype={r.htransporttype}
        hnote={r.hnote}
        hnoteuser={r.hnoteuser}
      />

      {/* Sitting G — per-item refund UI (closes §0d gap for sitting-F
          P0-16 adminRefundShopOrderItem). Server-side already handles
          tb_order partial-qty split + tb_wallet_hs type='5' + tb_wallet
          balance-bump + parent total recompute. Refunds visible
          instantly via router.refresh. */}
      <AdminRefundItemPanel
        hNo={r.hno}
        hstatus={r.hstatus ?? "1"}
        refundableItems={refundableItems}
      />

      {/* Wave 21 P0 · Task #106 — shop→forwarder auto-spawn. Mirrors legacy
          `pcs-admin/include/pages/shops/update/update4.php` L88-116. */}
      <SpawnForwarderForm
        hNo={r.hno}
        rows={spawnRows}
        defaultShipBy={r.hshipby ?? undefined}
        defaultTransportType={r.htransporttype ?? undefined}
      />

      <div className="flex gap-2 flex-wrap pt-2">
        <Link
          href="/admin/service-orders"
          className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt"
        >
          ← รายการ
        </Link>
        <Link
          href={`/admin/customers/${encodeURIComponent(r.userid)}`}
          className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600"
        >
          ดูโปรไฟล์ลูกค้า →
        </Link>
      </div>
    </main>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5 gap-3">
      <span className="text-muted shrink-0">{label}</span>
      <span className={mono ? "font-mono text-right" : "text-right"}>{value}</span>
    </div>
  );
}
