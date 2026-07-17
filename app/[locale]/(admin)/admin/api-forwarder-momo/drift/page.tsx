/**
 * /admin/api-forwarder-momo/drift — iTAM (แต้ม) ↔ tb_forwarder DRIFT QUEUE (READ-ONLY).
 *
 * The MOMO API has been dropping 30-40% of warehouse-arrival records since
 * 16/06/26, so iTAM's packing-list (the TRUTH · ingested into taem_packing_line ·
 * mig 0226) carries trackings that either never reached tb_forwarder, OR reached
 * it as a bare ฿0 shell that never got its measurements → ~฿294k under-charged
 * freight is invisible. This page makes that gap VISIBLE + one-click-fixable.
 *
 * ⚠️ THIS PAGE WRITES NOTHING. It READS taem_packing_line (left) + tb_forwarder
 * (matched on ftrackingchn = base_tracking) and classifies each row. Every "fix"
 * is a DEEP-LINK to the EXISTING audited path:
 *   - matched-฿0 / drift  → /warehouse-reconcile  (paste iTAM → preview → apply)
 *   - missing (no row)     → /review or /manual    (CREATE the row, then reconcile)
 * The recoverable-฿ figures are DISPLAY-ONLY estimates (the audited reconcile
 * re-derives the exact charge via computeAndFillForwarderImportRate).
 *
 * Gated ops/super/warehouse (+ god) — matches the reconcile.
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import { canViewCost } from "@/lib/admin/money-visibility";
import { baseTracking } from "@/lib/admin/momo-bill-header";
import {
  classifyDriftRow,
  summarizeDrift,
  type ItamLine,
  type FwdMatch,
  type DriftRow,
} from "@/lib/admin/itam-drift";

export const dynamic = "force-dynamic";

const num = (v: number | string | null | undefined): number | null =>
  v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null;

const thb = (n: number) => "฿" + n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
const kg = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const cbm = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("th-TH", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

function classBadge(cls: DriftRow["cls"]) {
  switch (cls) {
    case "missing":
      return <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-medium">ไม่มีในระบบ (ต้องสร้าง)</span>;
    case "matched-zero":
      return <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-medium">มีแถว แต่ ฿0 (รอ reconcile)</span>;
    case "matched-billed":
      return <span className="rounded-full bg-gray-200 text-gray-600 px-2 py-0.5 text-[11px] font-medium">วางบิลแล้ว (ล็อก)</span>;
    case "matched-ok":
      return <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">ตรงแล้ว</span>;
  }
}

export default async function ItamDriftPage() {
  const { roles } = await requireAdmin(["ops", "super", "warehouse"]);
  const showMoney = canViewCost(roles);
  const admin = createAdminClient();

  // 1. read every iTAM packing line (the reference truth)
  const { data: linesData, error: linesErr } = await admin
    .from("taem_packing_line")
    .select("container_no, base_tracking, member_code, item_type, total_parcel, total_wt_kg, total_vol_cbm, source_file")
    .order("container_no", { ascending: true })
    .limit(5000);
  if (linesErr) {
    console.error("[itam-drift] read taem_packing_line failed", { code: linesErr.code, message: linesErr.message });
  }
  const lines: ItamLine[] = (linesData ?? []).map((r) => ({
    container_no: String(r.container_no),
    base_tracking: String(r.base_tracking),
    member_code: r.member_code ?? null,
    item_type: r.item_type ?? null,
    total_parcel: num(r.total_parcel),
    total_wt_kg: num(r.total_wt_kg),
    total_vol_cbm: num(r.total_vol_cbm),
    source_file: r.source_file ?? null,
  }));

  // 2. match each base tracking to tb_forwarder (1:1, first match wins). Match BOTH
  //    the exact base tracking AND any -N split rows (whose baseTracking == ours).
  const bases = Array.from(new Set(lines.map((l) => l.base_tracking)));
  const fByBase = new Map<string, FwdMatch>();
  if (bases.length > 0) {
    // chunk the .in() (Postgres / PostgREST URL length) — keep batches modest.
    const CHUNK = 200;
    for (let i = 0; i < bases.length; i += CHUNK) {
      const chunk = bases.slice(i, i + CHUNK);
      const { data, error } = await admin
        .from("tb_forwarder")
        .select("id, ftrackingchn, fstatus, fweight, fvolume, fcabinetnumber, ftotalprice, userid")
        .in("ftrackingchn", chunk);
      if (error) {
        console.error("[itam-drift] match tb_forwarder failed", { code: error.code, message: error.message });
        continue;
      }
      for (const f of data ?? []) {
        const exact = f.ftrackingchn ?? "";
        const base = baseTracking(exact) ?? exact;
        // prefer an exact-base match; only fall back to a -N split when no exact yet.
        if (exact && bases.includes(exact) && !fByBase.has(exact)) {
          fByBase.set(exact, mapFwd(f));
        } else if (base && bases.includes(base) && !fByBase.has(base)) {
          fByBase.set(base, mapFwd(f));
        }
      }
    }
  }

  // 3. classify + summarize
  const rows: DriftRow[] = lines.map((l) => classifyDriftRow(l, fByBase.get(l.base_tracking) ?? null));
  const { groups, totals, prDropVictims } = summarizeDrift(rows);

  const empty = lines.length === 0;

  return (
    <main className="p-4 lg:p-8 space-y-5">
      <nav className="flex items-center gap-1.5 text-xs text-muted">
        <Link href="/admin" className="hover:text-primary-600">Admin</Link>
        <span>›</span>
        <Link href="/admin/api-forwarder-momo" className="hover:text-primary-600">MOMO</Link>
        <span>›</span>
        <span className="text-foreground font-medium">จุดบอด iTAM (แต้ม)</span>
      </nav>

      <header>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · MOMO · iTAM DRIFT</p>
        <h1 className="mt-1 text-2xl font-bold">จุดบอด: ของถึงโกดัง (แต้ม) แต่ยังไม่เข้าระบบ</h1>
        <p className="mt-1.5 text-sm text-muted max-w-3xl">
          MOMO API <strong>ตกหล่นข้อมูลของถึงโกดัง 30-40%</strong> ตั้งแต่ 16/06/69 → ฝั่งแต้ม (ข้อมูลจริง)
          มีรายการที่ยัง <strong>ไม่เข้า tb_forwarder</strong> หรือเข้ามาเป็นแถวเปล่าค่าส่ง <strong>฿0</strong>.
          หน้านี้ <strong>อ่านอย่างเดียว</strong> — แสดงช่องว่าง + ลิงก์ไปแก้ด้วยเครื่องมือเดิม (reconcile / สร้างแถว).
        </p>
      </header>

      {/* summary cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard label="แถว iTAM ทั้งหมด" value={totals.lines.toLocaleString("th-TH")} tone="gray" />
        <SummaryCard label="ไม่มีในระบบ (ต้องสร้าง)" value={totals.missing.toLocaleString("th-TH")} tone="rose" />
        <SummaryCard label="มีแถว แต่ ฿0 (reconcile ได้เลย)" value={totals.matchedZero.toLocaleString("th-TH")} tone="amber" />
        <SummaryCard label="ตรงแล้ว / วางบิลแล้ว" value={(totals.matchedOk + totals.matchedBilled).toLocaleString("th-TH")} tone="emerald" />
        {showMoney ? (
          <SummaryCard
            label="ค่าส่งที่กู้คืนได้ (ประมาณ)"
            value={thb(totals.estRecoverThb)}
            tone="primary"
            hint="ตัวเลขประมาณการ — ราคาจริงคิดใหม่ตอน reconcile"
          />
        ) : (
          <SummaryCard label="ค่าส่งที่กู้คืนได้" value="(สงวนสิทธิ์)" tone="gray" hint="เฉพาะบทบาทที่เห็นต้นทุน" />
        )}
      </section>

      {empty && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          ยังไม่มีข้อมูล iTAM ในตาราง <code>taem_packing_line</code>. ให้รัน
          <code className="mx-1 rounded bg-amber-100 px-1.5 py-0.5 text-[12px]">scripts/ingest-itam-packing-2026-06-29.mjs --apply</code>
          เพื่อนำเข้าข้อมูลแพ็คกิ้งลิสต์ของแต้มก่อน (มิเกรชัน 0226 ต้องถูก apply ด้วย).
        </div>
      )}

      {/* PR DROP VICTIMS — the 22 missing PR trackings that need CREATE first */}
      {prDropVictims.length > 0 && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-rose-200 flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-rose-800">
              🚨 PR ที่หาย {prDropVictims.length} รายการ — ต้องสร้างแถวก่อน (CREATE) แล้วค่อย reconcile
            </h2>
            <span className="text-[11px] text-rose-700">
              แต้มมีของพวกนี้ในตู้ แต่ <strong>ไม่มีใน tb_forwarder เลย</strong> → reconcile เติมให้ไม่ได้จนกว่าจะสร้างแถว
            </span>
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="min-w-full text-[12px]">
              <thead className="bg-rose-100/60 text-rose-800">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold">ตู้</th>
                  <th className="px-3 py-2 font-semibold">เลขแทรคกิ้ง</th>
                  <th className="px-3 py-2 font-semibold">ลูกค้า</th>
                  <th className="px-3 py-2 font-semibold text-right">กล่อง</th>
                  <th className="px-3 py-2 font-semibold text-right">น้ำหนัก (kg)</th>
                  <th className="px-3 py-2 font-semibold text-right">CBM</th>
                  <th className="px-3 py-2 font-semibold">สร้างแถว</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-100">
                {prDropVictims.map((r) => (
                  <tr key={`${r.container_no}-${r.base_tracking}`} className="hover:bg-rose-100/40">
                    <td className="px-3 py-2 font-medium text-foreground">{r.container_no}</td>
                    <td className="px-3 py-2 font-mono">{r.base_tracking}</td>
                    <td className="px-3 py-2"><CustomerCodeLink code={r.member_code} /></td>
                    <td className="px-3 py-2 text-right">{r.total_parcel ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{kg(r.total_wt_kg)}</td>
                    <td className="px-3 py-2 text-right">{cbm(r.total_vol_cbm)}</td>
                    <td className="px-3 py-2">
                      <Link
                        href="/admin/api-forwarder-momo/manual"
                        className="rounded border border-rose-300 bg-white text-rose-700 px-2 py-1 text-[11px] font-medium hover:bg-rose-50 inline-flex items-center gap-1"
                      >
                        ➕ สร้างแถว
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* per-container groups */}
      {groups.map((g) => (
        <section key={g.container_no} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 flex flex-wrap items-center gap-3">
            <h2 className="text-base font-bold text-foreground">{g.container_no}</h2>
            <span className="text-[11px] text-muted">{g.counts.total} แทรคกิ้ง</span>
            {g.counts.missing > 0 && (
              <span className="rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-[11px] font-medium">หาย {g.counts.missing}</span>
            )}
            {g.counts.matchedZero > 0 && (
              <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-medium">฿0 {g.counts.matchedZero}</span>
            )}
            {g.counts.matchedOk > 0 && (
              <span className="rounded-full bg-emerald-100 text-emerald-700 px-2 py-0.5 text-[11px] font-medium">ตรง {g.counts.matchedOk}</span>
            )}
            <span className="ml-auto text-[11px] text-muted">
              {kg(g.totalWtKg)} kg · {cbm(g.totalVolCbm)} CBM
              {showMoney && g.estRecoverThb > 0 && (
                <strong className="ml-2 text-primary-700">กู้คืน ≈ {thb(g.estRecoverThb)}</strong>
              )}
            </span>
            {(g.counts.missing > 0 || g.counts.matchedZero > 0) && (
              <Link
                href="/admin/api-forwarder-momo/warehouse-reconcile"
                className="rounded border border-sky-300 bg-white text-sky-700 px-2 py-1 text-[11px] font-medium hover:bg-sky-50 inline-flex items-center gap-1"
              >
                🔄 ไป reconcile ตู้นี้
              </Link>
            )}
          </div>
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="min-w-full text-[12px]">
              <thead className="bg-gray-50 text-gray-700">
                <tr className="text-left">
                  <th className="px-3 py-2 font-semibold">เลขแทรคกิ้ง</th>
                  <th className="px-3 py-2 font-semibold">ลูกค้า</th>
                  <th className="px-3 py-2 font-semibold">สถานะ</th>
                  <th className="px-3 py-2 font-semibold text-right">แต้ม กล่อง</th>
                  <th className="px-3 py-2 font-semibold text-right">แต้ม kg</th>
                  <th className="px-3 py-2 font-semibold text-right">แต้ม CBM</th>
                  <th className="px-3 py-2 font-semibold text-right">ในระบบ kg</th>
                  <th className="px-3 py-2 font-semibold text-right">ในระบบ CBM</th>
                  <th className="px-3 py-2 font-semibold text-right">ค่าส่งตอนนี้</th>
                  {showMoney && <th className="px-3 py-2 font-semibold text-right">กู้คืน≈</th>}
                  <th className="px-3 py-2 font-semibold">แก้ไข</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {g.rows.map((r) => (
                  <tr key={`${r.container_no}-${r.base_tracking}`} className="hover:bg-gray-50/70 align-top">
                    <td className="px-3 py-2 font-mono">{r.base_tracking}</td>
                    <td className="px-3 py-2"><CustomerCodeLink code={r.member_code} /></td>
                    <td className="px-3 py-2">{classBadge(r.cls)}</td>
                    <td className="px-3 py-2 text-right">{r.total_parcel ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{kg(r.total_wt_kg)}</td>
                    <td className="px-3 py-2 text-right">{cbm(r.total_vol_cbm)}</td>
                    <td className="px-3 py-2 text-right text-muted">{r.cls === "missing" ? "—" : kg(r.curWt)}</td>
                    <td className="px-3 py-2 text-right text-muted">{r.cls === "missing" ? "—" : cbm(r.curVol)}</td>
                    <td className={`px-3 py-2 text-right ${r.freightZero && r.cls !== "matched-ok" ? "text-rose-600 font-semibold" : "text-muted"}`}>
                      {r.cls === "missing" ? "—" : thb(r.curPrice ?? 0)}
                    </td>
                    {showMoney && (
                      <td className="px-3 py-2 text-right font-medium text-primary-700">
                        {r.estRecoverThb > 0 ? thb(r.estRecoverThb) : "—"}
                      </td>
                    )}
                    <td className="px-3 py-2">
                      {r.cls === "missing" ? (
                        <Link
                          href="/admin/api-forwarder-momo/manual"
                          className="rounded border border-rose-300 bg-white text-rose-700 px-2 py-1 text-[11px] font-medium hover:bg-rose-50 inline-flex items-center gap-1"
                        >
                          ➕ สร้างแถว
                        </Link>
                      ) : r.cls === "matched-zero" ? (
                        <Link
                          href="/admin/api-forwarder-momo/warehouse-reconcile"
                          className="rounded border border-sky-300 bg-white text-sky-700 px-2 py-1 text-[11px] font-medium hover:bg-sky-50 inline-flex items-center gap-1"
                        >
                          🔄 reconcile
                        </Link>
                      ) : (
                        <span className="text-[11px] text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}

      <p className="text-[11px] text-muted">
        หน้านี้อ่านอย่างเดียว ไม่มีการบันทึกข้อมูลใด ๆ. ทุกการแก้ไขทำผ่านเครื่องมือเดิม (reconcile / สร้างแถว)
        ที่มีการตรวจสอบสิทธิ์ + คิดราคาขายใหม่อัตโนมัติ. ตัวเลข &quot;กู้คืน≈&quot; เป็นการประมาณการเพื่อดูขนาดของช่องว่าง
        — ราคาจริงคำนวณตอน reconcile จากการ์ดเรท + ค่าเทียบ/ราคาแก้มือต่อออเดอร์.
      </p>
    </main>
  );
}

function mapFwd(f: {
  id: number;
  ftrackingchn: string | null;
  fstatus: string | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fcabinetnumber: string | null;
  ftotalprice: number | string | null;
  userid: string | null;
}): FwdMatch {
  return {
    id: f.id,
    ftrackingchn: f.ftrackingchn,
    fstatus: f.fstatus,
    fweight: num(f.fweight),
    fvolume: num(f.fvolume),
    fcabinetnumber: f.fcabinetnumber,
    ftotalprice: num(f.ftotalprice),
    userid: f.userid,
  };
}

function SummaryCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone: "gray" | "rose" | "amber" | "emerald" | "primary";
  hint?: string;
}) {
  const toneCls: Record<typeof tone, string> = {
    gray: "border-gray-200 bg-white",
    rose: "border-rose-200 bg-rose-50",
    amber: "border-amber-200 bg-amber-50",
    emerald: "border-emerald-200 bg-emerald-50",
    primary: "border-primary-200 bg-primary-50",
  };
  const valCls: Record<typeof tone, string> = {
    gray: "text-gray-800",
    rose: "text-rose-700",
    amber: "text-amber-700",
    emerald: "text-emerald-700",
    primary: "text-primary-700",
  };
  return (
    <div className={`rounded-xl border p-3 ${toneCls[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">{label}</p>
      <p className={`mt-1 font-mono text-xl font-bold ${valCls[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}
