"use client";

/**
 * Shop fields board — per-shop status-aware inputs for ฝากสั่งซื้อ /edit
 * (2026-06-04 ภูม flag #4 · A-path · faithful to legacy update3/update4.php).
 *
 * Sits between the 5-step pipeline bar and `<ShopItemsEditor>`. Renders ONE
 * card per unique `cnameshop` in the order with status-aware inputs:
 *
 *   status 3 (สั่งสินค้า → รอร้านจีนจัดส่ง):
 *     - `cshippingnumber` input per shop (the Chinese SHOP order number that
 *       the seller assigned us)
 *     - submit ALL shops at once → `adminMarkShopOrderOrdered({shops:[...]})`
 *       → flips hstatus 3 → 4 + notifies customer
 *
 *   status 4 (รอร้านจีนจัดส่ง → สำเร็จ):
 *     - `cshippingnumber` displayed READ-ONLY (locked once status flipped)
 *     - `ctrackingnumber` input per shop (the China-side tracking the seller
 *       hands us after dispatch)
 *     - submit per-shop tracking → `adminUpdateShopTracking({shops:[...]})`
 *       (no status flip — that's the SpawnForwarderForm's job below)
 *     - "ตรวจสอบรายการนำเข้า" link per row → `/admin/forwarders?q=<tracking>`
 *       (legacy update4.php "ตรวจสอบรายการนำเข้า" button)
 *
 *   status 1/2: not shown (price-editing phase — items-editor handles it)
 *   status 5  : read-only display (all shops shown with both numbers)
 *
 * Per-shop pattern matches legacy `update3.php` + `update4.php`:
 *   SELECT DISTINCT(cNameShop) AS cNameShop, cShippingNumber FROM tb_order
 *     WHERE hNo=? GROUP BY cNameShop;
 *   for each shop → UPDATE tb_order SET cShippingNumber WHERE hNo+cNameShop;
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  Store, Save, ExternalLink, CheckCircle2, Truck, Coins, Pencil,
  ChevronDown, ChevronRight, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { fstatusBadge } from "@/lib/admin/forwarder-status";
import {
  adminMarkShopOrderOrdered,
  adminUpdateShopTracking,
} from "@/actions/admin/service-orders-shop-workflow";
import {
  adminUpdateCartItemPriceUpdate,
  adminUpdateCartItemShippingNumber,
  adminUpdateCartItemCTracking,
} from "@/actions/admin/service-orders-line-edits";

export type ShopFieldsItem = {
  id: number;
  ctitle: string;
  camount: number;
  cprice: number;
  cpriceupdate: number;
  crewallet: string | null;
  // 2026-06-05 (ภูม flag — merge tracking inputs INTO items table per legacy
  // PCS shops/update.php) — display fields so this card can render the full
  // per-shop items table (image + link + variant + ค่าส่งจีน + รวม).
  coverUrl?: string | null;
  curl?: string | null;
  ccolor?: string | null;
  csize?: string | null;
  cshippingchn?: number;
};
export type ShopFieldsRow = {
  cnameshop: string;
  cshippingnumber: string;
  ctrackingnumber: string;
  items?: ShopFieldsItem[];   // per-line ¥ cPriceUpdate (legacy update3.php L85)
};

// 2026-06-29 (owner: "เพิ่มแทรกกิ้งร้านที่เหลือยังไง") — per-shop spawned-forwarder
// summary resolved server-side (page.tsx). Each shop's tracking tokens map to a
// tb_forwarder (✓ฝากนำเข้าแล้ว #fNo) or are still waiting (⌛รอ tracking).
export type ShopSpawnResolved = {
  tracking: string;
  fNo: number | null;
  statusLabel: string | null;
  statusChip: string | null;
};
export type ShopSpawnSummaryRow = {
  cnameshop: string;
  hasTracking: boolean;
  resolved: ShopSpawnResolved[];
  done: boolean;
};

// 2026-06-30 (owner · spec §5 GROUPING) — items that share the SAME
// `ctrackingnumber` collapse into ONE dropdown whose HEADER summarises that
// tracking (mirrors the report-cnt box-breakdown dropdown). The grouping math +
// the TrackingGroup shape now live in the SHARED lib helper so the /edit board
// AND the read-only detail panel render the same groups (ภูม 2026-07-01 · §12).
export type { TrackingGroup, TrackingGroupItem } from "@/lib/admin/shop-order-tracking-groups";
import type { TrackingGroup } from "@/lib/admin/shop-order-tracking-groups";

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500/50 disabled:bg-surface-alt disabled:text-muted";

export function ShopFieldsBoard({
  hNo,
  status,
  shops,
  spawnSummary,
  doneCount,
  totalCount,
  trackingGroups,
  hRate,
}: {
  hNo: string;
  status: string;        // hstatus '1'..'5'
  shops: ShopFieldsRow[]; // grouped by cnameshop server-side
  // 2026-06-29 — per-shop spawned-forwarder summary (page.tsx) for the progress
  // badges. Optional so any other caller keeps working.
  spawnSummary?: ShopSpawnSummaryRow[];
  doneCount?: number;
  totalCount?: number;
  // 2026-06-30 (spec §5) — items grouped by ctrackingnumber for the at-a-glance
  // SUMMARY view (collapsible dropdowns). Optional · when ≥1 group the
  // "จัดกลุ่มตามแทรคกิ้ง" view sits above the per-shop edit cards.
  trackingGroups?: TrackingGroup[];
  /** ฝากสั่ง rate (hrate · บาท/หยวน) — for the display-only THB est in the header. */
  hRate?: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hnotechn, setHnoteChn] = useState<string>("");

  // Per-shop local state (keyed by cnameshop) — `cshippingnumber` and
  // `ctrackingnumber` so the admin can edit one or the other depending
  // on status.
  const [draft, setDraft] = useState<Record<string, { cshippingnumber: string; ctrackingnumber: string }>>(
    () => {
      const init: Record<string, { cshippingnumber: string; ctrackingnumber: string }> = {};
      for (const s of shops) {
        init[s.cnameshop] = {
          cshippingnumber: s.cshippingnumber ?? "",
          ctrackingnumber: s.ctrackingnumber ?? "",
        };
      }
      return init;
    },
  );

  // 2026-06-29 — per-shop spawned summary lookup (by cnameshop).
  const summaryByShop = new Map<string, ShopSpawnSummaryRow>();
  for (const s of spawnSummary ?? []) summaryByShop.set(s.cnameshop, s);
  const showProgress = (totalCount ?? 0) > 0 && (status === "4" || status === "40" || status === "5");

  // 2026-06-30 (spec §5) — tracking-grouped SUMMARY dropdowns.
  // P22328 = 16 shops / 150 items → grouping the items by ctrackingnumber lets
  // staff scan "this tracking = N รายการ · ¥รวม · arrival pill" at a glance.
  const groups = trackingGroups ?? [];
  const totalGroupItems = groups.reduce((s, g) => s + g.itemCount, 0);
  // Default the grouped SUMMARY view ON when there are many items (the owner's
  // P22328 pain point); a toggle lets staff hide it.
  const [showGrouped, setShowGrouped] = useState<boolean>(totalGroupItems >= 12);
  // Per-group expand state. Collapsed by default when many groups/items (the
  // header IS the at-a-glance summary · §0g); auto-open a single group.
  const [expandedTracking, setExpandedTracking] = useState<Set<string>>(
    () => (groups.length <= 1 ? new Set(groups.map((g) => g.tracking)) : new Set()),
  );
  function toggleTracking(tr: string) {
    setExpandedTracking((prev) => {
      const next = new Set(prev);
      if (next.has(tr)) next.delete(tr);
      else next.add(tr);
      return next;
    });
  }

  // ─── status 1/2 — items-editor handles · we render nothing ────────
  if (status === "1" || status === "2") return null;

  function setField(shop: string, key: "cshippingnumber" | "ctrackingnumber", v: string) {
    setDraft((d) => ({ ...d, [shop]: { ...d[shop], [key]: v } }));
  }

  // ─── status 3 → submit all shops cshippingnumber + flip 3→4 ───────
  function onSubmitOrdered() {
    setMsg(null);
    setErr(null);
    const payload = shops.map((s) => ({
      cnameshop: s.cnameshop,
      cshippingnumber: (draft[s.cnameshop]?.cshippingnumber ?? "").trim(),
    }));
    const missing = payload.filter((p) => p.cshippingnumber.length === 0);
    if (missing.length > 0) {
      setErr(`กรอกเลขออเดอร์ร้านจีนให้ครบทุกร้าน · ขาด ${missing.length} ร้าน`);
      return;
    }
    if (!confirm(
      `ยืนยันส่งออเดอร์ #${hNo} เป็น "รอร้านจีนจัดส่ง"?\n\n` +
      `บันทึกเลขออเดอร์ร้านจีน ${payload.length} ร้าน · เปลี่ยนสถานะ 3 → 4 · แจ้งลูกค้า 3 ช่องทาง`,
    )) return;
    startTransition(async () => {
      const res = await adminMarkShopOrderOrdered({
        hNo,
        shops: payload,
        hnotechn: hnotechn.trim().length > 0 ? hnotechn : undefined,
      });
      if (res.ok) {
        setMsg(
          `✅ บันทึก ${res.data?.shops_updated ?? 0} ร้าน · ${res.data?.rows_updated ?? 0} แถว · ` +
            `เปลี่ยนสถานะเป็น "รอร้านจีนจัดส่ง" · แจ้งลูกค้าแล้ว`,
        );
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setErr(res.error);
      }
    });
  }

  // ─── status 4 → submit per-shop ctrackingnumber (no status flip) ──
  function onSubmitTracking() {
    setMsg(null);
    setErr(null);
    const payload = shops.map((s) => ({
      cnameshop: s.cnameshop,
      ctrackingnumber: (draft[s.cnameshop]?.ctrackingnumber ?? "").trim(),
    }));
    // legacy update4 allows empty (clears) but we warn if entirely empty
    if (payload.every((p) => p.ctrackingnumber.length === 0)) {
      setErr("กรอกเลข Tracking จีนอย่างน้อย 1 ร้านก่อนบันทึก");
      return;
    }
    startTransition(async () => {
      const res = await adminUpdateShopTracking({ hNo, shops: payload });
      if (res.ok) {
        setMsg(
          `✅ บันทึกเลข Tracking ${res.data?.shops_updated ?? 0} ร้าน · ${res.data?.rows_updated ?? 0} แถว`,
        );
        router.refresh();
        setTimeout(() => setMsg(null), 6000);
      } else {
        setErr(res.error);
      }
    });
  }

  const isStatus3 = status === "3";
  // 2026-06-29 (owner P22328 · multi-shop): status 40 (ถึงโกดังจีน) = some shops
  // arrived, the rest still need tracking entered later → treat 40 like 4 (the
  // tracking-entry phase) so the board + per-shop inputs stay usable.
  const isArrived40 = status === "40";
  const isStatus4 = status === "4" || isArrived40;
  const isStatus5 = status === "5";
  const showSubmit = isStatus3 || isStatus4;

  return (
    <section className="rounded-2xl border-2 border-primary-300 bg-primary-50/30 dark:bg-primary-950/20 shadow-md overflow-hidden">
      <header className="bg-primary-500 text-white px-4 py-2.5 flex items-center gap-2">
        <Store className="h-4 w-4" />
        <span className="text-sm font-bold">
          {isStatus3 && "📝 บันทึกเลขออเดอร์ร้านจีน (สถานะ 3 → 4)"}
          {isStatus4 && !isArrived40 && "🚛 บันทึกเลข Tracking ร้านจีน (สถานะ 4)"}
          {isArrived40 && "🚛 บันทึกเลข Tracking ร้านจีน · ถึงโกดังจีนแล้วบางร้าน — ใส่ร้านที่เหลือต่อได้"}
          {isStatus5 && "✓ ข้อมูลร้านจีน (อ่านอย่างเดียว)"}
        </span>
        <span className="ml-auto text-[11px] bg-white/20 rounded px-1.5 py-0.5">
          {shops.length} ร้าน
        </span>
      </header>

      <div className="p-3 sm:p-4 space-y-3">
        {msg && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700">{msg}</div>
        )}
        {err && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>
        )}

        {/* 2026-06-29 (owner: "เพิ่มแทรกกิ้งร้านที่เหลือยังไง") — overall progress.
            At status 4 the admin enters tracking + creates ฝากนำเข้า ร้านต่อร้าน;
            this shows how many shops are done so they know what's left. */}
        {showProgress && (
          <div className={`rounded-lg border p-2.5 ${
            (doneCount ?? 0) >= (totalCount ?? 0)
              ? "border-emerald-200 bg-emerald-50"
              : "border-amber-200 bg-amber-50"
          }`}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-foreground">
                ความคืบหน้าสร้างฝากนำเข้า: ครบ {doneCount ?? 0}/{totalCount ?? 0} ร้าน
              </span>
              <span className="text-[11px] text-muted">
                {(doneCount ?? 0) >= (totalCount ?? 0)
                  ? "ทุกร้านมีฝากนำเข้าแล้ว"
                  : `เหลืออีก ${(totalCount ?? 0) - (doneCount ?? 0)} ร้าน · ออเดอร์จะ "สำเร็จ" เมื่อครบทุกร้าน`}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-white/70 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (doneCount ?? 0) >= (totalCount ?? 0) ? "bg-emerald-500" : "bg-amber-500"
                }`}
                style={{ width: `${(totalCount ?? 0) > 0 ? Math.round(((doneCount ?? 0) / (totalCount ?? 1)) * 100) : 0}%` }}
              />
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted leading-relaxed">
          {isStatus3 && "แต่ละร้านมี \"เลขออเดอร์ร้านจีน\" ของตัวเอง · กรอกครบทุกร้านแล้วกด \"ส่งเข้ารอร้านจีนจัดส่ง\" → ลูกค้าจะได้รับแจ้งเตือน"}
          {isStatus4 && "กรอกเลข Tracking ที่ร้านจีนส่งมาเป็นรายร้าน · กดปุ่ม \"ตรวจสอบรายการนำเข้า\" เพื่อดูสถานะ tb_forwarder ที่ระบบ spawn ให้แล้ว"}
          {isStatus5 && "ออเดอร์สำเร็จแล้ว · ระบบเปิดใบฝากนำเข้าให้ครบแล้ว"}
        </p>

        {/* 2026-06-30 (spec §5 GROUPING) — collapse items by ctrackingnumber.
            P22328 has 16 ร้าน / 150 รายการ → this at-a-glance SUMMARY (one
            collapsible dropdown per tracking · header = จำนวนรายการ · ¥รวม ·
            arrival pill · #fNo) sits ABOVE the per-shop edit cards. Read-only.
            §0g self-explaining · §0h ≥11px. */}
        {groups.length > 0 && (
          <div className="rounded-xl border border-border bg-surface-alt/20 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGrouped((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-alt/40 transition-colors"
              aria-expanded={showGrouped}
            >
              {showGrouped ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              <Package className="h-3.5 w-3.5 text-primary-600" />
              <span>จัดกลุ่มตามแทรคกิ้ง ({groups.length} แทรคกิ้ง · {totalGroupItems.toLocaleString()} รายการ)</span>
              <span className="ml-auto text-[11px] font-normal text-muted">
                {showGrouped ? "ซ่อน" : "แสดง"}สรุปแบบกลุ่ม
              </span>
            </button>
            {showGrouped && (
              <div className="border-t border-border px-2 pb-2 pt-1.5 space-y-1.5">
                {groups.map((g) => (
                  <TrackingGroupRow
                    key={g.tracking || "__none__"}
                    group={g}
                    expanded={expandedTracking.has(g.tracking)}
                    onToggle={() => toggleTracking(g.tracking)}
                    hRate={hRate}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          {shops.map((sh) => {
            const d = draft[sh.cnameshop] ?? { cshippingnumber: "", ctrackingnumber: "" };
            const shopFwdSearchHref = sh.ctrackingnumber
              ? `/admin/forwarders?q=${encodeURIComponent(sh.ctrackingnumber)}`
              : null;
            // ── Per-shop totals (legacy shops/update.php) ──────────────
            // sum(amount × price + cshippingchn) — in ¥; the table at the
            // top of /edit already shows the ¥ rate × THB summary, so we
            // surface only the ¥ subtotal in the shop header chip.
            const shopItems = sh.items ?? [];
            const shopSubtotalCny = shopItems.reduce((sum, it) => {
              if (it.crewallet === "1") return sum;
              return sum + it.camount * it.cprice + Number(it.cshippingchn ?? 0);
            }, 0);
            // 2026-06-29 — per-shop spawned summary (✓ฝากนำเข้าแล้ว / ⌛รอ tracking).
            const summary = summaryByShop.get(sh.cnameshop);
            return (
              <div
                key={sh.cnameshop}
                className="rounded-xl border-2 border-primary-200 bg-white dark:bg-surface shadow-sm overflow-hidden"
              >
                {/* ── Shop band header (legacy shops/update.php — ชื่อร้าน band) */}
                <div className="bg-primary-50 dark:bg-primary-950/30 border-b border-primary-200 px-3 py-2 flex flex-wrap items-center gap-2">
                  <Store className="h-4 w-4 text-primary-600 shrink-0" />
                  <span className="text-sm font-bold text-foreground">
                    ชื่อร้าน: <span className="font-normal">{sh.cnameshop}</span>
                  </span>
                  <span className="ml-auto inline-flex items-center gap-2 text-[11px]">
                    {/* per-shop spawn status (legacy update4.php ตรวจสอบสถานะนำเข้า) */}
                    {summary && (status === "4" || status === "40" || status === "5") && (
                      summary.done ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 px-2 py-0.5 font-medium">
                          <CheckCircle2 className="h-3 w-3" /> ฝากนำเข้าแล้ว
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 text-amber-700 px-2 py-0.5 font-medium">
                          ⌛ {summary.hasTracking ? "รอสร้างฝากนำเข้า" : "รอ tracking"}
                        </span>
                      )
                    )}
                    <span className="rounded bg-white/80 border border-border px-2 py-0.5 font-mono tabular-nums">
                      {shopItems.length} รายการ
                    </span>
                    <span className="rounded bg-white/80 border border-border px-2 py-0.5 font-mono tabular-nums">
                      ¥ {shopSubtotalCny.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </span>
                </div>

                {/* 2026-06-29 — per-tracking forwarder links (legacy update4.php
                    L126-131/L168-173 "ตรวจสอบสถานะนำเข้า #fNo"). When a tracking
                    token already spawned a tb_forwarder, link straight to it with
                    its live status; otherwise show ⌛รอสร้าง. */}
                {summary && summary.resolved.length > 0 && (status === "4" || status === "40" || status === "5") && (
                  <div className="px-3 py-2 border-b border-border bg-surface-alt/30 space-y-1">
                    {summary.resolved.map((rv) => (
                      <div key={rv.tracking} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <span className="font-mono tabular-nums text-muted truncate max-w-[60%]" title={rv.tracking}>
                          {rv.tracking}
                        </span>
                        {rv.fNo != null ? (
                          <a
                            href={`/admin/forwarders/${rv.fNo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 hover:bg-emerald-100"
                          >
                            <ExternalLink className="h-3 w-3" /> ฝากนำเข้า #{rv.fNo}
                            {rv.statusLabel && <span className="text-muted">· {rv.statusLabel}</span>}
                          </a>
                        ) : (
                          <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium text-amber-700">
                            ⌛ รอสร้างฝากนำเข้า
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Tracking inputs (top of the shop card) ──
                    Legacy `shops/update3.php` + `update4.php` put these
                    INSIDE the shop's items table; we use a 2-up grid that
                    sits between the shop header and the items table so the
                    admin sees them right next to the items they belong to. */}
                <div className="px-3 py-2.5 bg-amber-50/40 border-b border-border grid sm:grid-cols-2 gap-2">
                  {/* cshippingnumber — editable at status 3 (initial save
                      via the bottom bulk submit · adminMarkShopOrderOrdered).
                      Locked at 4/5 — but the inline "แก้คำผิด" sub-form
                      below opens the typo-fix path (E3.5 ·
                      adminUpdateCartItemShippingNumber). */}
                  <div className="space-y-1">
                    <label className="block space-y-1">
                      <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                        เลขออเดอร์ร้านจีน{" "}
                        {isStatus3 && <span className="text-red-500">*</span>}
                      </span>
                      <input
                        type="text"
                        value={d.cshippingnumber}
                        onChange={(e) => setField(sh.cnameshop, "cshippingnumber", e.target.value)}
                        disabled={!isStatus3 || pending}
                        placeholder="เช่น 5119114033176034116"
                        className={inputCls}
                      />
                    </label>
                    {(isStatus4 || isStatus5) && (
                      <ShippingNumberTypoFixer
                        hNo={hNo}
                        cNameShop={sh.cnameshop}
                        currentShippingNumber={sh.cshippingnumber}
                        onSaved={() => router.refresh()}
                      />
                    )}
                  </div>

                  {/* ctrackingnumber — editable at status 4 · readonly at 5
                      · placeholder cell at status 3 (so the grid keeps shape) */}
                  {(isStatus4 || isStatus5) ? (
                    <div className="space-y-1">
                      <label className="block space-y-1">
                        <span className="text-[11px] font-semibold text-muted flex items-center gap-1">
                          <Truck className="h-3 w-3" /> เลข Tracking จีน
                          {isStatus4 && <span className="text-muted/70 font-normal">(หลายเลข ใส่ , คั่น)</span>}
                        </span>
                        <div className="flex gap-2 items-center">
                          <input
                            type="text"
                            value={d.ctrackingnumber}
                            onChange={(e) => setField(sh.cnameshop, "ctrackingnumber", e.target.value)}
                            disabled={!isStatus4 || pending}
                            placeholder="เลข Tracking จีน"
                            className={inputCls}
                          />
                          {shopFwdSearchHref && (
                            <Link
                              href={shopFwdSearchHref}
                              className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-2.5 py-2 text-[11px] font-medium text-primary-700 hover:bg-primary-100"
                              title="ค้นหารายการฝากนำเข้าตามเลข tracking นี้"
                            >
                              <ExternalLink className="h-3 w-3" />
                              ตรวจสอบ
                            </Link>
                          )}
                        </div>
                      </label>
                      <TrackingTypoFixer
                        hNo={hNo}
                        currentBag={sh.ctrackingnumber}
                        onSaved={() => router.refresh()}
                      />
                    </div>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                </div>

                {/* ── Items table (per-shop · legacy shops/update.php รายการสินค้า)
                    Columns mirror legacy: ข้อมูลสินค้า · จำนวน · ¥ราคาต่อชิ้น
                    · ค่าส่งจีน · เพิ่ม/ลด ¥ (inline editable at status 3/4)
                    · รวม ¥. Hidden if items[] not provided. */}
                {shopItems.length > 0 && (
                  <div className="overflow-x-auto scrollbar-x-visible">
                    <table className="w-full min-w-[640px] text-xs">
                      <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-2 py-2 text-left">ข้อมูลสินค้า</th>
                          <th className="px-2 py-2 text-right w-14">จำนวน</th>
                          <th className="px-2 py-2 text-right w-20">¥/ชิ้น</th>
                          <th className="px-2 py-2 text-right w-20">ค่าส่งจีน</th>
                          <th className="px-2 py-2 text-right w-36">
                            <span className="inline-flex items-center gap-1">
                              <Coins className="h-3 w-3" /> เพิ่ม/ลด ¥
                            </span>
                          </th>
                          <th className="px-2 py-2 text-right w-24">รวม ¥</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shopItems.map((it) => {
                          const refunded = it.crewallet === "1";
                          const shipping = Number(it.cshippingchn ?? 0);
                          const line = refunded
                            ? 0
                            : it.camount * it.cprice + shipping;
                          return (
                            <tr
                              key={it.id}
                              className={`border-t border-border ${refunded ? "bg-red-50/40" : ""}`}
                            >
                              <td className="px-2 py-2 align-top">
                                <div className="flex gap-2">
                                  {it.coverUrl ? (
                                    <a href={it.coverUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img src={it.coverUrl} alt={it.ctitle ?? ""} className="h-10 w-10 rounded border border-border object-cover" />
                                    </a>
                                  ) : null}
                                  <div className="min-w-0">
                                    {it.curl ? (
                                      <a
                                        href={it.curl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="block truncate max-w-[280px] text-primary-600 hover:underline"
                                        title={it.ctitle ?? ""}
                                      >
                                        {it.ctitle || it.curl}
                                      </a>
                                    ) : (
                                      <span className="block truncate max-w-[280px]" title={it.ctitle ?? ""}>
                                        {it.ctitle || "—"}
                                      </span>
                                    )}
                                    {(it.ccolor || it.csize) && (
                                      <p className="text-[11px] text-muted">
                                        {it.ccolor}{it.ccolor && it.csize ? " · " : ""}{it.csize}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                                {refunded ? 0 : it.camount}
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                                {it.cprice.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                                {shipping.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-2 py-2 align-top">
                                <InlinePriceUpdateCell
                                  item={it}
                                  editable={isStatus3 || isStatus4}
                                  onSaved={() => router.refresh()}
                                />
                              </td>
                              <td className="px-2 py-2 text-right align-top font-mono tabular-nums font-semibold">
                                {line.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {isStatus3 && (
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted">
              หมายเหตุจีน (optional · เก็บลง hnote)
            </span>
            <textarea
              rows={2}
              value={hnotechn}
              onChange={(e) => setHnoteChn(e.target.value)}
              disabled={pending}
              className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50"
              placeholder="เช่น สีไม่ตรง · ขาดของบางรายการ"
            />
          </label>
        )}

        {showSubmit && (
          <Button
            type="button"
            fullWidth
            disabled={pending}
            onClick={isStatus3 ? onSubmitOrdered : onSubmitTracking}
            className="gap-1.5"
          >
            {pending ? (
              "กำลังบันทึก..."
            ) : isStatus3 ? (
              <><Save className="h-4 w-4" /> บันทึกเลขออเดอร์ร้านจีน + เปลี่ยนสถานะเป็น &ldquo;รอร้านจีนจัดส่ง&rdquo;</>
            ) : (
              <><Save className="h-4 w-4" /> บันทึกเลข Tracking จีน ({shops.length} ร้าน)</>
            )}
          </Button>
        )}

        {isStatus5 && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4" />
            ออเดอร์สำเร็จ · ระบบเปิดใบฝากนำเข้าแล้วเรียบร้อย
          </div>
        )}
      </div>
    </section>
  );
}

// ────────────────────────────────────────────────────────────
// TrackingGroupRow — ONE collapsible dropdown per ctrackingnumber (spec §5).
// Mirrors the report-cnt box-breakdown dropdown (cnt-list-table.tsx): a header
// row that summarises the group at a glance (แทรคกิ้ง · arrival pill · จำนวนรวม ·
// ¥รวม · #fNo) + a chevron that expands the items table. Read-only · display
// only (no mutation — the per-shop edit cards below the summary stay the edit
// surface). §0g self-explaining · §0h ≥11px.
// ────────────────────────────────────────────────────────────
function fmtCny(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function TrackingGroupRow({
  group: g,
  expanded,
  onToggle,
  hRate,
}: {
  group: TrackingGroup;
  expanded: boolean;
  onToggle: () => void;
  hRate?: number;
}) {
  // arrival pill — derive from the linked forwarder's fstatus via the SOT
  // (owner's 3-stage shows here per-tracking). fstatusBadge returns the
  // canonical label + soft chip; "" (no forwarder yet) → a "ยังไม่ส่ง" pill.
  const hasForwarder = g.fstatus !== "";
  const badge = hasForwarder ? fstatusBadge(g.fstatus) : null;
  // Display-only THB est (spec §5 #5) — only when a rate is available.
  const rate = Number(hRate ?? 0);
  const thbEst = rate > 0 ? g.subtotalCny * rate : null;
  const colCount = 5; // ข้อมูลสินค้า · จำนวน · ¥/ชิ้น · ค่าส่งจีน · รวม ¥

  return (
    <div className="rounded-lg border border-border bg-white dark:bg-surface overflow-hidden">
      {/* ── Header (the at-a-glance summary · clickable to expand) ── */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-center gap-2 px-3 py-2 text-left hover:bg-surface-alt/40 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" />
        )}
        {/* 1. แทรคกิ้ง */}
        <span className="font-mono tabular-nums text-xs text-foreground break-all" title={g.tracking || "ยังไม่ส่ง"}>
          {g.tracking ? g.tracking : <span className="italic text-muted">— ยังไม่ส่ง</span>}
        </span>
        {/* 2. arrival pill (3-stage per-tracking · SOT) */}
        {badge ? (
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.chip}`}>
            {badge.label}
          </span>
        ) : (
          <span className="inline-block rounded-full border border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
            ยังไม่ส่ง
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center justify-end gap-1.5 text-[11px]">
          {/* 3. จำนวนรวม */}
          <span className="rounded bg-surface-alt/60 border border-border px-2 py-0.5 font-mono tabular-nums">
            {g.itemCount.toLocaleString()} รายการ · {g.totalQty.toLocaleString()} ชิ้น
          </span>
          {/* 4. ¥รวม (+ 5. THB est · display-only) */}
          <span className="rounded bg-surface-alt/60 border border-border px-2 py-0.5 font-mono tabular-nums font-semibold">
            ¥ {fmtCny(g.subtotalCny)}
            {thbEst != null && (
              <span className="ml-1 font-normal text-muted">≈ ฿{fmtCny(thbEst)}</span>
            )}
          </span>
          {/* 6. #fNo link (deep link to ฝากนำเข้า) */}
          {g.fNo != null && (
            <a
              href={`/admin/forwarders/${g.fNo}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 hover:bg-emerald-100"
              title="เปิดรายการฝากนำเข้าของแทรคกิ้งนี้"
            >
              <ExternalLink className="h-3 w-3" /> ฝากนำเข้า #{g.fNo}
            </a>
          )}
        </span>
      </button>

      {/* ── Sub-line: ร้านในกลุ่มนี้ (always visible · helps identify the group) ── */}
      {g.shops.length > 0 && (
        <div className="px-3 pb-1 -mt-1 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Store className="h-3 w-3" />
            {g.shops.join(" · ")}
          </span>
        </div>
      )}

      {/* ── Expanded: items table (same columns as the per-shop items table) ── */}
      {expanded && (
        <div className="border-t border-border overflow-x-auto scrollbar-x-visible">
          {g.items.length === 0 ? (
            <p className="px-3 py-3 text-[11px] text-muted">— ไม่มีรายการในแทรคกิ้งนี้</p>
          ) : (
            <table className="w-full min-w-[560px] text-xs">
              <thead className="bg-surface-alt/60 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">ข้อมูลสินค้า</th>
                  <th className="px-2 py-2 text-right w-14">จำนวน</th>
                  <th className="px-2 py-2 text-right w-20">¥/ชิ้น</th>
                  <th className="px-2 py-2 text-right w-20">ค่าส่งจีน</th>
                  <th className="px-2 py-2 text-right w-24">รวม ¥</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => {
                  const refunded = it.crewallet === "1";
                  const shipping = Number(it.cshippingchn ?? 0);
                  const line = refunded ? 0 : it.camount * it.cprice + shipping;
                  return (
                    <tr key={it.id} className={`border-t border-border ${refunded ? "bg-red-50/40" : ""}`}>
                      <td className="px-2 py-2 align-top">
                        <div className="flex gap-2">
                          {it.coverUrl ? (
                            <a href={it.coverUrl} target="_blank" rel="noopener noreferrer" className="shrink-0">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={it.coverUrl} alt={it.ctitle ?? ""} className="h-10 w-10 rounded border border-border object-cover" />
                            </a>
                          ) : null}
                          <div className="min-w-0">
                            {it.curl ? (
                              <a
                                href={it.curl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block truncate max-w-[280px] text-primary-600 hover:underline"
                                title={it.ctitle ?? ""}
                              >
                                {it.ctitle || it.curl}
                              </a>
                            ) : (
                              <span className="block truncate max-w-[280px]" title={it.ctitle ?? ""}>
                                {it.ctitle || "—"}
                              </span>
                            )}
                            {(it.ccolor || it.csize) && (
                              <p className="text-[11px] text-muted">
                                {it.ccolor}{it.ccolor && it.csize ? " · " : ""}{it.csize}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right align-top font-mono tabular-nums">
                        {refunded ? 0 : it.camount}
                      </td>
                      <td className="px-2 py-2 text-right align-top font-mono tabular-nums">{fmtCny(it.cprice)}</td>
                      <td className="px-2 py-2 text-right align-top font-mono tabular-nums">{fmtCny(shipping)}</td>
                      <td className="px-2 py-2 text-right align-top font-mono tabular-nums font-semibold">
                        {fmtCny(line)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-border font-semibold bg-surface-alt/30 text-[11px]">
                  <td className="px-2 py-1.5" colSpan={colCount - 1}>
                    รวม {g.itemCount.toLocaleString()} รายการ · {g.totalQty.toLocaleString()} ชิ้น
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums">¥ {fmtCny(g.subtotalCny)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// InlinePriceUpdateCell — per-line ¥ add/subtract (cPriceUpdate) rendered
// INSIDE the per-shop items table cell (2026-06-05 ภูม flag — merge tracking
// + price-update inputs INTO the items table per legacy PCS layout).
// Legacy update3.php L85 (cPriceUpdate[]) + update4 inline update_cPriceUpdate
// (shops.php L1806). Saves via adminUpdateCartItemPriceUpdate → delta-adjusts
// the header hPriceUpdate. confirm-before-mutate (§0f · native dialog).
// ────────────────────────────────────────────────────────────
function InlinePriceUpdateCell({
  item,
  editable,
  onSaved,
}: {
  item: ShopFieldsItem;
  editable: boolean;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [val, setVal] = useState(String(item.cpriceupdate ?? 0));
  const [rowErr, setRowErr] = useState<string | null>(null);
  const refunded = item.crewallet === "1";

  function save() {
    setRowErr(null);
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0) { setRowErr("ตัวเลขไม่ถูกต้อง"); return; }
    if (Math.abs(n - Number(item.cpriceupdate ?? 0)) < 0.005) { setRowErr("ไม่เปลี่ยน"); return; }
    if (!confirm(`บันทึก ¥ เพิ่ม/ลด ของ "${item.ctitle || `#${item.id}`}" = ${n.toFixed(2)} ?`)) return;
    startTransition(async () => {
      const res = await adminUpdateCartItemPriceUpdate({ tb_order_id: item.id, c_price_update: n });
      if (res.ok) onSaved();
      else setRowErr(res.error);
    });
  }

  if (refunded) {
    return <div className="text-right text-[11px] text-red-500">คืนเงินแล้ว</div>;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center justify-end gap-1.5">
        <input
          type="number"
          min={0}
          step={0.01}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          disabled={!editable || pending}
          className="w-20 rounded border border-border px-2 py-1 text-right font-mono text-xs disabled:opacity-50 disabled:bg-surface-alt"
        />
        {editable && (
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="shrink-0 rounded border border-primary-300 text-primary-700 px-2 py-1 text-[11px] hover:bg-primary-50 disabled:opacity-50"
            title="บันทึก ¥ เพิ่ม/ลด รายการนี้"
          >
            บันทึก
          </button>
        )}
      </div>
      {rowErr && <span className="text-[11px] text-red-600">{rowErr}</span>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// ShippingNumberTypoFixer — toggles a "แก้คำผิด" inline form so an
// admin can correct a typo in the per-shop cshippingnumber AFTER
// status 4/5 was reached. Calls adminUpdateCartItemShippingNumber
// which is gated server-side to hstatus IN {3,4,5}.
// confirm-before-mutate (§0f · native dialog).
// Task #228 · E3.5 (legacy shops.php L1793-1805).
// ────────────────────────────────────────────────────────────
function ShippingNumberTypoFixer({
  hNo,
  cNameShop,
  currentShippingNumber,
  onSaved,
}: {
  hNo: string;
  cNameShop: string;
  currentShippingNumber: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(currentShippingNumber);
  const [pending, startTransition] = useTransition();
  const [rowErr, setRowErr] = useState<string | null>(null);

  function save() {
    setRowErr(null);
    const next = val.trim();
    if (next === (currentShippingNumber ?? "").trim()) {
      setRowErr("ไม่มีการเปลี่ยนแปลง");
      return;
    }
    if (!confirm(
      `แก้คำผิดเลขออเดอร์ร้านจีน "${cNameShop}"?\n\n` +
      `เดิม: ${currentShippingNumber || "(ว่าง)"}\n` +
      `ใหม่: ${next || "(ว่าง — จะล้างค่า)"}`,
    )) return;
    startTransition(async () => {
      const res = await adminUpdateCartItemShippingNumber({
        h_no: hNo, c_name_shop: cNameShop, c_shipping_number: next,
      });
      if (res.ok) {
        setOpen(false);
        onSaved();
      } else {
        setRowErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setVal(currentShippingNumber); setRowErr(null); }}
        className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
        title="แก้คำผิดเลขออเดอร์ร้านจีน (E3.5)"
      >
        <Pencil className="h-3 w-3" /> แก้คำผิด
      </button>
    );
  }
  return (
    <div className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        disabled={pending}
        placeholder="เลขออเดอร์ร้านจีนใหม่"
        className={inputCls}
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded border border-primary-300 bg-primary-500 text-white px-2.5 py-1 text-[11px] hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? "บันทึก..." : "บันทึกแก้คำผิด"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setRowErr(null); }}
          disabled={pending}
          className="rounded border border-border bg-white px-2.5 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
      {rowErr && <p className="text-[11px] text-red-600">{rowErr}</p>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// TrackingTypoFixer — opens an inline OLD→NEW swap form for a single
// tracking number inside the per-shop comma-separated ctrackingnumber
// bag. Calls adminUpdateCartItemCTracking which (a) bag-replaces the
// exact token across all matching tb_order rows, (b) cascades the
// rename into tb_forwarder.ftrackingchn, (c) notifies the customer.
// Server gate: hstatus IN {4,5}.
// Task #228 · E3.17 (legacy shops.php L776-815 + detail.php L260,288).
// ────────────────────────────────────────────────────────────
function TrackingTypoFixer({
  hNo,
  currentBag,
  onSaved,
}: {
  hNo: string;
  currentBag: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [oldTok, setOldTok] = useState("");
  const [newTok, setNewTok] = useState("");
  const [pending, startTransition] = useTransition();
  const [rowErr, setRowErr] = useState<string | null>(null);

  // Suggest the first token from the current bag so the admin doesn't
  // re-type a long string.
  const suggestions = currentBag
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  function save() {
    setRowErr(null);
    const o = oldTok.trim();
    const n = newTok.trim();
    if (!o) { setRowErr("ระบุเลข tracking เดิม"); return; }
    if (!n) { setRowErr("ระบุเลข tracking ใหม่"); return; }
    if (o === n) { setRowErr("เลข tracking ใหม่เหมือนเดิม"); return; }
    if (!confirm(
      `แก้คำผิดเลข tracking?\n\n` +
      `เดิม: ${o}\n` +
      `ใหม่: ${n}\n\n` +
      `จะอัพเดททุก tb_order ของออเดอร์นี้ + cascade ไป tb_forwarder + แจ้งลูกค้า`,
    )) return;
    startTransition(async () => {
      const res = await adminUpdateCartItemCTracking({
        h_no: hNo,
        c_tracking_number_old: o,
        c_tracking_number_new: n,
      });
      if (res.ok) {
        setOpen(false);
        setOldTok("");
        setNewTok("");
        onSaved();
      } else {
        setRowErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setOpen(true); setRowErr(null); }}
        className="inline-flex items-center gap-0.5 text-[11px] text-primary-600 hover:underline"
        title="แก้คำผิดเลข tracking (E3.17)"
      >
        <Pencil className="h-3 w-3" /> แก้คำผิด
      </button>
    );
  }
  return (
    <div className="space-y-1.5 rounded border border-amber-300 bg-amber-50 p-2">
      <label className="block space-y-0.5">
        <span className="text-[11px] font-semibold text-muted">เลข tracking เดิม (ที่ผิด)</span>
        <input
          type="text"
          list={`trk-sugg-${hNo}`}
          value={oldTok}
          onChange={(e) => setOldTok(e.target.value)}
          disabled={pending}
          placeholder={suggestions[0] || "เลข tracking เดิม"}
          className={inputCls}
        />
        {suggestions.length > 0 && (
          <datalist id={`trk-sugg-${hNo}`}>
            {suggestions.map((s) => (<option key={s} value={s} />))}
          </datalist>
        )}
      </label>
      <label className="block space-y-0.5">
        <span className="text-[11px] font-semibold text-muted">เลข tracking ใหม่ (ถูกต้อง)</span>
        <input
          type="text"
          value={newTok}
          onChange={(e) => setNewTok(e.target.value)}
          disabled={pending}
          placeholder="เลข tracking ใหม่"
          className={inputCls}
        />
      </label>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="rounded border border-primary-300 bg-primary-500 text-white px-2.5 py-1 text-[11px] hover:bg-primary-600 disabled:opacity-50"
        >
          {pending ? "บันทึก..." : "บันทึกแก้คำผิด + แจ้งลูกค้า"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setRowErr(null); }}
          disabled={pending}
          className="rounded border border-border bg-white px-2.5 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
      {rowErr && <p className="text-[11px] text-red-600">{rowErr}</p>}
    </div>
  );
}
