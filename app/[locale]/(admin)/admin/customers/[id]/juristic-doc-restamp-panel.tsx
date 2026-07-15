"use client";

/**
 * JuristicDocRestampPanel (owner 2026-07-15) — after a customer is upgraded บุคคล → นิติ,
 * STAFF pick which already-issued documents (ใบวางบิล / ใบเสร็จ) to change to the company
 * identity, and Apply — themselves, no engineer/script. เลือกทีละใบ · เลือกทั้งหมด · Apply.
 *
 * DISPLAY-only for money (see actions/admin/juristic-docs.ts): only the หัวชื่อ/ประเภท/เลขภาษี
 * change; collected amounts are frozen. Docs already matching the current identity are shown
 * ticked-off ("ตรงแล้ว") and excluded from the default selection.
 */

import { useEffect, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import {
  listCustomerJuristicDocs,
  adminRestampCustomerDocs,
  type CustomerJuristicDocs,
} from "@/actions/admin/juristic-docs";

export function JuristicDocRestampPanel({ userid, autoLoad = true }: { userid: string; autoLoad?: boolean }) {
  const router = useRouter();
  const [docs, setDocs] = useState<CustomerJuristicDocs | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [selInv, setSelInv] = useState<Set<number>>(new Set());
  const [selRc, setSelRc] = useState<Set<string>>(new Set());
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const load = useCallback(() => {
    setErr(null); setMsg(null);
    startLoad(async () => {
      const res = await listCustomerJuristicDocs(userid);
      if (!res.ok) { setErr(res.error ?? "โหลดเอกสารไม่สำเร็จ"); setLoaded(true); return; }
      const d = res.data!;
      setDocs(d);
      // default-select the docs that DON'T yet match the current identity.
      setSelInv(new Set(d.invoices.filter((i) => !i.matches).map((i) => i.id)));
      setSelRc(new Set(d.receipts.filter((r) => !r.matches).map((r) => r.rid)));
      setLoaded(true);
    });
  }, [userid]);

  useEffect(() => { if (autoLoad) load(); }, [autoLoad, load]);

  if (!autoLoad && !loaded) {
    return (
      <button type="button" onClick={load} disabled={loading}
        className="text-xs font-medium text-sky-600 hover:underline disabled:opacity-50">
        📄 เปลี่ยนเอกสารที่ออกไปแล้วเป็นนิติ…
      </button>
    );
  }

  if (loading && !docs) return <div className="text-xs text-muted py-2">กำลังโหลดเอกสาร…</div>;
  if (err) return <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {err} <button onClick={load} className="underline ml-1">ลองใหม่</button></div>;
  if (!docs) return null;

  const allInv = docs.invoices;
  const allRc = docs.receipts;
  const changeable = allInv.filter((i) => !i.matches).length + allRc.filter((r) => !r.matches).length;
  const totalDocs = allInv.length + allRc.length;
  const selCount = selInv.size + selRc.size;
  const allSelected = selCount > 0 && selCount === totalDocs;

  function toggleInv(id: number) { setSelInv((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  function toggleRc(rid: string) { setSelRc((s) => { const n = new Set(s); n.has(rid) ? n.delete(rid) : n.add(rid); return n; }); }
  function selectAll() {
    if (allSelected) { setSelInv(new Set()); setSelRc(new Set()); }
    else { setSelInv(new Set(allInv.map((i) => i.id))); setSelRc(new Set(allRc.map((r) => r.rid))); }
  }

  async function apply() {
    setErr(null); setMsg(null);
    if (selCount === 0) { setErr("ยังไม่ได้เลือกเอกสาร"); return; }
    const target = docs!.identity.isJuristic ? `นิติบุคคล · ${docs!.identity.name}` : `บุคคลธรรมดา · ${docs!.identity.name}`;
    if (!(await confirm(`เปลี่ยนหัวชื่อ ${selCount} เอกสาร (${selInv.size} ใบวางบิล · ${selRc.size} ใบเสร็จ) เป็น:\n\n${target}\n\n(เปลี่ยนแค่หัวชื่อ/ประเภท/เลขภาษี · ยอดเงินที่เก็บจริงไม่เปลี่ยน)`))) return;
    startSave(async () => {
      const res = await adminRestampCustomerDocs(userid, { invoiceIds: [...selInv], receiptRids: [...selRc] });
      if (!res.ok) { setErr(res.error ?? "เปลี่ยนไม่สำเร็จ"); return; }
      setMsg(`✅ เปลี่ยนแล้ว: ${res.data!.invoices} ใบวางบิล · ${res.data!.receipts} ใบเสร็จ → ${docs!.identity.name}`);
      load();            // re-read → the changed docs now show "ตรงแล้ว"
      router.refresh();  // refresh the docs elsewhere on the page
    });
  }

  if (totalDocs === 0) {
    return <div className="text-xs text-muted py-2">— ยังไม่มีเอกสารที่ออกไปแล้ว —</div>;
  }

  return (
    <div className="space-y-2.5 rounded-lg border border-border bg-surface-alt/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-semibold">เอกสารที่ออกไปแล้ว ({totalDocs})</div>
        <div className="text-[11px] text-muted">
          ปัจจุบัน: <span className="font-medium">{docs.identity.isJuristic ? "นิติบุคคล" : "บุคคลธรรมดา"}</span>
          {docs.identity.name && <> · {docs.identity.name}</>}
        </div>
      </div>
      {changeable > 0 ? (
        <div className="text-[11px] text-amber-700">มี {changeable} เอกสารที่หัวชื่อยังไม่ตรง — ติ๊กเลือกแล้วกด Apply เปลี่ยนเป็นนิติได้เลย</div>
      ) : (
        <div className="text-[11px] text-emerald-700">ทุกเอกสารหัวชื่อตรงกับข้อมูลปัจจุบันแล้ว ✓</div>
      )}
      {msg && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-700">{msg}</div>}
      {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">⚠ {err}</div>}

      <label className="flex items-center gap-2 text-xs font-medium border-b border-border pb-1.5">
        <input type="checkbox" checked={allSelected} onChange={selectAll} />
        เลือกทั้งหมด ({selCount}/{totalDocs})
      </label>

      <div className="max-h-64 overflow-y-auto space-y-1">
        {allInv.map((i) => (
          <label key={`inv-${i.id}`} className="flex items-center gap-2 text-xs py-1 hover:bg-surface/60 rounded px-1 cursor-pointer">
            <input type="checkbox" checked={selInv.has(i.id)} onChange={() => toggleInv(i.id)} />
            <span className="font-mono text-sky-700">{i.docNo}</span>
            <span className="rounded bg-sky-50 text-sky-700 px-1.5 py-0.5 text-[10px]">ใบวางบิล</span>
            <span className="text-muted">{i.status}</span>
            <span className="flex-1 truncate">{i.currentName || "—"} · {i.isJuristic ? "นิติ" : "บุคคล"}</span>
            {i.matches && <span className="text-[10px] text-emerald-600">ตรงแล้ว</span>}
          </label>
        ))}
        {allRc.map((r) => (
          <label key={`rc-${r.rid}`} className="flex items-center gap-2 text-xs py-1 hover:bg-surface/60 rounded px-1 cursor-pointer">
            <input type="checkbox" checked={selRc.has(r.rid)} onChange={() => toggleRc(r.rid)} />
            <span className="font-mono text-emerald-700">{r.rid}</span>
            <span className="rounded bg-emerald-50 text-emerald-700 px-1.5 py-0.5 text-[10px]">ใบเสร็จ</span>
            <span className="flex-1 truncate">{r.currentName || "—"} · {r.isJuristic ? "นิติ" : "บุคคล"}</span>
            {r.matches && <span className="text-[10px] text-emerald-600">ตรงแล้ว</span>}
          </label>
        ))}
      </div>

      <div className="flex items-center gap-2 pt-0.5">
        <button type="button" disabled={saving || selCount === 0} onClick={apply}
          className="rounded-md bg-sky-600 text-white px-3 py-1.5 text-xs font-medium hover:bg-sky-700 disabled:opacity-50">
          {saving ? "กำลังเปลี่ยน…" : `Apply — เปลี่ยน ${selCount} เอกสาร`}
        </button>
        <button type="button" disabled={loading} onClick={load}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface disabled:opacity-50">
          รีเฟรช
        </button>
      </div>
    </div>
  );
}
