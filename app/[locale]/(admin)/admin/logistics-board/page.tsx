/**
 * /admin/logistics-board — Logistics-manager cross-department overview (Win).
 *
 * Owner 2026-06-19: the logistics manager oversees CS · docs/freight · docs/shipping ·
 * all warehouse · delivery · billing · planning. The day runs in LINE chat today
 * (the warehouse + shipping groups). This board surfaces the WHOLE cargo pipeline in
 * one screen — every shipment by its flow stage (fstatus) — so each department sees
 * what to do next, at the right point in the flow:
 *
 *   1-3 ยังไม่ถึงไทย → 4 ถึงไทย (วัด/บิล · warehouse+sales) → 5 รอชำระเงิน (เก็บเงิน · CS/acc)
 *     → 6 เตรียมส่ง (แพลนส่ง · planning/driver) → 7 ส่งแล้ว (วางบิลเครดิต · acc)
 *
 * Read-only aggregation of tb_forwarder (no writes). Money lens (juristic WHT 1% ·
 * credit) + quick links to the operational tools each stage needs. Manual-feed (P1)
 * entry point = the existing /admin/forwarders "เพิ่มรายการ" surfaced here.
 *
 * Gated to management/ops roles (god auto-passes via requireAdmin).
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { canViewCostProfit } from "@/lib/admin/money-visibility";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { resolveTransportMode } from "@/lib/forwarder/cabinet-transport";
import { loadAssignedFids } from "@/lib/admin/pending-dispatch";
import { PageHeader } from "@/components/admin/page-header";

export const dynamic = "force-dynamic";

const baht = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type Row = {
  id: number;
  ftrackingchn: string | null;
  userid: string | null;
  fcabinetnumber: string | null;
  fstatus: string | null;
  ftransporttype: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  ftotalprice: number | string | null;
  fcosttotalprice: number | string | null;
  fcredit: string | null;
  fusercompany: string | number | null;
  tax_doc_pref: string | null;
  fdatestatus4: string | null;
  paydeposit: string | null;
};

const STAGES: { codes: string[]; key: string; label: string; dept: string; action: string; href: string; tone: string }[] = [
  { codes: ["1", "2", "3"], key: "transit", label: "ยังไม่ถึงไทย (ระหว่างทาง)", dept: "CS / โกดังจีน", action: "ติดตามตู้ + เช็คของเข้า MOMO", href: "/admin/api-forwarder-momo", tone: "bg-slate-50 border-slate-200 text-slate-700" },
  { codes: ["4"], key: "arrived", label: "ถึงไทยแล้ว — รอวัด / วางบิล", dept: "โกดัง + เซลล์", action: "ยิงเข้าระบบ · วัด กก./คิว · ออกบิล", href: "/admin/report-cnt?page=succeed", tone: "bg-amber-50 border-amber-300 text-amber-800" },
  { codes: ["5"], key: "billed", label: "รอชำระเงิน (แจ้งหนี้แล้ว)", dept: "CS / บัญชี", action: "เก็บเงินลูกค้า · อัพสลิป", href: "/admin/report-cnt?page=succeed", tone: "bg-red-50 border-red-300 text-red-800" },
  { codes: ["6"], key: "ready", label: "เตรียมส่ง (ชำระแล้ว)", dept: "แพลนนิ่ง / คนขับ", action: "แพลนรอบส่ง · นัดลูกค้า · ใบส่งของ", href: "/admin/drivers", tone: "bg-blue-50 border-blue-300 text-blue-800" },
  { codes: ["7"], key: "done", label: "ส่งแล้ว", dept: "บัญชี", action: "วางบิลงานเครดิต · ปิดงาน", href: "/admin/billing-run", tone: "bg-emerald-50 border-emerald-300 text-emerald-800" },
];

export default async function LogisticsBoardPage() {
  const { roles } = await requireAdmin(["super", "manager", "ops", "accounting"]);
  const showMoney = canViewCostProfit(roles);
  const admin = createAdminClient();

  // Pull recent live forwarder rows (the active pipeline). Small table — JS-aggregate.
  const { data, error } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, userid, fcabinetnumber, fstatus, ftransporttype, fweight, fvolume, ftotalprice, fcosttotalprice, fcredit, fusercompany, tax_doc_pref, fdatestatus4, paydeposit")
    .neq("fstatus", "99")
    .order("id", { ascending: false })
    .limit(2000);
  if (error) {
    console.error("[logistics-board] read failed", { code: error.code, message: error.message });
    throw new Error(`โหลดข้อมูลไม่สำเร็จ: ${error.message}`);
  }
  const rows = (data ?? []) as Row[];
  const num = (v: number | string | null) => Number(v ?? 0) || 0;
  const isJuristic = (r: Row) => (typeof r.fusercompany === "string" ? r.fusercompany.trim() === "1" : r.fusercompany === 1);

  const byStage = STAGES.map((s) => {
    const items = rows.filter((r) => s.codes.includes(String(r.fstatus ?? "")));
    return {
      ...s,
      count: items.length,
      sell: items.reduce((a, r) => a + num(r.ftotalprice), 0),
      items: items.slice(0, 12),
    };
  });

  // Money lens — actionable flags.
  const needBillOrCollect = rows.filter((r) => ["4", "5"].includes(String(r.fstatus ?? "")));
  const juristicToWht = needBillOrCollect.filter(isJuristic);
  const creditOrders = rows.filter((r) => (r.fcredit ?? "").trim() !== "" && (r.fcredit ?? "").trim() !== "0");

  // 🚐 Pending-dispatch alert (owner 2026-06-19): fstatus=6 (เตรียมส่ง · ชำระแล้ว) not
  // yet in an OPEN driver batch → planning/warehouse goes to /admin/drivers/new and
  // confirm-saves (เฟิมบันทึก). Auto-surfaced; the dispatch itself stays a human action.
  // Same SOT predicate as countPendingDispatch / drivers/new / legacy: fstatus=6
  // AND paydeposit<>'1' (drop settled-credit) AND not in an open driver batch — so
  // this card's number matches the sidebar badge + the /admin/drivers banner (§0f).
  const readyIds = rows
    .filter((r) => String(r.fstatus ?? "") === "6" && r.paydeposit !== "1")
    .map((r) => r.id);
  const assignedFids = await loadAssignedFids(admin, readyIds);
  const pendingDispatch = readyIds.filter((id) => !assignedFids.has(id)).length;

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <span className="text-foreground font-medium">ศูนย์งานโลจิสติกส์</span>
      </nav>

      <PageHeader
        eyebrow="ADMIN · LOGISTICS"
        title="ศูนย์งานโลจิสติกส์ (ภาพรวมทุกแผนก)"
        subtitle="ทุกชิปเมนต์ในระบบ จัดตาม flow งาน — แต่ละแผนกเห็นว่าต้องทำอะไรต่อ ตรงจุดไหน · อัปเดตสด จาก tb_forwarder"
        actions={
          <Link
            href="/admin/forwarders"
            className="rounded-full bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            + ป้อนของเข้าระบบ (ฝากนำเข้า)
          </Link>
        }
      />

      {/* 🚐 Pending-dispatch alert — ready-to-ship but no driver assigned yet. */}
      {pendingDispatch > 0 && (
        <section className="rounded-2xl border-2 border-blue-400 bg-blue-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-blue-900">🚐 รอจัดรถ — ยังไม่มอบงานคนขับ</h2>
              <p className="mt-0.5 text-[11px] text-blue-800">
                ชำระแล้ว/เตรียมส่ง <strong>{pendingDispatch}</strong> รายการ ยังไม่ถูกจัดเข้ารอบคนขับ —
                แพลนนิ่ง/โกดังไปจัดรถแล้วกด <strong>เฟิมบันทึก</strong>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-extrabold text-blue-700">{pendingDispatch}</span>
              <Link
                href="/admin/drivers/new"
                className="rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                จัดรถ (เฟิมบันทึก) →
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Pipeline */}
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {byStage.map((s) => (
          <div key={s.key} className={`rounded-2xl border p-4 shadow-sm ${s.tone}`}>
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold">{s.label}</h2>
              <span className="text-2xl font-extrabold">{s.count}</span>
            </div>
            <p className="mt-0.5 text-[11px] opacity-80">👥 {s.dept} · 🎯 {s.action}</p>
            {showMoney && s.sell > 0 && <p className="mt-0.5 text-[11px] opacity-80">มูลค่าขายรวม ≈ ฿{baht(s.sell)}</p>}
            <ul className="mt-2 space-y-0.5 text-[11px]">
              {s.items.map((r) => {
                const mode = resolveTransportMode(r.fcabinetnumber, r.ftransporttype);
                const modeIcon = mode === "2" ? "🚢" : mode === "3" ? "✈️" : "🚛";
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2 rounded bg-white/60 px-2 py-1">
                    <span className="font-mono truncate">{modeIcon} {r.ftrackingchn || `#${r.id}`}</span>
                    <span className="whitespace-nowrap">{r.userid ?? "-"}{isJuristic(r) ? " · นิติ" : ""}</span>
                  </li>
                );
              })}
              {s.count > s.items.length && <li className="opacity-70">… อีก {s.count - s.items.length} รายการ</li>}
              {s.count === 0 && <li className="opacity-60">— ว่าง —</li>}
            </ul>
            <Link href={s.href} className="mt-2 inline-block text-[11px] font-medium underline hover:opacity-70">
              เปิดเครื่องมือของขั้นนี้ →
            </Link>
          </div>
        ))}
      </section>

      {/* Money / action lens */}
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4">
          <h3 className="text-sm font-bold text-red-800">รอวัด/บิล/เก็บเงิน (ถึงไทย+รอชำระ)</h3>
          <p className="mt-1 text-3xl font-extrabold text-red-700">{needBillOrCollect.length}</p>
          <Link href="/admin/report-cnt?page=succeed" className="text-xs underline text-red-700">ไปจัดการ →</Link>
        </div>
        <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
          <h3 className="text-sm font-bold text-orange-800">นิติบุคคล — ต้องหัก ณ ที่จ่าย 1%</h3>
          <p className="mt-1 text-3xl font-extrabold text-orange-700">{juristicToWht.length}</p>
          <p className="text-[11px] text-orange-700">บุคคลธรรมดา = ไม่หัก (แต่กดหักเองได้)</p>
        </div>
        <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
          <h3 className="text-sm font-bold text-violet-800">งานเครดิต (วางบิลเครดิต)</h3>
          <p className="mt-1 text-3xl font-extrabold text-violet-700">{creditOrders.length}</p>
          <Link href="/admin/billing-run" className="text-xs underline text-violet-700">ทำใบวางบิล →</Link>
        </div>
      </section>

      {/* Quick links — every department's tool */}
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
        <h3 className="text-sm font-bold mb-2">เครื่องมือแต่ละแผนก</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {[
            ["📦 รายงานตู้ (ถึงไทย)", "/admin/report-cnt?page=succeed"],
            ["🚚 ฝากนำเข้า", "/admin/forwarders"],
            ["🔄 ดึงสถานะ MOMO", "/admin/api-forwarder-momo"],
            ["💰 ต้นทุนจากใบแจ้งหนี้ MOMO", "/admin/api-forwarder-momo/invoice-cost"],
            ["🧾 ทำใบวางบิล", "/admin/billing-run"],
            ["🚐 คนขับ/จัดส่ง", "/admin/drivers"],
            ["🛒 ฝากสั่งซื้อ", "/admin/service-orders"],
            // P1 — paste a PCS tracking list → see which เลขไม่อยู่ในระบบเรา (unmatched)
            // → feed those in via "ป้อนของเข้าระบบ" above.
            ["🔎 เช็คของ PCS (tracking หลายเลข)", "/admin/forwarders/bulk-search"],
          ].map(([label, href]) => (
            <Link key={href} href={href} className="rounded-full border border-border bg-surface-alt/40 px-3 py-1.5 hover:bg-surface-alt">
              {label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
