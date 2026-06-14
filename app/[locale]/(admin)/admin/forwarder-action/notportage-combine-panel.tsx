"use client";

/**
 * <NotPortageCombinePanel> — the notPortage "บันทึก และรวมค่าขนส่ง" multi-select.
 *
 * Faithful port of the legacy forwarder-action.php notPortage view: tick N
 * delivered-to-Thailand forwarders, enter ONE TH-delivery charge, and combine
 * them into a single TH-transport batch via adminCombineForwarderTransport
 * (tb_forwarder_tran_th_h/_sub + ftransportprice + ftransportpricesum='1').
 *
 * §0f confirm-before-mutate: the combine fires only after an explicit confirm.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { adminCombineForwarderTransport } from "@/actions/admin/forwarder-tran-th";

export type NotPortageRow = {
  id: number;
  fdate: string | null;
  ftrackingchn: string | null;
  faddressname: string | null;
  faddressprovince: string | null;
  faddresstel: string | null;
  famount: number;
  fweight: number;
  ftransportprice: number;
  fstatus: string | null;
};

export function NotPortageCombinePanel({ rows }: { rows: NotPortageRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [price, setPrice] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const allSelected = rows.length > 0 && selected.size === rows.length;

  function toggle(id: number) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function submit() {
    setMsg(null);
    const priceNum = Number(price);
    if (selected.size === 0) { setMsg({ ok: false, text: "เลือกอย่างน้อย 1 รายการ" }); return; }
    if (!Number.isFinite(priceNum) || priceNum < 0) { setMsg({ ok: false, text: "กรอกค่าขนส่ง (บาท) ให้ถูกต้อง" }); return; }
    if (priceNum > 100_000) { setMsg({ ok: false, text: "ค่าขนส่งเกินเพดาน ฿100,000" }); return; }
    startTransition(async () => {
      const ok = await confirm(
        `ยืนยันรวมค่าขนส่ง ${selected.size} รายการ เป็น ฿${priceNum.toLocaleString("th-TH", { minimumFractionDigits: 2 })} ?`,
      );
      if (!ok) return;
      const res = await adminCombineForwarderTransport({ fIds: [...selected], fTransportPrice: priceNum });
      if (res.ok) {
        setMsg({ ok: true, text: `รวมบิลขนส่งสำเร็จ ${res.data?.combined ?? 0} รายการ (บิล #${res.data?.batchId})` });
        setSelected(new Set());
        setPrice("");
        router.refresh();
      } else {
        setMsg({ ok: false, text: res.error });
      }
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      {/* combine bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-alt/40 px-4 py-3">
        <span className="text-sm font-semibold">รวมค่าขนส่งในไทย</span>
        <span className="text-xs text-muted">เลือก {selected.size} รายการ</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs text-muted">ค่าขนส่ง (บาท)</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            className="w-28 rounded-md border border-border bg-white dark:bg-surface px-2 py-1.5 text-right text-sm tabular-nums"
          />
          <button
            type="button"
            onClick={submit}
            disabled={pending || selected.size === 0}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50 hover:bg-primary-700"
          >
            {pending ? "กำลังบันทึก…" : "บันทึก และรวมค่าขนส่ง"}
          </button>
        </div>
      </div>

      {msg && (
        <div className={`px-4 py-2 text-sm ${msg.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[10px] uppercase text-muted">
            <tr>
              <th className="px-2 py-2 text-center">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="เลือกทั้งหมด" />
              </th>
              <th className="px-2 py-2 text-left">ID</th>
              <th className="px-2 py-2 text-left">วันที่</th>
              <th className="px-2 py-2 text-left">tracking จีน</th>
              <th className="px-2 py-2 text-left">ผู้รับ</th>
              <th className="px-2 py-2 text-left">จังหวัด</th>
              <th className="px-2 py-2 text-right">กล่อง</th>
              <th className="px-2 py-2 text-right">น้ำหนัก</th>
              <th className="px-2 py-2 text-center">สถานะ</th>
              <th className="px-2 py-2 text-right">ค่าขนส่งเดิม</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-border ${selected.has(r.id) ? "bg-primary-50/50" : ""}`}>
                <td className="px-2 py-2 text-center">
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`เลือก ${r.id}`} />
                </td>
                <td className="px-2 py-2 font-mono">{r.id}</td>
                <td className="px-2 py-2">{r.fdate ? String(r.fdate).slice(0, 10) : "-"}</td>
                <td className="px-2 py-2 font-mono">{r.ftrackingchn || "-"}</td>
                <td className="px-2 py-2">{r.faddressname || "-"}</td>
                <td className="px-2 py-2">{r.faddressprovince || "-"}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.famount}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.fweight.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-2 py-2 text-center">{r.fstatus}</td>
                <td className="px-2 py-2 text-right tabular-nums">{r.ftransportprice.toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
                <td className="px-2 py-2">
                  <Link href={`/admin/forwarders?q=${r.id}`} className="text-primary-600 hover:underline text-[11px]">ดู</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
