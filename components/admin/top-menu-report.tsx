/**
 * <TopMenuReport>
 *
 * 11-button warehouse/container audit menu — faithful port of legacy
 * `member/pcs-admin/include/pages/oop/top-menu-report.php`. Reads from
 * `tb_forwarder` (the legacy schema ported via migration 0081), counts
 * each audit queue's hit count, and renders the badge ring used in
 * legacy PCS Cargo's "รายงานตู้ / หมายเหตุ / ไม่ใส่X" cluster.
 *
 * Shown on top of every page in the rebuilt warehouse/container family
 * (`/admin/report-cnt`, `/admin/forwarder-action?action=…`,
 * `/admin/forwarder-import-warehouse`, `/admin/cnt-hs`). Replaces the
 * rejected "spine" page `/admin/warehouse/containers` per ภูม brief
 * 2026-05-20 ค่ำ — Option C "replace spine wholesale with faithful port"
 * (see `docs/runbook/faithful-port-plan.md`).
 *
 * Server component — counts are computed once per request server-side.
 *
 * Legacy SQL conditions (verbatim from `forwarder-action.php` L162-188 +
 * `report-cnt.php` L232-242):
 *   - Note               → fNote<>''
 *   - notPhoto           → fCover='' AND DATE(fDate)>'2022-01-15' AND fStatus>1
 *   - notPortage         → fTransportPrice=0 OR fShipBy='PCSE', …
 *   - notContainer       → fCabinetNumber='' AND DATE(fDate)>'2022-01-15'
 *   - NotDateContainerClose → fDateContainerClose IS NULL
 *   - NotShipFreeError   → fAddressZIPCode NOT IN (…) AND fShipBy='PCSF'
 *   - NotShipFree        → fAddressZIPCode IN (…) AND fShipBy<>'PCSF'
 *   - fCreditError       → fCredit='1' AND fCreditDate<NOW()
 *   - Waiting (รายงานตู้) → fCabinetNumber<>'' AND fStatus<4
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { FREE_SHIPPING_ZIPS, FREE_SHIPPING_ZIPS_IN_CLAUSE } from "@/lib/forwarder/free-shipping-zips";
import { REPORT_CNT_ADD_CHECK_MIN_FSTATUS } from "@/lib/admin/report-cnt-add-check-gate";

type CountKey =
  | "waiting"
  | "checkQueue"
  | "history"
  | "noteShop"
  | "note"
  | "notPhoto"
  | "notPortage"
  | "notContainer"
  | "notDateContainerClose"
  | "notShipFree"
  | "notShipFreeError"
  | "fCreditError";

type Counts = Record<CountKey, number>;

async function loadCounts(): Promise<Counts> {
  const admin = createAdminClient();
  const cutoff = "2022-01-15"; // legacy DATE(fDate)>'2022-01-15' floor

  // Helper: head-only count query via tb_forwarder
  const c = (build: (q: ReturnType<typeof from>) => ReturnType<typeof from>) =>
    build(from()).then((r) => r.count ?? 0);
  const from = () =>
    admin.from("tb_forwarder").select("id", { count: "exact", head: true });

  // Wave 16 P0-2 — separate counter for the tb_check_forwarder queue
  // (the bulk-bill page reads this table directly, not tb_forwarder).
  //
  // 2026-07-17 (owner · §0f "badge ต้องเป๊ะ") — was a raw COUNT of the whole
  // queue, which on prod read 168 while only 8 rows were actually billable:
  // the queue's only consumer (adminCallPriceUser) works on fstatus='4' ONLY,
  // and rows at 5/6/7 (แจ้งชำระไปแล้ว) that slipped past the old gate stay in
  // the table forever. A badge that counts un-actionable rows sends staff to
  // an empty queue. Now: fetch the queued fIDs, then count only those whose
  // tb_forwarder row is at the billable status — same set the page renders.
  // 2 round-trips instead of 1 (the menu already fans out ~12 counts, and an
  // honest number is worth the hop). Fails soft to 0 like every other count.
  const checkQueueCount = admin
    .from("tb_check_forwarder")
    .select("fID")
    .limit(500)
    .then(async (r) => {
      const queuedFids = ((r.data ?? []) as Array<{ fID: number }>).map((x) => x.fID);
      if (queuedFids.length === 0) return 0;
      const billable = await admin
        .from("tb_forwarder")
        .select("id", { count: "exact", head: true })
        .in("id", queuedFids)
        .eq("fstatus", REPORT_CNT_ADD_CHECK_MIN_FSTATUS);
      return billable.count ?? 0;
    });

  // "ประวัติเข้าโกดังไทย" badge = countErrorF4 (legacy Warehouse.php L7-9) —
  // warehouse scans made TODAY (tb_forwarder_import2.fi2Date=today) that have
  // NOT been matched to a forwarder yet (fid IS NULL). Was hardcoded 0 → now
  // the real faithful count so the tab surfaces today's unmatched scans.
  const _now = new Date();
  const _y = _now.getFullYear();
  const _m = String(_now.getMonth() + 1).padStart(2, "0");
  const _d = String(_now.getDate()).padStart(2, "0");
  const errorF4Count = admin
    .from("tb_forwarder_import2")
    .select("id", { count: "exact", head: true })
    .is("fid", null)
    .gte("fi2date", `${_y}-${_m}-${_d} 00:00:00`)
    .lte("fi2date", `${_y}-${_m}-${_d} 23:59:59`)
    .then((r) => r.count ?? 0);

  // 2026-06-14 forwarder-fidelity audit (§0f "อย่ามั่ว"): noteShop /
  // notShipFree / notShipFreeError were hardcoded Promise.resolve(0), so the
  // three error-queues silently showed no work. Wire the real COUNT queries
  // mirroring each page's own filter.
  //   noteShop → tb_header_order (hNote<>''), NOT tb_forwarder.
  const noteShopCount = admin
    .from("tb_header_order")
    .select("id", { count: "exact", head: true })
    .neq("hnote", "")
    .not("hnote", "is", null)
    .then((r) => r.count ?? 0);

  // Counts run in parallel. We tolerate count failures by defaulting to 0
  // so a single broken filter doesn't blank the entire menu.
  const settled = await Promise.allSettled([
    // 1) waiting — รายงานตู้ (fStatus<4 AND fCabinetNumber non-empty)
    c((q) =>
      q.lt("fstatus", "4").not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0"),
    ),
    // 2) noteShop — tb_header_order hNote<>'' (real count · see above)
    noteShopCount,
    // 3) note — fNote<>''
    c((q) => q.not("fnote", "is", null).neq("fnote", "")),
    // 4) notPhoto — fCover='' AND fStatus>1 AND fDate>cutoff
    c((q) => q.eq("fcover", "").gt("fstatus", "1").gte("fdate", cutoff)),
    // 5) notPortage — full legacy queue (drift-free with forwarder-action/page.tsx)
    c((q) =>
      q.or("ftransportprice.eq.0,fshipby.eq.PCSE")
       .or("ftransportpricesum.is.null,ftransportpricesum.neq.1")
       .neq("fshipby", "PCS").neq("fshipby", "PCSF")
       .eq("paymethod", "1").gte("fdate", cutoff)
       .in("fstatus", ["4", "5", "6"]),
    ),
    // 6) notContainer — fCabinetNumber=''
    c((q) => q.eq("fcabinetnumber", "").gte("fdate", cutoff)),
    // 7) notDateContainerClose
    c((q) => q.is("fdatecontainerclose", null).gte("fdate", cutoff)),
    // 8) notShipFree — ZIP IN free-list AND fshipby NOT IN ('PCS','PCSF') AND fdate>cutoff
    c((q) => q.in("faddresszipcode", FREE_SHIPPING_ZIPS).not("fshipby", "in", "(PCS,PCSF)").gte("fdate", cutoff)),
    // 9) NotShipFreeError — ZIP NOT IN free-list AND fshipby='PCSF' AND fdate>cutoff
    c((q) => q.not("faddresszipcode", "in", FREE_SHIPPING_ZIPS_IN_CLAUSE).eq("fshipby", "PCSF").gte("fdate", cutoff)),
    // 9) fCreditError — fCredit='1' AND fCreditDate<NOW()
    c((q) => q.eq("fcredit", "1").lt("fcreditdate", new Date().toISOString())),
    // 10) Wave 16 — bulk-bill queue (tb_check_forwarder rows = pending bills)
    checkQueueCount,
    // 11) history — countErrorF4 (today's unmatched warehouse scans)
    errorF4Count,
  ]);

  const val = (i: number): number =>
    settled[i].status === "fulfilled" ? (settled[i] as PromiseFulfilledResult<number>).value : 0;

  return {
    waiting:                val(0),
    noteShop:               val(1),
    note:                   val(2),
    notPhoto:               val(3),
    notPortage:             val(4),
    notContainer:           val(5),
    notDateContainerClose:  val(6),
    notShipFree:            val(7),
    notShipFreeError:       val(8),
    fCreditError:           val(9),
    checkQueue:             val(10),
    history:                val(11),
  };
}

const ITEMS: { key: CountKey | "history" | "sacks"; label: string; href: string }[] = [
  { key: "history",                label: "ประวัติเข้าโกดังไทย",  href: "/admin/forwarders/warehouse-history" },
  { key: "waiting",                label: "รายงานตู้",            href: "/admin/report-cnt" },
  // 2026-07-06 (ภูม) — กระสอบรวม (consolidated-sack registry · read-only MOMO
  // mirror) เพิ่มที่แถบบนนี้ด้วย ให้พนักงานเข้าได้สะดวก (§0d).
  { key: "sacks",                  label: "กระสอบรวม",           href: "/admin/warehouse/sacks" },
  { key: "noteShop",               label: "หมายเหตุสั่งซื้อ",    href: "/admin/forwarder-action?action=NoteShop" },
  // Wave 16 P0-2 — bulk-bill-customer queue (เรียกเก็บเงินลูกค้า).
  // Placed BEFORE "หมายเหตุนำเข้า" because billing the customer is the
  // revenue-pipeline next step after the audit queues — operators should
  // see it first in the menu order.
  { key: "checkQueue",             label: "เรียกเก็บเงินลูกค้า",  href: "/admin/forwarder-check" },
  // Wave 20 P1 (2026-05-26 · ภูม flag): re-pointed from the legacy
  // audit-queue handler (/admin/forwarder-action?action=Note · 1 of 9
  // generic queues) to the dedicated /admin/forwarders/notes page
  // which has filter chips + cleaner Tailwind chrome and survives
  // bookmarking. The audit-queue URL still works as a fallback.
  { key: "note",                   label: "หมายเหตุนำเข้า",      href: "/admin/forwarders?filter=note" },
  { key: "notPhoto",               label: "ไม่ได้ถ่ายสินค้า",    href: "/admin/forwarder-action?q=4&action=notPhoto" },
  { key: "notPortage",             label: "ไม่ใส่ค่าขนส่ง",      href: "/admin/forwarder-action?q=4&action=notPortage" },
  { key: "notContainer",           label: "ไม่ใส่เบอร์ตู้",      href: "/admin/forwarder-action?q=2&action=notContainer" },
  { key: "notDateContainerClose",  label: "ไม่ใส่วันที่ปิดตู้",  href: "/admin/forwarder-action?q=2&action=NotDateContainerClose" },
  { key: "notShipFree",            label: "ไม่เลือกขนส่งฟรี",   href: "/admin/forwarder-action?action=NotShipFree" },
  { key: "notShipFreeError",       label: "เลือกขนส่งฟรีผิด",    href: "/admin/forwarder-action?action=NotShipFreeError" },
  { key: "fCreditError",           label: "เครดิตเกินกำหนด",    href: "/admin/forwarder-action?action=fCreditError" },
];

export async function TopMenuReport({
  activeHref,
  embedded = false,
}: { activeHref?: string; embedded?: boolean } = {}) {
  const counts = await loadCounts();

  const isActive = (href: string) =>
    !!activeHref &&
    (href === activeHref || href.startsWith(activeHref + "?") || activeHref.startsWith(href.split("?")[0]));

  // One dashed pill — shared by the chip row + the full-width เครดิต break row so
  // the font / dashed frame / badge stay identical in both (ปอน 2026-07-14
  // "ฟอนต์แบบนี้ เส้นประแบบนี้").
  const renderChip = (it: (typeof ITEMS)[number], fullWidth = false) => {
    const count = it.key === "sacks" ? 0 : counts[it.key];
    const active = isActive(it.href);
    return (
      <Link
        href={it.href}
        className={`pcs-dashsoft inline-flex items-center justify-center gap-1.5 whitespace-nowrap px-2.5 py-2 text-[1rem] leading-none transition-colors ${
          fullWidth ? "w-full" : ""
        } ${
          active
            ? "is-active bg-red-50 text-[#cc3333] dark:bg-red-950/30"
            : "text-slate-700 hover:bg-red-50 dark:text-slate-300 dark:hover:bg-red-950/20"
        }`}
      >
        <span>{it.label}</span>
        {count > 0 && (
          <span className="inline-flex min-w-[1.4rem] items-center justify-center rounded-full bg-[#ff4961] px-2 py-1 text-[0.8rem] font-bold leading-none text-white">
            {count}
          </span>
        )}
      </Link>
    );
  };

  // ปอน 2026-07-15 — EXACTLY 2 lines. line 1 = ALL the audit chips on ONE line
  // (scrolls horizontally if the card is narrower than the row); line 2 = ONLY the
  // two Pacred-EXTRA tabs กระสอบรวม (sacks) + เครดิตเกินกำหนด (fCreditError). Every
  // other chip stays on line 1 ("ที่เหลืออยู่บรรทัดแรกหมด"). Font stays 1rem.
  const tailKeys = new Set(["sacks", "fCreditError"]);
  const mainChips = ITEMS.filter((it) => !tailKeys.has(it.key));
  const sacksItem = ITEMS.find((it) => it.key === "sacks");
  const creditItem = ITEMS.find((it) => it.key === "fCreditError");

  return (
    // Faithful legacy report-cnt.php exception-tabs — dashed rounded pills, BLACK
    // labels, red count badges, never underlined (ปอน 2026-07 "font ดำ · เส้นประ"):
    //   line 1 = every audit chip, kept on ONE line (scrolls if it overflows);
    //   line 2 = ONLY กระสอบรวม + เครดิตเกินกำหนด (ปอน 2026-07-15 "แค่ 2 chip ·
    //            ที่เหลืออยู่บรรทัดแรกหมด").
    // `embedded` = rendered INSIDE the report-cnt header .pcs-card (ปอน 2026-07-14):
    // drop the standalone strip chrome (own bg / dark surface / side padding) and
    // bleed edge-to-edge to the card's 1.5rem padding with a divider beneath.
    // Default (no prop) keeps the full-width standalone bar (list / forwarder-
    // action / cnt-hs pages).
    <nav
      className={
        embedded
          ? "pcs-legacy-top-menu -mx-6 -mt-6 mb-5 border-b border-[#eef0f2] px-6 pb-3.5 pt-4"
          : "pcs-legacy-top-menu border-b border-border bg-white dark:bg-surface px-3 py-2.5"
      }
    >
      {/* line 1 — all audit chips on one line; scrolls if it overflows the card,
          scrollbar hidden per ปอน 2026-06-10 ("nav ไม่มี scroll bar แต่เลื่อนได้") */}
      <ul className="flex flex-nowrap items-center gap-1.5 overflow-x-auto scrollbar-hidden">
        {mainChips.map((it) => (
          <li key={it.label} className="shrink-0">
            {renderChip(it)}
          </li>
        ))}
      </ul>
      {/* line 2 — ONLY กระสอบรวม + เครดิตเกินกำหนด, stretched to fill the row
          ([&>a]:flex-1 → each grows to half the width · ปอน 2026-07-15 "ลากให้
          เต็มบรรทัด") */}
      <div className="mt-2 flex items-stretch gap-1.5 [&>a]:flex-1">
        {sacksItem && renderChip(sacksItem)}
        {creditItem && renderChip(creditItem)}
      </div>
    </nav>
  );
}
