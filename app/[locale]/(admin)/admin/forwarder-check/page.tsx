/**
 * /admin/forwarder-check — เรียกเก็บเงินลูกค้ารายการนำเข้า (Wave 16 P0-2)
 *
 * Bulk-bill-customer queue — the revenue-pipeline page where forwarder
 * items that admin already audited (status=4 = ตรวจสอบแล้ว) get billed
 * to the customer. Clicking "แจ้งชำระเงินลูกค้า" on N selected rows:
 *   1. Flips tb_forwarder.fstatus from '4' → '5' (รอชำระเงิน)
 *   2. Fires SMS (real · via ThaiBulkSMS) to each customer's usertel
 *   3. Logs intent for LINE OA push + email (DEFERRED — see action TODO)
 *   4. Removes the rows from tb_check_forwarder (queue consumed)
 *
 * Legacy source: `pcs-admin/forwarder-check.php` (728 LOC). See the
 * companion action at `actions/admin/forwarder-check.ts` and the
 * interactive table at `./forwarder-check-table.tsx`.
 *
 * Tabs (legacy forwarder-check.php L237-262 · ?q= URL key preserved):
 *   ?q=    (empty)  → ทั้งหมด          — every row currently in the queue
 *   ?q=c             → จ่ายแบบเครดิต  — only users with usercredit='1'
 *   ?q=n             → จ่ายแบบปกติ    — users with usercredit<>'1'
 *
 * Tab counts: each computed via a 3rd HEAD count query that mirrors the
 * full filter. Counts stay stable across keyword filters (Wave 11 pattern
 * from /admin/forwarders).
 *
 * Auth gate — money columns visibility:
 *   - Page-level requireAdmin: super · ops · accounting (the operators
 *     who can actually bill — service-role admin client is used for the
 *     queries because tb_* is RLS-locked).
 *   - Money columns (ต้นทุน · กำไร · 1%) gated server-side by the same
 *     role set + showMoneyColumns prop on the client table component.
 *
 * Design philosophy (workflow from legacy · UI is ours · see
 * `docs/learnings/pacred-design-philosophy.md`):
 *   - Every legacy data field surfaced (28-col legacy → 11-col Pacred
 *     groupings) — no truncation of operational signal
 *   - Tailwind cards · Lucide icons · brand chips · responsive tables
 *   - Confirm modal before billing (legacy was a SweetAlert popup)
 *   - "Wave 16 status" banner explicitly lists which channels are wired
 *     vs deferred — operators see the gap, no surprise
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportForwarderCheckAll } from "@/actions/admin/export/forwarder-check";
import {
  fetchCorporateNameMap,
  resolveBillingIdentity,
  corpRowFromName,
} from "@/lib/admin/customer-identity";
import {
  ForwarderCheckTable,
  type ForwarderCheckRow,
} from "./forwarder-check-table";

export const dynamic = "force-dynamic";

// ────────────────────────────────────────────────────────────
// Search params (URL-stable with legacy forwarder-check.php?q=)
// ────────────────────────────────────────────────────────────

type SearchParams = {
  q?: string;       // '' = all · 'c' = credit-only · 'n' = normal-only
};

// ────────────────────────────────────────────────────────────
// Raw row types — matches the columns we SELECT below
// ────────────────────────────────────────────────────────────

type CheckQueueRow = {
  fID: number;
  date: string | null;
  adminID: string | null;
};

type ForwarderRawRow = {
  id: number;
  fstatus: string;
  fidorco: string | null;
  ftrackingchn: string | null;
  fcabinetnumber: string | null;
  userid: string;
  famount: number | null;
  famountcount: string | null;
  fvolume: number | null;
  fweight: number | null;
  ftransporttype: string;
  fproductstype: string | null;
  frefrate: number | null;
  frefprice: string;
  fdetail: string | null;
  fnote: string | null;
  fcover: string | null;
  ftotalprice: number | string | null;
  ftransportprice: number | string | null;
  fpriceupdate: number | string | null;
  fshippingservice: number | string | null;
  pricecrate: number | string | null;
  ftransportpricechnthb: number | string | null;
  priceother: number | string | null;
  fdiscount: number | string | null;
  fusercompany: number | string | null;
  fcosttotalprice: number | string | null;
  fcosttotalpricesheet: number | string | null;
  fshipby: string | null;
  paymethod: string | null;
  faddressdistrict: string | null;
  faddressprovince: string | null;
  faddresszipcode: string | null;
};

type UserRawRow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userCompany: string | null;
  userCredit: string | null;
};

type PromoRawRow = {
  fid: number;
  id: number;
};

type ImportRawRow = {
  fid: number;
  fi2amount: number | null;
};

// ────────────────────────────────────────────────────────────
// Page component
// ────────────────────────────────────────────────────────────

export default async function AdminForwarderCheckPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  // Legacy gate (forwarder-check.php — implicit via header.php auth check
  // + the buttons only fire when adminID is set). V3 role union closest
  // to "operations + accounting" = super · ops · accounting.
  // 2026-06-08 (ภูม warehouse-handoff round 2): added "warehouse" — the
  // per-container completeness queue + Lane B5 alert (Wave 0 owner
  // directive) BOTH route to this page. Warehouse staff hit the page
  // when a cabinet finishes and they need to flip forwarders fstatus.
  const { roles } = await requireAdmin(["super", "ops", "accounting", "warehouse"]);

  const sp = await searchParams;

  // G6 — default queue filter per role. Page is already implicitly
  // scoped to fStatus=4 (the bill-prep queue), so no per-role default
  // applies — the call is here for matrix-uniformity. Future per-role
  // tweaks (e.g. accounting → ?q=n vs qa → ?q=c) wire through here.
  const defaultRedirect = buildDefaultLandingRedirect(
    "/admin/forwarder-check",
    roles,
    sp as Record<string, unknown>,
  );
  if (defaultRedirect) redirect(defaultRedirect);

  const tab: "all" | "c" | "n" = sp.q === "c" ? "c" : sp.q === "n" ? "n" : "all";
  // Money-internal: ต้นทุน · กำไร · 1% columns are visible only to ultra/
  // accounting/pricing (owner 2026-06-18 — super + ops lose cost/profit
  // visibility). The flag drives the DATA-layer omission of cost/profit
  // fields from BOTH the CSV rows+cols and the table rows below.
  const showMoneyColumns = canViewCostProfit(roles);

  const admin = createAdminClient();

  // ── Step 1: Load the queue (tb_check_forwarder) ─────────────────────────
  // Default ordering: most recently added first (matches legacy
  // DataTables `order: [[1, 'desc']]` which sorts on the date column).
  const { data: queueData, error: queueErr } = await admin
    .from("tb_check_forwarder")
    .select("fID, date, adminID")
    .order("date", { ascending: false, nullsFirst: false })
    .limit(500);
  if (queueErr) {
    console.error("[/admin/forwarder-check] tb_check_forwarder queue read failed", {
      code: queueErr.code, message: queueErr.message,
    });
  }
  const queue = (queueData ?? []) as unknown as CheckQueueRow[];
  const queueByFid = new Map<number, CheckQueueRow>(
    queue.map((q) => [q.fID, q]),
  );
  const fids = queue.map((q) => q.fID);

  // Empty queue → render placeholder + skip the rest of the joins.
  // Otherwise we'd burn an extra 4 queries on an empty input.
  if (fids.length === 0) {
    return (
      <>
        <TopMenuReport activeHref="/admin/forwarder-check" />
        <main className="p-6 lg:p-8 space-y-5">
          <PageHeader counts={{ all: 0, credit: 0, normal: 0 }} activeTab={tab} />
          <ForwarderCheckTable rows={[]} showMoneyColumns={showMoneyColumns} />
        </main>
      </>
    );
  }

  // ── Step 2: Load the forwarder rows (legacy WHERE fstatus<5) ────────────
  // Legacy SQL (forwarder-check.php L336-345):
  //   SELECT ... FROM tb_check_forwarder cf
  //   LEFT JOIN tb_forwarder f ON cf.fID=f.ID AND fStatus<5
  //   LEFT JOIN tb_users u ON u.userID=f.userID
  //   WHERE 1
  //   [+ AND u.userCredit=1 / <>1 if ?q=c/n]
  //   GROUP BY f.ID
  //
  // PostgREST can't replicate that JOIN literally — we load tb_forwarder
  // by fid IN (queue.fids), then filter post-fetch by `fstatus<'5'`
  // (defensive — legacy did this to skip rows already billed but still
  // in the queue due to a race). The Wave 16 action cleans up such rows
  // before they show up, but legacy left them, so we honor that filter.
  const { data: forwarderData, error: forwarderErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fstatus, fidorco, ftrackingchn, fcabinetnumber, userid, " +
        "famount, famountcount, fvolume, fweight, ftransporttype, fproductstype, frefrate, frefprice, " +
        "fdetail, fnote, fcover, " +
        "ftotalprice, ftransportprice, fpriceupdate, fshippingservice, " +
        "pricecrate, ftransportpricechnthb, priceother, fdiscount, " +
        "fusercompany, fcosttotalprice, fcosttotalpricesheet, " +
        "fshipby, paymethod, faddressdistrict, faddressprovince, faddresszipcode",
    )
    .in("id", fids);
  if (forwarderErr) {
    console.error("[/admin/forwarder-check] tb_forwarder read failed", {
      code: forwarderErr.code, message: forwarderErr.message,
    });
  }
  const forwarders = ((forwarderData ?? []) as unknown as ForwarderRawRow[])
    // Legacy `fStatus<5` filter — a row that's already billed but still
    // lingering in the queue shouldn't show up (race-defensive).
    .filter((r) => parseInt(r.fstatus, 10) < 5);

  // ── Step 3: Join tb_users for customer + credit + company flags ─────────
  const uniqueUserIds = Array.from(new Set(forwarders.map((r) => r.userid).filter(Boolean)));
  const userRes = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userCompany, userCredit")
    .in("userID", uniqueUserIds);
  const usersById = new Map<string, UserRawRow>(
    ((userRes.data ?? []) as unknown as UserRawRow[]).map((u) => [u.userID, u]),
  );

  // Juristic display-name resolve (2026-07-04) — นิติบุคคล rows must show the
  // registered company name, not the contact person. ONE batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, uniqueUserIds);

  // ── Step 4: Tab counts ──────────────────────────────────────────────────
  // ทั้งหมด = `queue.length` (already loaded).
  // เครดิต = count of distinct queue.fid where corresponding user has
  //           usercredit='1'. Cheaper to compute from the loaded data
  //           than to fire a 4th JOIN-y count query.
  let creditCount = 0;
  let normalCount = 0;
  for (const f of forwarders) {
    const u = usersById.get(f.userid);
    if (u?.userCredit === "1") creditCount++;
    else normalCount++;
  }
  // Queue rows whose forwarder row didn't survive the fstatus<5 filter
  // get counted under "all" (legacy did same: countAll counts ALL queue
  // entries regardless of join status).
  const allCount = queue.length;

  // ── Step 5: Optional partial-import amount (legacy LEFT JOIN tb_forwarder_import2) ─
  // The `fi2amount` column shows "received so far / expected" — admin
  // uses it to spot partial deliveries. If table missing, default to 0.
  let importByFid = new Map<number, number>();
  try {
    const importRes = await admin
      .from("tb_forwarder_import2")
      .select("fid, fi2amount")
      .in("fid", fids);
    importByFid = new Map(
      ((importRes.data ?? []) as unknown as ImportRawRow[]).map((r) => [r.fid, Number(r.fi2amount ?? 0)]),
    );
  } catch {
    // Table may not exist on all envs; silently fall back.
  }

  // ── Step 6: Promotion link (legacy LEFT JOIN tb_promotion) ──────────────
  let promoByFid = new Map<number, number>();
  try {
    const promoRes = await admin
      .from("tb_promotion")
      .select("fid, id")
      .in("fid", fids);
    promoByFid = new Map(
      ((promoRes.data ?? []) as unknown as PromoRawRow[]).map((r) => [r.fid, r.id]),
    );
  } catch {
    // tb_promotion may not be wired — promotion badges are optional.
  }

  // ── Step 7: Resolve cover thumbnails ────────────────────────────────────
  const coverMap = await resolveLegacyUrlMap(
    forwarders.map((r) => ({ id: r.id, filename: r.fcover })),
    "cover",
  );

  // ── Step 8: Shape rows for the client + apply ?q= tab filter ────────────
  let rows: ForwarderCheckRow[] = forwarders.map((r) => {
    const user = usersById.get(r.userid);
    const queueRow = queueByFid.get(r.id);
    const customerName = user
      ? resolveBillingIdentity({
          userCompany: user.userCompany,
          userName: user.userName,
          userLastName: user.userLastName,
          corp: corpRowFromName(corpNames.get(r.userid)),
        }).name
      : "";
    const customerCompany = user?.userCompany === "1" ? 1 : 0;
    const fiAmount = importByFid.get(r.id) ?? 0;
    const promoId = promoByFid.get(r.id) ?? null;
    const outstanding = calcForwarderOutstanding(r);
    // 1% juristic allowance (legacy fUserCompany1Per, applied only when
    // priceGetUserItem >= 1000 AND usercompany='1' — see forwarder-check.php L400)
    const priceFull =
      Number(r.ftotalprice ?? 0) +
      Number(r.ftransportprice ?? 0) +
      Number(r.fpriceupdate ?? 0) +
      Number(r.fshippingservice ?? 0) +
      Number(r.pricecrate ?? 0) +
      Number(r.ftransportpricechnthb ?? 0) +
      Number(r.priceother ?? 0) -
      Number(r.fdiscount ?? 0);
    const onePercent =
      customerCompany === 1 && priceFull >= 1000 ? Math.round(priceFull * 0.01 * 100) / 100 : 0;
    // Profit (legacy profitItem formula at forwarder-check.php L405)
    const profit =
      priceFull -
      onePercent -
      (Number(r.fcosttotalprice ?? 0) +
        Number(r.fshippingservice ?? 0) +
        Number(r.pricecrate ?? 0) +
        Number(r.ftransportpricechnthb ?? 0) +
        Number(r.ftransportprice ?? 0));

    return {
      id: r.id,
      fno_cargo: r.fidorco,
      tracking_chn: r.ftrackingchn,
      cabinet_number: r.fcabinetnumber,
      userid: r.userid,
      customer_name: customerName,
      customer_company: customerCompany,
      user_credit: user?.userCredit ?? "0",
      amount: Number(r.famount ?? 0),
      amount_fi: fiAmount,
      amount_count: r.famountcount,
      volume_cbm: Number(r.fvolume ?? 0),
      weight_kg: Number(r.fweight ?? 0),
      products_type: r.fproductstype ?? "",
      transport_type: r.ftransporttype,
      ref_rate: Number(r.frefrate ?? 0),
      ref_price: r.frefprice ?? "0",
      total_price: Number(r.ftotalprice ?? 0),
      price_update: Number(r.fpriceupdate ?? 0),
      price_crate: Number(r.pricecrate ?? 0),
      transport_price_chn_thb: Number(r.ftransportpricechnthb ?? 0),
      price_other: Number(r.priceother ?? 0),
      ship_by: r.fshipby ?? "",
      pay_method: r.paymethod,
      address_district: r.faddressdistrict,
      address_province: r.faddressprovince,
      address_zipcode: r.faddresszipcode,
      transport_price: Number(r.ftransportprice ?? 0),
      discount: Number(r.fdiscount ?? 0),
      outstanding_thb: outstanding,
      one_percent: onePercent,
      cost_total_price: Number(r.fcosttotalprice ?? 0),
      cost_total_price_sheet: Number(r.fcosttotalpricesheet ?? 0),
      profit_item: Math.round(profit * 100) / 100,
      status: r.fstatus,
      promo_id: promoId,
      ship_service_fee: Number(r.fshippingservice ?? 0),
      check_added_by: queueRow?.adminID ?? null,
      check_added_at: queueRow?.date ?? null,
      note: r.fnote,
      cover_url: coverMap[String(r.id)] ?? null,
      detail_href: `/admin/forwarders/${r.id}`,
    };
  });

  // Apply ?q= tab filter (legacy WHERE u.userCredit=1 / <>1)
  if (tab === "c") {
    rows = rows.filter((r) => r.user_credit === "1");
  } else if (tab === "n") {
    rows = rows.filter((r) => r.user_credit !== "1");
  }

  // DATA-LAYER money hide: ForwarderCheckTable is a Client Component, so the
  // cost/profit fields are serialized into the browser payload even though the
  // cells are only rendered inside {showMoneyColumns && …}. When the viewer
  // can't see money internals, zero the cost/profit fields BEFORE serializing
  // so the real ต้นทุน/กำไร value never reaches the client (owner 2026-06-18).
  // (one_percent is a customer-side % of the selling price and renders
  // unconditionally — left intact.)
  if (!showMoneyColumns) {
    rows = rows.map((r) => ({
      ...r,
      cost_total_price: 0,
      cost_total_price_sheet: 0,
      profit_item: 0,
    }));
  }

  return (
    <>
      {/* 11-button warehouse/container audit menu — shared with /admin/report-cnt
          + /admin/cnt-hs. We don't pass activeHref because forwarder-check
          isn't in that menu's ITEMS list (it's a sibling, accessed via the
          report-cnt drill-down). */}
      <TopMenuReport />

      <main className="p-6 lg:p-8 space-y-5">
        <PageHeader counts={{ all: allCount, credit: creditCount, normal: normalCount }} activeTab={tab} />

        {/* Wave 16 status banner — proactive transparency about which
            notification channels actually fire. Per the 2026-05-23
            design-philosophy learning: tell the operator IN THE UI what's
            live vs deferred so they don't discover gaps by clicking. */}
        <div className="rounded-md border border-amber-200 bg-amber-50/60 p-2.5 text-xs text-amber-800 flex items-start gap-2">
          <span aria-hidden>ℹ️</span>
          <div className="flex-1">
            <span className="font-medium">Wave 16 P0-2 status:</span>{" "}
            ✅ bulk-bill flow · status 4→5 · ลบออกจากคิว · SMS (ThaiBulkSMS) ·
            audit log ใน tb_log_forwarder_status ·{" "}
            <span className="opacity-75">
              ⏳ LINE OA push + email: รอ resolver userid→profile_id (กำลังพัฒนา)
            </span>
          </div>
        </div>

        {/* CSV export — honours the active tab filter (all / credit / normal).
            Accounting uses this to hand a spreadsheet to the finance team
            before firing the bulk-bill SMS run. Money columns gated by role. */}
        <div className="flex justify-end">
          <CsvButton
            rows={rows.map((r) => {
              const row: CsvRow = {
                id: r.id,
                fno_cargo: r.fno_cargo ?? "",
                tracking_chn: r.tracking_chn ?? "",
                cabinet_number: r.cabinet_number ?? "",
                userid: r.userid,
                customer_name: r.customer_name,
                customer_type: r.customer_company === 1 ? "นิติบุคคล" : "บุคคล",
                credit_type: r.user_credit === "1" ? "เครดิต" : "ปกติ",
                amount: r.amount,
                weight_kg: r.weight_kg.toFixed(2),
                volume_cbm: r.volume_cbm.toFixed(4),
                transport: r.transport_type === "1" ? "รถ" : r.transport_type === "2" ? "เรือ" : r.transport_type === "3" ? "แอร์" : r.transport_type,
                outstanding_thb: r.outstanding_thb.toFixed(2),
                ship_by: r.ship_by,
                pay_method: r.pay_method ?? "",
                address: [r.address_district, r.address_province, r.address_zipcode].filter(Boolean).join(" "),
                check_added_at: r.check_added_at ?? "",
                check_added_by: r.check_added_by ?? "",
                ...(showMoneyColumns ? {
                  cost_total_price: r.cost_total_price.toFixed(2),
                  one_percent: r.one_percent.toFixed(2),
                  profit_item: r.profit_item.toFixed(2),
                } : {}),
              };
              return row;
            })}
            fetchAll={async () => {
              "use server";
              // Export the ENTIRE filtered queue (all rows · not just the 500-row
              // page window) — audited via admin_export_log (PII: names + address ·
              // MONEY: cost/profit gated by showMoneyColumns · owner directive).
              return exportForwarderCheckAll(tab, showMoneyColumns);
            }}
            cols={[
              { key: "id",              label: "Forwarder ID" },
              { key: "fno_cargo",       label: "เลขที่ Cargo" },
              { key: "tracking_chn",    label: "Tracking จีน" },
              { key: "cabinet_number",  label: "หมายเลขตู้" },
              { key: "userid",          label: "รหัสลูกค้า" },
              { key: "customer_name",   label: "ชื่อลูกค้า" },
              { key: "customer_type",   label: "ประเภทลูกค้า" },
              { key: "credit_type",     label: "เครดิต / ปกติ" },
              { key: "amount",          label: "จำนวน" },
              { key: "weight_kg",       label: "น้ำหนัก (KG)" },
              { key: "volume_cbm",      label: "ปริมาตร (CBM)" },
              { key: "transport",       label: "ขนส่ง" },
              { key: "outstanding_thb", label: "ยอดเรียกเก็บ (฿)" },
              { key: "ship_by",         label: "วิธีรับ" },
              { key: "pay_method",      label: "วิธีจ่าย" },
              { key: "address",         label: "ที่อยู่จัดส่ง" },
              { key: "check_added_at",  label: "เข้าคิวเมื่อ" },
              { key: "check_added_by",  label: "เข้าคิวโดย" },
              ...(showMoneyColumns ? [
                { key: "cost_total_price", label: "ต้นทุน (฿)" },
                { key: "one_percent",      label: "หัก 1% นิติฯ (฿)" },
                { key: "profit_item",      label: "กำไร (฿)" },
              ] : []),
            ]}
            filename={`forwarder-check-${tab}-${new Date().toISOString().slice(0, 10)}.csv`}
          />
        </div>

        <ForwarderCheckTable rows={rows} showMoneyColumns={showMoneyColumns} />
      </main>
    </>
  );
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function PageHeader({
  counts,
  activeTab,
}: {
  counts: { all: number; credit: number; normal: number };
  activeTab: "all" | "c" | "n";
}) {
  const TABS: Array<{ key: "all" | "c" | "n"; label: string; href: string; count: number }> = [
    { key: "all",    label: "ทั้งหมด",        href: "/admin/forwarder-check",       count: counts.all },
    { key: "c",      label: "จ่ายแบบเครดิต", href: "/admin/forwarder-check?q=c",  count: counts.credit },
    { key: "n",      label: "จ่ายแบบปกติ",   href: "/admin/forwarder-check?q=n",  count: counts.normal },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · CARGO</p>
          <h1 className="mt-1 text-2xl font-bold flex items-center gap-2">
            <span aria-hidden>💰</span>
            เรียกเก็บเงินลูกค้า — รายการนำเข้า
          </h1>
          <p className="text-sm text-muted mt-0.5">
            รายการสินค้าที่ตรวจสอบแล้ว · พร้อมแจ้งชำระเงินกับลูกค้า
          </p>
        </div>
      </div>

      {/* 3-tab strip — ทั้งหมด · เครดิต · ปกติ (legacy forwarder-check.php L237-262) */}
      <div className="flex flex-wrap gap-0 border-b border-border -mx-1">
        {TABS.map((t) => {
          const active = t.key === activeTab;
          return (
            <Link
              key={t.key}
              href={t.href}
              className={`mx-1 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary-600 text-primary-700 bg-primary-50/50"
                  : "border-transparent text-muted hover:text-foreground hover:bg-surface-alt"
              }`}
            >
              {t.label}
              {t.count > 0 && (
                <span
                  className={`ml-1.5 inline-flex items-center justify-center rounded-full text-[11px] font-bold px-1.5 py-0.5 ${
                    active ? "bg-primary-600 text-white" : "bg-red-500 text-white"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
