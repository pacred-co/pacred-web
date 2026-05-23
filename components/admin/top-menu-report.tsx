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

type CountKey =
  | "waiting"
  | "checkQueue"
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

  // Wave 16 P0-2 — separate head-counter for the tb_check_forwarder queue
  // (the bulk-bill page reads this table directly, not tb_forwarder).
  const checkQueueCount = admin
    .from("tb_check_forwarder")
    .select("id", { count: "exact", head: true })
    .then((r) => r.count ?? 0);

  // Counts run in parallel. We tolerate count failures by defaulting to 0
  // so a single broken filter doesn't blank the entire menu.
  const settled = await Promise.allSettled([
    // 1) waiting — รายงานตู้ (fStatus<4 AND fCabinetNumber non-empty)
    c((q) =>
      q.lt("fstatus", "4").not("fcabinetnumber", "is", null).neq("fcabinetnumber", "").neq("fcabinetnumber", "0"),
    ),
    // 2) noteShop — sh.fNoteShop<>'' — defer: needs join into tb_shop; placeholder 0
    Promise.resolve(0),
    // 3) note — fNote<>''
    c((q) => q.not("fnote", "is", null).neq("fnote", "")),
    // 4) notPhoto — fCover='' AND fStatus>1 AND fDate>cutoff
    c((q) => q.eq("fcover", "").gt("fstatus", "1").gte("fdate", cutoff)),
    // 5) notPortage — partial: fTransportPrice=0
    c((q) => q.eq("ftransportprice", 0).gte("fdate", cutoff)),
    // 6) notContainer — fCabinetNumber=''
    c((q) => q.eq("fcabinetnumber", "").gte("fdate", cutoff)),
    // 7) notDateContainerClose
    c((q) => q.is("fdatecontainerclose", null).gte("fdate", cutoff)),
    // 8) notShipFree / NotShipFreeError — both need ZIP-code list join; defer
    Promise.resolve(0),
    Promise.resolve(0),
    // 9) fCreditError — fCredit='1' AND fCreditDate<NOW()
    c((q) => q.eq("fcredit", "1").lt("fcreditdate", new Date().toISOString())),
    // 10) Wave 16 — bulk-bill queue (tb_check_forwarder rows = pending bills)
    checkQueueCount,
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
  };
}

const ITEMS: { key: CountKey | "history"; label: string; href: string }[] = [
  { key: "history",                label: "ประวัติเข้าโกดังไทย",  href: "/admin/forwarders/warehouse-history" },
  { key: "waiting",                label: "รายงานตู้",            href: "/admin/report-cnt" },
  { key: "noteShop",               label: "หมายเหตุสั่งซื้อ",    href: "/admin/forwarder-action?action=NoteShop" },
  // Wave 16 P0-2 — bulk-bill-customer queue (เรียกเก็บเงินลูกค้า).
  // Placed BEFORE "หมายเหตุนำเข้า" because billing the customer is the
  // revenue-pipeline next step after the audit queues — operators should
  // see it first in the menu order.
  { key: "checkQueue",             label: "เรียกเก็บเงินลูกค้า",  href: "/admin/forwarder-check" },
  { key: "note",                   label: "หมายเหตุนำเข้า",      href: "/admin/forwarder-action?action=Note" },
  { key: "notPhoto",               label: "ไม่ได้ถ่ายสินค้า",    href: "/admin/forwarder-action?q=4&action=notPhoto" },
  { key: "notPortage",             label: "ไม่ใส่ค่าขนส่ง",      href: "/admin/forwarder-action?q=4&action=notPortage" },
  { key: "notContainer",           label: "ไม่ใส่เบอร์ตู้",      href: "/admin/forwarder-action?q=2&action=notContainer" },
  { key: "notDateContainerClose",  label: "ไม่ใส่วันที่ปิดตู้",  href: "/admin/forwarder-action?q=2&action=NotDateContainerClose" },
  { key: "notShipFree",            label: "ไม่เลือกขนส่งฟรี",   href: "/admin/forwarder-action?action=NotShipFree" },
  { key: "notShipFreeError",       label: "เลือกขนส่งฟรีผิด",    href: "/admin/forwarder-action?action=NotShipFreeError" },
  { key: "fCreditError",           label: "เครดิตเกินกำหนด",    href: "/admin/forwarder-action?action=fCreditError" },
];

export async function TopMenuReport({ activeHref }: { activeHref?: string } = {}) {
  const counts = await loadCounts();

  return (
    <nav className="pcs-legacy-top-menu border-b border-border bg-white dark:bg-surface px-2 py-2">
      <ul className="flex flex-wrap gap-1 items-center text-xs">
        {ITEMS.map((it) => {
          const count = it.key === "history" ? 0 : counts[it.key];
          const active =
            activeHref &&
            (it.href === activeHref || it.href.startsWith(activeHref + "?") || activeHref.startsWith(it.href.split("?")[0]));
          return (
            <li key={it.label}>
              <Link
                href={it.href}
                className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 whitespace-nowrap border ${
                  active
                    ? "bg-primary-500 text-white border-primary-500"
                    : "bg-white border-border hover:bg-surface-alt"
                }`}
              >
                <span>{it.label}</span>
                {count > 0 && (
                  <span
                    className={`inline-flex items-center justify-center rounded-full text-[10px] font-bold leading-none px-1.5 py-0.5 ${
                      active ? "bg-white text-primary-600" : "bg-red-500 text-white"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
