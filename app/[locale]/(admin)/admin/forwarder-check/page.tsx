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
import { totalCbmOf } from "@/lib/forwarder/quantities";
import { Link } from "@/i18n/navigation";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { TopMenuReport } from "@/components/admin/top-menu-report";
import { calcForwarderOutstanding } from "@/lib/forwarder/outstanding";
import { carrierLabel } from "@/lib/freight/shipping-methods";
import { resolveLegacyUrlMap } from "@/lib/storage/legacy-resolver";
import { buildDefaultLandingRedirect } from "@/lib/admin/default-queue-filter";
import { resolvePackingConfirmedCabs } from "@/lib/admin/packing-confirmed-cabs";
import { CsvButton, type CsvRow } from "@/components/admin/csv-button";
import { exportForwarderCheckAll } from "@/actions/admin/export/forwarder-check";
import {
  fetchCorporateNameMap,
  resolveBillingIdentity,
  corpRowFromName,
} from "@/lib/admin/customer-identity";
import {
  isRowEligibleForAddCheck,
  addCheckIneligibleMessage,
} from "@/lib/admin/report-cnt-add-check-gate";
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
  fproductstype2: string | null;
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
  /** legacy CPS badge — comparison-pricing enabled (tb_users.userComparison='1'). */
  userComparison: string | null;
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
  // by fid IN (queue.fids), then filter post-fetch.
  //
  // 2026-07-17 (owner · defence-in-depth) — the post-fetch filter now routes
  // through the SAME SOT the WRITE gate uses (`isRowEligibleForAddCheck` ·
  // lib/admin/report-cnt-add-check-gate.ts) instead of a hand-rolled
  // `fstatus<'5'`. Two things this fixes:
  //   (a) the old `<5` hid 5/6/7 but SHOWED 1/2/3 (rows queued before the
  //       2026-06-09 lower-bound gate existed) — now both ends are handled;
  //   (b) write-gate and read-filter can no longer drift apart.
  // The root fix is the write gate; this is the belt-and-braces so rows that
  // ALREADY slipped in (prod 2026-07-17: 159 of 168) can't be acted on — and
  // are surfaced with a REASON below rather than silently vanishing.
  const { data: forwarderData, error: forwarderErr } = await admin
    .from("tb_forwarder")
    .select(
      "id, fstatus, fidorco, ftrackingchn, fcabinetnumber, userid, " +
        "famount, famountcount, fvolume, fweight, ftransporttype, fproductstype, fproductstype2, frefrate, frefprice, " +
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
  const allQueued = (forwarderData ?? []) as unknown as ForwarderRawRow[];
  // เฉพาะ "รายการที่จะให้ลูกค้าชำระเงิน" (fstatus='4') — ตรงกับ gate ฝั่งเขียน
  // และตรงกับ adminCallPriceUser ที่อ่าน `.eq("fstatus","4")`.
  const forwarders = allQueued.filter((r) => isRowEligibleForAddCheck(r.fstatus));
  // แถวที่หลุดเข้าคิวมาก่อนหน้า (แจ้งชำระไม่ได้) — ซ่อนจากตาราง แต่ **บอกเหตุผล**
  // ไม่ปล่อยให้หายเงียบ (§0f "อย่ามั่ว"). จัดกลุ่มตามเหตุผลจริงของแต่ละสถานะ.
  const stuckByReason = new Map<string, number>();
  for (const r of allQueued) {
    const msg = addCheckIneligibleMessage(r.fstatus);
    if (msg) stuckByReason.set(msg, (stuckByReason.get(msg) ?? 0) + 1);
  }
  // orphan = แถวคิวที่ไม่มี tb_forwarder แล้ว (fID ชี้ไปที่ว่าง)
  const orphanCount = fids.length - allQueued.length;

  // ── Step 3: Join tb_users for customer + credit + company flags ─────────
  const uniqueUserIds = Array.from(new Set(forwarders.map((r) => r.userid).filter(Boolean)));
  const userRes = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userCompany, userCredit, userComparison")
    .in("userID", uniqueUserIds);
  const usersById = new Map<string, UserRawRow>(
    ((userRes.data ?? []) as unknown as UserRawRow[]).map((u) => [u.userID, u]),
  );

  // Juristic display-name resolve (2026-07-04) — นิติบุคคล rows must show the
  // registered company name, not the contact person. ONE batched .in() lookup.
  const corpNames = await fetchCorporateNameMap(admin, uniqueUserIds);

  // A8 (fidelity · legacy badgeVIP2 · forwarder-check.php L416) — customers who
  // have a per-customer custom rate get a marker next to their code. Owner killed
  // the VIP-tier model on 2026-07-10, so we label it "เรทเฉพาะตัว" (not "SVIP").
  // TWO batched .in() lookups (never N+1) union the kg + cbm custom-rate tables.
  const customRateUserIds = new Set<string>();
  if (uniqueUserIds.length > 0) {
    const [cbmRes, kgRes] = await Promise.all([
      admin.from("tb_rate_custom_cbm").select("userid").in("userid", uniqueUserIds),
      admin.from("tb_rate_custom_kg").select("userid").in("userid", uniqueUserIds),
    ]);
    // Fail-soft (a failed read just means no badge, never a false marker) — but LOG it
    // so a real custom-rate-table outage is observable (§0c: no silent error swallow).
    if (cbmRes.error) console.error("[forwarder-check · tb_rate_custom_cbm] read failed", cbmRes.error.message);
    if (kgRes.error) console.error("[forwarder-check · tb_rate_custom_kg] read failed", kgRes.error.message);
    for (const r of (cbmRes.data ?? []) as { userid: string }[]) if (r.userid) customRateUserIds.add(r.userid);
    for (const r of (kgRes.data ?? []) as { userid: string }[]) if (r.userid) customRateUserIds.add(r.userid);
  }

  // ── Step 4: Tab counts ──────────────────────────────────────────────────
  // ทุกตัวนับจาก `forwarders` (= แถวที่แจ้งชำระได้จริง) ไม่ใช่คิวดิบ — ทั้ง 3 แท็บ
  // จึงบวกกันได้ = ทั้งหมด (เครดิต + ปกติ) และตรงกับที่ตารางแสดง.
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
  // 2026-07-17 (§0f "badge ต้องเป๊ะ") — "ทั้งหมด" = จำนวนแถวที่ **แจ้งชำระได้จริง**
  // (= ที่ตารางแสดง = ที่ adminCallPriceUser ทำงานด้วยได้) ไม่ใช่ queue.length ดิบ.
  // เดิมนับทุกแถวในคิว → prod โชว์ 168 ทั้งที่ทำงานได้จริง 8 = badge โกหก และเป็น
  // เหตุผลที่ owner เห็นว่าคิว "รับแถวที่ส่งแล้ว" เข้ามา. แถวค้างรายงานแยกใน
  // แถบเตือนด้านล่าง (พร้อมเหตุผล) — ไม่กลบหาย.
  const allCount = forwarders.length;
  const stuckCount = (allQueued.length - forwarders.length) + orphanCount;

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

  // ── Step 6: Promotion link — REMOVED (§0e dead-read · 2026-07-21) ───────
  // Legacy did `LEFT JOIN tb_promotion` + `tagPro($promoID)` for a promo-campaign
  // badge, but on Pacred prod `tb_promotion` = 0 rows (the tagPro campaigns are
  // historical PCS 2023-24 promos; Pacred is a new company). Reading an always-
  // empty table + shaping a badge that can never render = a dead-read. Dropped
  // rather
  // than ported. If Pacred ever runs its own promos, re-add a batched lookup here
  // + a Pacred promo map (do NOT resurrect the 44 legacy tagPro campaign names).

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
      volume_cbm: totalCbmOf(r), // row-TOTAL CBM (famountcount rule)
      weight_kg: Number(r.fweight ?? 0),
      products_type: r.fproductstype ?? "",
      products_type2: r.fproductstype2 ?? "", // A6 · ประเภทสินค้ารอง (cost cell · gated)
      transport_type: r.ftransporttype,
      ref_rate: Number(r.frefrate ?? 0),
      ref_price: r.frefprice ?? "0",
      total_price: Number(r.ftotalprice ?? 0),
      price_update: Number(r.fpriceupdate ?? 0),
      price_crate: Number(r.pricecrate ?? 0),
      transport_price_chn_thb: Number(r.ftransportpricechnthb ?? 0),
      price_other: Number(r.priceother ?? 0),
      ship_by: r.fshipby ?? "",
      ship_by_label: carrierLabel(r.fshipby),   // full SOT (13→ธนามัย · PRF→เหมาๆ) not raw code — ภูม 2026-07-21
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
      ship_service_fee: Number(r.fshippingservice ?? 0),
      check_added_by: queueRow?.adminID ?? null,
      check_added_at: queueRow?.date ?? null,
      note: r.fnote,
      detail: r.fdetail, // A1 · รายละเอียดสินค้า (legacy short-text max-w cell)
      has_custom_rate: customRateUserIds.has(r.userid), // A8 · เรทเฉพาะตัว marker
      // legacy badgeVIP2 CPS marker — comparison-pricing enabled (still live in resolve-rate).
      has_comparison: (user?.userComparison ?? "") === "1",
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

  // G1 combo-flow (2026-07-08) — which of these rows' containers have a MOMO packing-list
  // reconcile stamp (mig 0245). Drives the "📦 packing" badge next to ตู้. One scoped lookup.
  const packingByCab: Record<string, boolean> = {};
  {
    const cabs = Array.from(
      new Set(rows.map((r) => (r.cabinet_number ?? "").trim()).filter((c) => c !== "" && c !== "0")),
    );
    if (cabs.length > 0) {
      // 🔴 owner 2026-07-16 — same class as report-cnt: this read ONLY the reconcile
      // table (mig 0245) and missed momo_packing_upload (mig 0254), so a container the
      // staff DID upload still badged "ยังไม่อัพ" and blocked collection. One SOT now
      // (reconcile OR upload) — shared with the billing gate + the container list.
      const confirmed = await resolvePackingConfirmedCabs(admin, cabs);
      for (const cab of confirmed) packingByCab[cab] = true;
    }
  }

  // ── สถานะตู้ = จ่ายค่าตู้ให้ MOMO/TTW แล้วหรือยัง (PCS "สถานะตู้" column ·
  // owner 2026-07-21 "หัวข้อที่เรายังไม่มีก็ต้องเอามาใส่") ────────────────────
  // MOMO bills us PER TRACKING in rounds, but we DISBURSE per ตู้ once (tb_cnt /
  // tb_cnt_item · the /admin/cnt-hs register · partial-UNIQUE on fCabinetNumber
  // prevents paying the same ตู้ twice). At the collect step staff must be able to
  // see whether the container's cost已 left our account — a ตู้ we haven't paid yet
  // is where a cost surprise still hides. READ-ONLY: one scoped .in() lookup, no
  // money write, no gate — the badge is informational (it never blocks แจ้งชำระ).
  const cntPaidByCab: Record<string, boolean> = {};
  {
    const cabs = Array.from(
      new Set(rows.map((r) => (r.cabinet_number ?? "").trim()).filter((c) => c !== "" && c !== "0")),
    );
    if (cabs.length > 0) {
      const { data, error } = await admin
        .from("tb_cnt_item")
        // prod stores this as the quoted mixed-case column `"fCabinetNumber"`;
        // PostgREST takes it UNQUOTED here (same shape as the proven read in
        // actions/admin/cnt-payment.ts — do not "fix" it to a quoted literal).
        .select("fCabinetNumber")
        .in("fCabinetNumber", cabs);
      if (error) {
        // §0c — never swallow: a failed lookup must be visible in the log, but it
        // must not break the collect queue (the badge simply renders "ยังไม่จ่าย").
        console.error(`[forwarder-check: tb_cnt_item cabinet lookup]`, {
          code: error.code, message: error.message, cabs: cabs.length,
        });
      } else {
        for (const r of (data ?? []) as { fCabinetNumber: string | null }[]) {
          const cab = (r.fCabinetNumber ?? "").trim();
          if (cab) cntPaidByCab[cab] = true;
        }
      }
    }
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

        {/* แถวค้างในคิว (owner 2026-07-17) — แถวที่หลุดเข้าคิวมาก่อนจะมี gate ขอบบน
            และ "แจ้งชำระไม่ได้" (adminCallPriceUser อ่านเฉพาะ fstatus='4'). ซ่อนจาก
            ตารางแล้ว แต่ต้อง **บอกเหตุผล** ไม่ใช่หายเงียบ (§0f). ล้างออกจากคิวได้ด้วย
            scripts/forwarder-check-queue-backfill-2026-07-17.mjs (dry-run → --apply · owner เคาะ). */}
        {stuckCount > 0 && (
          <div className="rounded-md border border-slate-300 bg-slate-50 p-2.5 text-xs text-slate-700 flex items-start gap-2">
            <span aria-hidden>🧹</span>
            <div className="flex-1 space-y-1">
              <div>
                <span className="font-semibold">ซ่อน {stuckCount} รายการที่แจ้งชำระไม่ได้</span>{" "}
                — คิวนี้รับเฉพาะ &quot;รายการที่จะให้ลูกค้าชำระเงิน&quot; (สถานะ &quot;ถึงไทยแล้ว&quot;) เท่านั้น
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-600">
                {[...stuckByReason.entries()].map(([reason, n]) => (
                  <li key={reason}>{reason} — <span className="font-medium">{n} รายการ</span></li>
                ))}
                {orphanCount > 0 && (
                  <li>ไม่พบรายการนำเข้าแล้ว (อาจถูกลบ) — <span className="font-medium">{orphanCount} รายการ</span></li>
                )}
              </ul>
              <div className="text-[11px] text-slate-500">
                รายการเหล่านี้ไม่กระทบยอดเงิน (เก็บเงินไปแล้ว หรือยังเก็บไม่ได้) · รอ backfill ล้างคิว
              </div>
            </div>
          </div>
        )}

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

        <ForwarderCheckTable rows={rows} showMoneyColumns={showMoneyColumns} packingByCab={packingByCab} cntPaidByCab={cntPaidByCab} />
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
