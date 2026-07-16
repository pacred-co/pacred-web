"use client";

/**
 * CustomsLeadRow — one importer in the sales call queue (owner 2026-07-16).
 * Self-explaining row (§0g): who + how many ใบขน + CIF + HS + phone (existing) +
 * next action. Inline call-workflow (status + note + assign sale · confirm §0f) +
 * a drill-down to the importer's ใบขน (HS/อากร/supplier).
 */

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import { prompt } from "@/components/ui/confirm";
import {
  updateCustomsImporterLead,
  getCustomsImporterDeclarations,
  type CustomsDeclarationRow,
} from "@/actions/admin/customs-leads";

type Lead = {
  tax_id: string;
  name_th: string | null;
  name_en: string | null;
  address: string | null;
  province: string | null;
  transports: string[] | null;
  decl_count: number;
  total_cif: number | string | null;
  total_tax: number | string | null;
  first_decl_date: string | null;
  last_decl_date: string | null;
  hs_codes: string[] | null;
  suppliers: string[] | null;
  matched_userid: string | null;
  matched_phone: string | null;
  matched_name: string | null;
  matched_sale: string | null;
  is_existing: boolean;
  lead_status: string;
  assigned_sale: string | null;
  call_note: string | null;
  called_at: string | null;
};

const STATUS_CHIP: Record<string, string> = {
  new: "bg-rose-500 text-white border-rose-600",
  called: "bg-amber-500 text-white border-amber-600",
  interested: "bg-blue-600 text-white border-blue-700",
  converted: "bg-emerald-600 text-white border-emerald-700",
  not_interested: "bg-gray-400 text-white border-gray-500",
  our_own: "bg-purple-500 text-white border-purple-600",
};
const STATUS_LABEL: Record<string, string> = {
  new: "ยังไม่โทร", called: "โทรแล้ว", interested: "สนใจ", converted: "เปิดใบขนแล้ว", not_interested: "ไม่สนใจ", our_own: "เครือเรา",
};
const TRANSPORT_LABEL: Record<string, string> = { road: "🚚 รถ", sea: "🚢 เรือ", air: "✈️ แอร์" };

