"use client";

import { useMemo, useState, useTransition } from "react";
import { adminAssignTtwPackingPr } from "@/actions/admin/ttw-packing";

export type TtwLine = {
  id: string;
  container_no: string;
  base_tracking: string;
  shipping_mark: string | null;
  member_code: string | null;
  pr_source: string | null;
  warehouse: string;
  origin: string;
  transport_mode: string | null;
  boxes: number | null;
  weight_kg: number | string | null;
  cbm: number | string | null;
  product_name: string | null;
  sm_date: string | null;
  committed_forwarder_id: number | null;
};

const TRANSPORT: Record<string, string> = { "1": "🚛 ทางรถ", "2": "🚢 ทางเรือ", "3": "✈️ ทางอากาศ" };
const num = (v: number | string | null, dp = 0) =>
  v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

type Filter = "all" | "no_pr" | "has_pr";

export function TtwStagingClient({
  rows,
  nameByPr,
  loadError,
}: {
  rows: TtwLine[];
  nameByPr: Record<string, string>;
  loadError: boolean;
}) {
  // Two separate mirrors, keyed by row id:
  //  - `edits` = the live INPUT buffer (updates on every keystroke · display only).
  //  - `saved` = the effective SAVED PR after a successful save (drives classification).
  // Filtering/search/progress key on the SAVED PR — NOT the live input — so typing a PR
  // into a row on the "ยังไม่มี PR" tab does NOT drop the row on the first keystroke
  // (the row moves only after the user SAVES · review-fix 2026-07-18).
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, { pr: string | null; found: boolean; name: string | null }>>({});
  const [busyMap, setBusy] = useState<Record<string, boolean>>({});
  const [, startT] = useTransition();
  const [filter, setFilter] = useState<Filter>("no_pr");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // The effective SAVED PR of a row (post-save local mirror, else the server value).
  const assignedPr = (r: TtwLine) => (r.id in saved ? saved[r.id].pr : r.member_code) ?? "";
  // The INPUT value (live buffer · seeded from the saved PR).
  const inputVal = (r: TtwLine) => edits[r.id] ?? assignedPr(r);

  const filtered = useMemo(() => {
    const needle = q.trim().toUpperCase();
    return rows.filter((r) => {
      const pr = assignedPr(r);
      if (filter === "no_pr" && pr) return false;
      if (filter === "has_pr" && !pr) return false;
      if (needle) {
        const hay = `${r.base_tracking} ${r.shipping_mark ?? ""} ${pr} ${r.product_name ?? ""}`.toUpperCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, q, saved]);

  // Group the FILTERED rows by container.
  const groups = useMemo(() => {
    const m = new Map<string, TtwLine[]>();
    for (const r of filtered) {
      const g = m.get(r.container_no) ?? [];
      g.push(r);
      m.set(r.container_no, g);
    }
    return Array.from(m.entries()).map(([container, lines]) => {
      // Summary over ALL lines of this container (not just filtered) for accurate PR-progress.
      const allLines = rows.filter((r) => r.container_no === container);
      const withPr = allLines.filter((r) => assignedPr(r)).length;
      const boxes = allLines.reduce((s, r) => s + (r.boxes ?? 0), 0);
      const wt = allLines.reduce((s, r) => s + Number(r.weight_kg ?? 0), 0);
      const cbm = allLines.reduce((s, r) => s + Number(r.cbm ?? 0), 0);
      const first = allLines[0];
      return { container, lines, allCount: allLines.length, withPr, boxes, wt, cbm, first };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, rows, saved]);

  const totalTracks = rows.length;
  const totalNoPr = rows.filter((r) => !assignedPr(r)).length;
  const totalContainers = new Set(rows.map((r) => r.container_no)).size;
  const totalCommitted = rows.filter((r) => r.committed_forwarder_id != null).length;

  function save(r: TtwLine) {
    const value = inputVal(r).trim().toUpperCase();
    setBusy((p) => ({ ...p, [r.id]: true }));
    startT(async () => {
      const res = await adminAssignTtwPackingPr({ id: r.id, memberCode: value });
      setBusy((p) => ({ ...p, [r.id]: false }));
      if (res.ok) {
        const pr = res.data?.memberCode ?? null;
        // Record the SAVED PR → the row reclassifies (moves out of "ยังไม่มี PR") only NOW,
        // not while typing. Also normalise the input buffer to the saved value.
        setSaved((s) => ({ ...s, [r.id]: { pr, found: res.data?.found ?? false, name: res.data?.customerName ?? null } }));
        setEdits((e) => ({ ...e, [r.id]: pr ?? "" }));
      } else {
        alert(res.error);
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="p-6">
        <Header totalContainers={0} totalTracks={0} totalNoPr={0} totalCommitted={0} />
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {loadError ? "โหลดข้อมูลไม่สำเร็จ" : "ยังไม่มีแพคกิ้งลิสต์อี้อู/TTW ในระบบ — รัน scripts/ingest-ttw-packing-2026-07-18.ts ก่อน"}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <Header totalContainers={totalContainers} totalTracks={totalTracks} totalNoPr={totalNoPr} totalCommitted={totalCommitted} />

      {/* Filter + search */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        {([
          ["no_pr", `ยังไม่มี PR (${totalNoPr})`],
          ["has_pr", `ใส่ PR แล้ว (${totalTracks - totalNoPr})`],
          ["all", `ทั้งหมด (${totalTracks})`],
        ] as [Filter, string][]).map(([f, label]) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition ${
              filter === f ? "bg-primary-600 text-white" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ค้นหา แทรคกิ้ง / มาร์ค / PR / สินค้า…"
          className="ml-auto w-full max-w-xs rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      {/* Per-container accordions */}
      <div className="mt-4 space-y-3">
        {groups.map((g) => {
          const isOpen = open[g.container] ?? true;
          const donePct = g.allCount ? Math.round((g.withPr / g.allCount) * 100) : 0;
          return (
            <div key={g.container} className="overflow-hidden rounded-lg border">
              <button
                onClick={() => setOpen((o) => ({ ...o, [g.container]: !isOpen }))}
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 bg-muted/40 px-3 py-2.5 text-left hover:bg-muted/60"
              >
                <span className="text-[15px] font-bold">{isOpen ? "▾" : "▸"} {g.container}</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">TTW</span>
                <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">อี้อู</span>
                <span className="text-[12px] text-muted-foreground">{TRANSPORT[g.first?.transport_mode ?? "2"] ?? "🚢 ทางเรือ"}</span>
                <span className="ml-auto flex items-center gap-3 text-[12px] text-muted-foreground">
                  <span>{g.allCount} แทรค</span>
                  <span>{num(g.boxes)} กล่อง</span>
                  <span>{num(g.wt, 1)} กก.</span>
                  <span>{num(g.cbm, 4)} CBM</span>
                  <span className={`font-semibold ${g.withPr === g.allCount ? "text-emerald-600" : "text-rose-600"}`}>
                    PR {g.withPr}/{g.allCount} ({donePct}%)
                  </span>
                </span>
              </button>

              {isOpen && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-[13px]">
                    <thead>
                      <tr className="border-y bg-muted/20 text-[11px] text-muted-foreground [&>th]:px-2 [&>th]:py-1.5 [&>th]:text-left">
                        <th>#</th>
                        <th>แทรคกิ้ง (单号)</th>
                        <th>มาร์ค (唛头)</th>
                        <th>สินค้า</th>
                        <th className="!text-right">กล่อง</th>
                        <th className="!text-right">น้ำหนัก</th>
                        <th className="!text-right">CBM</th>
                        <th className="min-w-[240px]">รหัสลูกค้า (PR)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map((r, i) => {
                        const committed = r.committed_forwarder_id != null;
                        const inputPr = inputVal(r);          // live input buffer (display + live badge)
                        const committedPr = assignedPr(r);    // the saved PR (committed badge)
                        const savedInfo = saved[r.id];
                        const name = savedInfo?.name ?? (inputPr ? nameByPr[inputPr] : null) ?? null;
                        const found = savedInfo ? savedInfo.found : inputPr ? inputPr in nameByPr : false;
                        const busy = busyMap[r.id];
                        return (
                          <tr key={r.id} className={`border-b last:border-0 [&>td]:px-2 [&>td]:py-1.5 ${committed ? "bg-emerald-50/40" : ""}`}>
                            <td className="text-muted-foreground">{i + 1}</td>
                            <td className="font-mono text-[12px]">{r.base_tracking}</td>
                            <td className="text-[12px]">{r.shipping_mark ?? "—"}</td>
                            <td className="max-w-[160px] truncate text-[12px]" title={r.product_name ?? ""}>{r.product_name ?? "—"}</td>
                            <td className="text-right">{num(r.boxes)}</td>
                            <td className="text-right">{num(r.weight_kg, 1)}</td>
                            <td className="text-right">{num(r.cbm, 4)}</td>
                            <td>
                              {committed ? (
                                <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                  ✓ {committedPr || "—"} (commit แล้ว)
                                </span>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <input
                                    value={inputPr}
                                    onChange={(e) => setEdits((ed) => ({ ...ed, [r.id]: e.target.value }))}
                                    onKeyDown={(e) => { if (e.key === "Enter") save(r); }}
                                    placeholder="PR…"
                                    className="w-24 rounded border px-2 py-1 text-[12px] uppercase"
                                    disabled={busy}
                                  />
                                  <button
                                    onClick={() => save(r)}
                                    disabled={busy}
                                    className="rounded bg-primary-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                                  >
                                    {busy ? "…" : "บันทึก"}
                                  </button>
                                  {inputPr && (found ? (
                                    <span className="text-[11px] text-emerald-600" title={name ?? ""}>✓ {name ? name.slice(0, 18) : "พบ"}</span>
                                  ) : (
                                    <span className="text-[11px] text-amber-600">⚠ ยังไม่พบ PR นี้</span>
                                  ))}
                                  {r.pr_source === "mark" && !savedInfo && (
                                    <span className="text-[10px] text-sky-600" title="เดาจากมาร์ค PR ในแพคกิ้งลิสต์">(จากมาร์ค)</span>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {g.lines.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-3 text-center text-[12px] text-muted-foreground">ไม่มีแถวตรงตัวกรอง</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Header({
  totalContainers, totalTracks, totalNoPr, totalCommitted,
}: { totalContainers: number; totalTracks: number; totalNoPr: number; totalCommitted: number }) {
  return (
    <div>
      <h1 className="text-2xl font-bold">📦 แพคกิ้งลิสต์ อี้อู / TTW — ใส่ PR ให้ลูกค้า</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ตู้จากโกดัง <b>อี้อู</b> (เฟรท <b>TTW</b>) เข้าระบบแล้ว — แต่ยังไม่รู้ว่าของใคร (会员=YY).
        CS จับคู่ <b>มาร์ค (唛头)</b> กับ <b>ใบส่งของ</b> → ใส่รหัสลูกค้า (PR) ในช่องด้านล่าง.
        การใส่ PR ที่นี่ยัง <b>ไม่</b> สร้างรายการนำเข้า/บิล — เป็นการจับคู่ไว้ก่อน (ขั้นถัดไป = จับกลุ่ม + สร้างรายการนำเข้า).
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
        <Stat label="ตู้" value={totalContainers} />
        <Stat label="แทรคกิ้ง" value={totalTracks} />
        <Stat label="ยังไม่มี PR" value={totalNoPr} tone={totalNoPr ? "rose" : "emerald"} />
        <Stat label="commit แล้ว" value={totalCommitted} tone="emerald" />
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "muted" }: { label: string; value: number; tone?: "muted" | "rose" | "emerald" }) {
  const c = tone === "rose" ? "text-rose-600" : tone === "emerald" ? "text-emerald-600" : "text-foreground";
  return (
    <span className="rounded-md border bg-card px-3 py-1.5">
      <span className="text-muted-foreground">{label} </span>
      <b className={c}>{value.toLocaleString()}</b>
    </span>
  );
}
