"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { adminLinkForwardersToContainer } from "@/actions/admin/containers";

type EligibleRow = {
  id:               string;
  f_no:             string | null;
  status:           string;
  weight_kg:        number;
  volume_cbm:       number;
  box_count:        number;
  ship_first_name:  string | null;
  ship_last_name:   string | null;
  member_code:      string | null;
};

export function LinkForwardersForm({
  containerId,
  eligible,
}: {
  containerId: string;
  eligible:    EligibleRow[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(fNo: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(fNo)) next.delete(fNo);
      else next.add(fNo);
      return next;
    });
  }
  function toggleAll() {
    if (selected.size === eligible.length) setSelected(new Set());
    else setSelected(new Set(eligible.map((r) => r.f_no ?? "").filter(Boolean)));
  }
  function submit() {
    if (selected.size === 0) { setErr("เลือกอย่างน้อย 1 รายการ"); return; }
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await adminLinkForwardersToContainer({
        container_id: containerId,
        f_nos:        Array.from(selected),
      });
      if (res.ok) {
        setMsg(`ผูกแล้ว ${res.data?.linked ?? 0} รายการ`);
        setSelected(new Set());
        router.refresh();
        setTimeout(() => setMsg(null), 4000);
      } else {
        setErr(res.error);
      }
    });
  }

  if (eligible.length === 0) {
    return (
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
        <h2 className="font-bold text-sm mb-2">ฝากนำเข้าที่เลือกผูกได้</h2>
        <p className="text-sm text-muted">ไม่มี — ตรวจว่า origin + transport ตรงกับตู้นี้แล้วยังไม่ถูกผูกตู้อื่น</p>
      </section>
    );
  }

  const allSelected = selected.size === eligible.length;

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-alt/50">
        <h2 className="font-bold text-sm">
          เลือกฝากนำเข้าผูกตู้นี้ ({eligible.length} เคียวลิจิเบิ้ล)
        </h2>
        <div className="flex items-center gap-2">
          {err && <span className="text-xs text-red-700">{err}</span>}
          {msg && <span className="text-xs text-green-700">{msg}</span>}
          {selected.size > 0 && (
            <span className="text-xs text-muted">{selected.size} เลือก</span>
          )}
          <Button size="sm" type="button" onClick={submit} disabled={pending || selected.size === 0}>
            {pending ? "..." : "ผูกที่เลือก"}
          </Button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-surface-alt/30 text-left text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2 w-10">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} />
            </th>
            <th className="px-4 py-2">f_no</th>
            <th className="px-4 py-2">ลูกค้า</th>
            <th className="px-4 py-2 text-right">น้ำหนัก/CBM</th>
            <th className="px-4 py-2 text-right">กล่อง</th>
            <th className="px-4 py-2">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {eligible.map((r) => (
            <tr key={r.id} className="border-t border-border hover:bg-surface-alt/20">
              <td className="px-4 py-2">
                <input
                  type="checkbox"
                  checked={r.f_no ? selected.has(r.f_no) : false}
                  onChange={() => r.f_no && toggle(r.f_no)}
                  disabled={!r.f_no}
                />
              </td>
              <td className="px-4 py-2 font-mono text-xs">{r.f_no}</td>
              <td className="px-4 py-2 text-xs">
                <div className="font-mono text-muted">{r.member_code}</div>
                <div>{r.ship_first_name} {r.ship_last_name}</div>
              </td>
              <td className="px-4 py-2 text-right text-xs font-mono">
                {Number(r.weight_kg).toFixed(2)} / {Number(r.volume_cbm).toFixed(3)}
              </td>
              <td className="px-4 py-2 text-right text-xs font-mono">{r.box_count}</td>
              <td className="px-4 py-2 text-xs">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