const BTN = "min-h-[36px] rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50";
const fmtHs = (t: string) => (t && t.length >= 6 ? t.slice(-8).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1.$2.$3") : t);

export function CustomsLeadRow({ lead }: { lead: Lead }) {
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [decls, setDecls] = useState<CustomsDeclarationRow[] | null>(null);
  const router = useRouter();

  const cif = Math.round(Number(lead.total_cif ?? 0));
  const status = lead.lead_status;

  function run(label: string, patch: Parameters<typeof updateCustomsImporterLead>[0]) {
    setMsg(null);
    startTransition(async () => {
      const res = await updateCustomsImporterLead(patch);
      if (res.ok) { setMsg(`✓ ${label}`); router.refresh(); }
      else setMsg(`✗ ${res.error ?? "ผิดพลาด"}`);
    });
  }

  async function setStatus(s: string, label: string) {
    if (s === "not_interested" || s === "converted") {
      const note = await prompt(`บันทึกโน้ต (${label}):`);
      if (note == null) return;
      run(label, { taxId: lead.tax_id, status: s as never, callNote: note.trim() || undefined });
    } else {
      run(label, { taxId: lead.tax_id, status: s as never });
    }
  }
  async function addNote() {
    const note = await prompt("บันทึกการโทร:", lead.call_note ?? "");
    if (note == null) return;
    run("บันทึกโน้ตแล้ว", { taxId: lead.tax_id, callNote: note.trim() });
  }
  async function assign() {
    const sale = await prompt("มอบหมายเซล (admin_xxx):", lead.assigned_sale ?? "");
    if (sale == null) return;
    run("มอบหมายแล้ว", { taxId: lead.tax_id, assignedSale: sale.trim() });
  }

  function toggleDetail() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (decls == null) {
      startTransition(async () => {
        const res = await getCustomsImporterDeclarations(lead.tax_id);
        if (res.ok) setDecls(res.data ?? []);
        else { setDecls([]); setMsg(`✗ โหลดใบขนไม่ได้: ${res.error}`); }
      });
    }
  }

  return (
    <li className="px-5 py-4 space-y-2.5">
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${STATUS_CHIP[status] ?? "bg-gray-200"}`}>{STATUS_LABEL[status] ?? status}</span>
            {lead.is_existing ? (
              <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700 font-medium">🟢 ลูกค้าเดิม</span>
            ) : status !== "our_own" ? (
              <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-[11px] text-blue-700 font-medium">🔵 ลูกค้าใหม่</span>
            ) : null}
            {(lead.transports ?? []).map((t) => (
              <span key={t} className="rounded-full border border-border bg-surface-alt px-2 py-0.5 text-[11px] text-muted">{TRANSPORT_LABEL[t] ?? t}</span>
            ))}
          </div>
          <p className="text-sm font-semibold text-foreground break-words">{lead.name_th || lead.name_en || "(ไม่มีชื่อ)"}</p>
          <p className="text-[11px] text-muted">
            นิติ <span className="font-mono">{lead.tax_id}</span>
            {lead.province && <> · {lead.province}</>}
            {" · "}<strong className="text-foreground">{lead.decl_count}</strong> ใบขน
            {" · "}<strong className="text-foreground">{(lead.hs_codes ?? []).length}</strong> พิกัด HS
            {" · CIF ฿"}<strong className="text-foreground">{cif.toLocaleString()}</strong>
          </p>
          {/* PHONE — the whole point: existing customers show it, new leads need chasing */}
          {lead.is_existing ? (
            <p className="text-[13px]">
              ☎ <a href={`tel:${lead.matched_phone ?? ""}`} className="font-bold text-primary-600 hover:underline">{lead.matched_phone || "(ไม่มีเบอร์)"}</a>
              {lead.matched_name && <span className="text-muted"> · {lead.matched_name}</span>}
              {lead.matched_userid && <span className="text-muted"> · {lead.matched_userid}</span>}
              {lead.matched_sale && <span className="text-muted"> · เซล {lead.matched_sale}</span>}
            </p>
          ) : status !== "our_own" ? (
            <p className="text-[13px] text-amber-700">☎ ยังไม่มีเบอร์ในระบบ — เซลหาต่อ (ค้นเลขนิติที่ DBD / กูเกิลชื่อบริษัท)</p>
          ) : null}
          {lead.assigned_sale && <p className="text-[11px] text-muted">มอบหมาย: <span className="font-medium text-foreground">{lead.assigned_sale}</span></p>}
          {lead.call_note && <p className="text-[11px] rounded-lg border border-amber-200 bg-amber-50 p-1.5 text-amber-800">📝 {lead.call_note}</p>}
        </div>
      </div>

      {/* call workflow */}
      {status !== "our_own" && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {status === "new" && (
            <button type="button" disabled={pending} onClick={() => setStatus("called", "โทรแล้ว")} className={`${BTN} border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100`}>☎ โทรแล้ว</button>
          )}
          {(status === "new" || status === "called") && (
            <button type="button" disabled={pending} onClick={() => setStatus("interested", "สนใจ")} className={`${BTN} border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100`}>👍 สนใจ</button>
          )}
          {status !== "converted" && (
            <button type="button" disabled={pending} onClick={() => setStatus("converted", "เปิดใบขนแล้ว")} className={`${BTN} border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100`}>✅ เปิดใบขนแล้ว</button>
          )}
          {status !== "not_interested" && (
            <button type="button" disabled={pending} onClick={() => setStatus("not_interested", "ไม่สนใจ")} className={`${BTN} border border-border bg-surface-alt text-muted hover:bg-surface-alt/70`}>✕ ไม่สนใจ</button>
          )}
          <button type="button" disabled={pending} onClick={addNote} className={`${BTN} border border-border bg-white text-foreground hover:bg-surface-alt`}>📝 โน้ต</button>
          <button type="button" disabled={pending} onClick={assign} className={`${BTN} border border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100`}>มอบเซล</button>
          <button type="button" disabled={pending} onClick={toggleDetail} className={`${BTN} border border-border bg-white text-foreground hover:bg-surface-alt`}>{open ? "▲ ซ่อนใบขน" : "▼ ดูใบขน + HS"}</button>
          {pending && <span className="text-[11px] text-muted">กำลังบันทึก…</span>}
          {!pending && msg && <span className="text-[11px] text-muted">{msg}</span>}
        </div>
      )}

      {/* HS codes preview */}
      {(lead.hs_codes ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(lead.hs_codes ?? []).slice(0, 12).map((h) => (
            <span key={h} className="rounded border border-border bg-surface-alt/50 px-1.5 py-0.5 text-[11px] font-mono text-muted">{fmtHs(h)}</span>
          ))}
          {(lead.hs_codes ?? []).length > 12 && <span className="text-[11px] text-muted">+{(lead.hs_codes ?? []).length - 12} พิกัด</span>}
        </div>
      )}

      {/* drill-down: the ใบขน */}
      {open && (
        <div className="mt-1.5 rounded-lg border border-border bg-surface-alt/30 p-2 overflow-x-auto">
          {decls == null ? (
            <p className="text-[11px] text-muted p-2">กำลังโหลดใบขน…</p>
          ) : decls.length === 0 ? (
            <p className="text-[11px] text-muted p-2">ไม่มีใบขน</p>
          ) : (
            <table className="w-full text-[11px] [&>tbody>tr>td]:px-2 [&>tbody>tr>td]:py-1 [&>thead>tr>th]:px-2 [&>thead>tr>th]:py-1 [&>thead>tr>th]:text-left">
              <thead className="text-muted border-b border-border">
                <tr><th>เลขใบขน</th><th>วันที่</th><th>ท่า</th><th>ขนส่ง</th><th>supplier</th><th>พิกัด HS · อากร%</th><th className="text-right">CIF ฿</th></tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {decls.map((d) => (
                  <tr key={d.ref_no}>
                    <td className="font-mono">{d.ref_no}</td>
                    <td>{d.recv_date ?? "—"}</td>
                    <td>{d.discharge_port ?? "—"}</td>
                    <td>{d.vessel_name ?? "—"}</td>
                    <td className="max-w-[160px] truncate" title={d.supplier_name ?? ""}>{d.supplier_name ?? "—"} {d.supplier_country ? `(${d.supplier_country})` : ""}</td>
                    <td>
                      {(d.lines ?? []).slice(0, 4).map((l, i) => (
                        <div key={i} className="font-mono">{fmtHs(l.tariff_hs ?? "")} · {l.duty_rate ?? "0"}% <span className="text-muted not-italic">{(l.desc_th || l.desc_en || "").slice(0, 24)}</span></div>
                      ))}
                      {(d.lines ?? []).length > 4 && <span className="text-muted">+{(d.lines ?? []).length - 4} รายการ</span>}
                    </td>
                    <td className="text-right">{Math.round(Number(d.cif_total_baht ?? 0)).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </li>
  );
}
