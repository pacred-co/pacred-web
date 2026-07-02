"use client";

/**
 * Keyword บริการ (SEO keyword planner · ปอน 2026-07-01) — lay out each service's
 * keywords by tier (หลัก/รอง/ย่อย) with search volume, CPC ("แพงไหม"), and
 * difficulty. Values are entered by hand (research from external tools) since
 * this is a localStorage prototype, not a live keyword API.
 */
import { useMemo, useState } from "react";
import { FileUp, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { KeywordItem, KeywordTier } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { fmtMoney, fmtNum } from "@/lib/marketing-planner/util";
import { btnGhost, btnPrimary, cx, EmptyState, Field, inputCls, Modal, SectionCard, Tag, useConfirm } from "./ui";
import { KeywordImportModal } from "./keyword-import-modal";

const TIER: Record<KeywordTier, { label: string; color: string }> = {
  primary: { label: "หลัก", color: "#B30000" },
  secondary: { label: "รอง", color: "#3b82f6" },
  longtail: { label: "ย่อย (Long-tail)", color: "#64748b" },
};
const TIER_ORDER: Record<KeywordTier, number> = { primary: 0, secondary: 1, longtail: 2 };

function diffTone(d?: number): { label: string; color: string } {
  if (typeof d !== "number") return { label: "—", color: "#94a3b8" };
  if (d <= 33) return { label: `ง่าย (${d})`, color: "#22c55e" };
  if (d <= 66) return { label: `กลาง (${d})`, color: "#f59e0b" };
  return { label: `ยาก (${d})`, color: "#ef4444" };
}

type FormState = { service: string; keyword: string; tier: KeywordTier; volume: string; cpc: string; difficulty: string; intent: string; note: string };

function KeywordForm({ editing, services, onClose }: { editing: KeywordItem | null; services: string[]; onClose: () => void }) {
  const { addKeyword, updateKeyword } = usePlanner();
  const [f, setF] = useState<FormState>({
    service: editing?.service ?? "",
    keyword: editing?.keyword ?? "",
    tier: editing?.tier ?? "primary",
    volume: editing?.volume?.toString() ?? "",
    cpc: editing?.cpc?.toString() ?? "",
    difficulty: editing?.difficulty?.toString() ?? "",
    intent: editing?.intent ?? "",
    note: editing?.note ?? "",
  });
  const [err, setErr] = useState("");
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  const save = () => {
    if (!f.service.trim() || !f.keyword.trim()) {
      setErr("กรอกบริการ + คีย์เวิร์ด");
      return;
    }
    const payload = {
      service: f.service.trim(),
      keyword: f.keyword.trim(),
      tier: f.tier,
      volume: num(f.volume),
      cpc: num(f.cpc),
      difficulty: num(f.difficulty),
      intent: f.intent.trim() || undefined,
      note: f.note.trim() || undefined,
    };
    if (editing) updateKeyword(editing.id, payload);
    else addKeyword(payload);
    onClose();
  };

  return (
    <Modal open onClose={onClose} size="md" title={editing ? "แก้ไขคีย์เวิร์ด" : "เพิ่มคีย์เวิร์ด"}
      footer={<><button type="button" className={btnGhost} onClick={onClose}>ยกเลิก</button><button type="button" className={btnPrimary} onClick={save}>บันทึก</button></>}>
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="บริการ" required hint={err}>
            <input className={cx(inputCls, err && "border-red-400")} list="kw-services" value={f.service} onChange={(e) => { setF((p) => ({ ...p, service: e.target.value })); setErr(""); }} placeholder="เช่น นำเข้าสินค้าจากจีน" />
            <datalist id="kw-services">{services.map((s) => <option key={s} value={s} />)}</datalist>
          </Field>
          <Field label="ระดับคีย์เวิร์ด">
            <select className={inputCls} value={f.tier} onChange={(e) => setF((p) => ({ ...p, tier: e.target.value as KeywordTier }))}>
              <option value="primary">หลัก</option>
              <option value="secondary">รอง</option>
              <option value="longtail">ย่อย (Long-tail)</option>
            </select>
          </Field>
        </div>
        <Field label="คีย์เวิร์ด" required><input className={cx(inputCls, err && "border-red-400")} value={f.keyword} onChange={(e) => { setF((p) => ({ ...p, keyword: e.target.value })); setErr(""); }} /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Volume (ค้นหา/เดือน)"><input type="number" min={0} className={inputCls} value={f.volume} onChange={(e) => setF((p) => ({ ...p, volume: e.target.value }))} /></Field>
          <Field label="CPC (฿/คลิก)"><input type="number" min={0} step="any" className={inputCls} value={f.cpc} onChange={(e) => setF((p) => ({ ...p, cpc: e.target.value }))} /></Field>
          <Field label="ความยาก (0-100)"><input type="number" min={0} max={100} className={inputCls} value={f.difficulty} onChange={(e) => setF((p) => ({ ...p, difficulty: e.target.value }))} /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Intent (ความตั้งใจค้นหา)"><input className={inputCls} value={f.intent} onChange={(e) => setF((p) => ({ ...p, intent: e.target.value }))} placeholder="Commercial / Informational / Transactional" /></Field>
          <Field label="หมายเหตุ"><input className={inputCls} value={f.note} onChange={(e) => setF((p) => ({ ...p, note: e.target.value }))} /></Field>
        </div>
      </div>
    </Modal>
  );
}

const TH = "whitespace-nowrap px-2 py-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted";
const TD = "whitespace-nowrap px-2 py-1.5 align-middle text-[12px]";

export function KeywordPlanner() {
  const { keywords, deleteKeyword, loadSampleKeywords } = usePlanner();
  const confirm = useConfirm();
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<KeywordItem | null>(null);
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [tierFilter, setTierFilter] = useState<KeywordTier | "all">("all");
  const [search, setSearch] = useState("");

  const services = useMemo(() => [...new Set(keywords.map((k) => k.service))], [keywords]);
  const grouped = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return services
      .filter((s) => serviceFilter === "all" || s === serviceFilter)
      .map((service) => ({
        service,
        items: keywords
          .filter((k) => k.service === service)
          .filter((k) => tierFilter === "all" || k.tier === tierFilter)
          .filter((k) => !kw || k.keyword.toLowerCase().includes(kw) || (k.intent ?? "").toLowerCase().includes(kw))
          .sort((a, b) => TIER_ORDER[a.tier] - TIER_ORDER[b.tier] || (b.volume ?? 0) - (a.volume ?? 0)),
      }))
      .filter((g) => g.items.length > 0);
  }, [services, keywords, serviceFilter, tierFilter, search]);

  const openAdd = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (k: KeywordItem) => { setEditing(k); setFormOpen(true); };
  const onDelete = async (k: KeywordItem) => {
    if (await confirm({ title: "ลบคีย์เวิร์ด", message: `ลบ "${k.keyword}"?`, danger: true, confirmText: "ลบ" })) deleteKeyword(k.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="inline-flex items-center gap-2 text-base font-bold text-foreground"><Search className="h-5 w-5 text-primary-600" /> Keyword บริการ (SEO)</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btnGhost} onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" /> นำเข้า CSV</button>
          <button type="button" className={btnPrimary} onClick={openAdd}><Plus className="h-4 w-4" /> เพิ่มคีย์เวิร์ด</button>
        </div>
      </div>
      <p className="text-[12px] text-muted">กางคีย์เวิร์ดต่อบริการ — หลัก/รอง/ย่อย · ค้นหา/เดือน (Volume) · CPC แพงไหม (฿) · ความยากในการแข่งขัน · กรอกค่าจากเครื่องมือวิจัยคีย์เวิร์ด (Keyword Planner / Ahrefs ฯลฯ)</p>

      {keywords.length === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" />}
          title="ยังไม่มีคีย์เวิร์ด"
          message="เพิ่มคีย์เวิร์ดของแต่ละบริการ หรือโหลดชุดตัวอย่าง 5 บริการเพื่อเริ่มต้น"
          action={<div className="flex flex-wrap justify-center gap-2"><button type="button" className={btnPrimary} onClick={openAdd}><Plus className="h-4 w-4" /> เพิ่มคีย์เวิร์ด</button><button type="button" className={btnGhost} onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" /> นำเข้า CSV</button><button type="button" className={btnGhost} onClick={loadSampleKeywords}>โหลดตัวอย่าง 5 บริการ</button></div>}
        />
      ) : (
        <div className="space-y-4">
          {/* ตัวกรอง — ค้นหา · ระดับ · บริการ */}
          <div className="space-y-2 rounded-2xl border border-border bg-white p-3 shadow-sm dark:bg-surface">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                <input className={cx(inputCls, "pl-8")} placeholder="ค้นหาคีย์เวิร์ด..." value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex flex-wrap gap-1">
                {(["all", "primary", "secondary", "longtail"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTierFilter(t)}
                    className={cx("rounded-full border px-2.5 py-1 text-[12px] transition", tierFilter === t ? "border-primary-300 bg-primary-50 font-medium text-primary-700" : "border-border text-muted hover:border-primary-200")}>
                    {t === "all" ? "ทุกระดับ" : TIER[t].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setServiceFilter("all")}
                className={cx("rounded-full border px-2.5 py-1 text-[12px] transition", serviceFilter === "all" ? "border-primary-300 bg-primary-50 font-semibold text-primary-700" : "border-border text-muted hover:border-primary-200")}>
                ทุกบริการ ({services.length})
              </button>
              {services.map((s) => (
                <button key={s} type="button" onClick={() => setServiceFilter(s)}
                  className={cx("rounded-full border px-2.5 py-1 text-[12px] transition", serviceFilter === s ? "border-primary-300 bg-primary-50 font-semibold text-primary-700" : "border-border text-muted hover:border-primary-200")}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {grouped.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border py-8 text-center text-[12px] text-muted">ไม่พบคีย์เวิร์ดตามตัวกรอง</p>
          ) : (
            grouped.map(({ service, items }) => {
          const totalVol = items.reduce((s, k) => s + (k.volume ?? 0), 0);
          const cpcVals = items.filter((k) => typeof k.cpc === "number").map((k) => k.cpc as number);
          const avgCpc = cpcVals.length ? cpcVals.reduce((s, v) => s + v, 0) / cpcVals.length : undefined;
          return (
            <SectionCard
              key={service}
              title={<span className="text-[13px]">{service}</span>}
              actions={<span className="text-[11px] text-muted">{items.length} คำ · รวม {fmtNum(totalVol)} ค้นหา/เดือน · CPC เฉลี่ย {avgCpc ? fmtMoney(Math.round(avgCpc)) : "—"}</span>}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[12px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className={TH}>คีย์เวิร์ด</th>
                      <th className={TH}>ระดับ</th>
                      <th className={cx(TH, "text-right")}>Volume</th>
                      <th className={cx(TH, "text-right")}>CPC</th>
                      <th className={TH}>ความยาก</th>
                      <th className={TH}>Intent</th>
                      <th className={cx(TH, "text-right")}>จัดการ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((k) => {
                      const dt = diffTone(k.difficulty);
                      return (
                        <tr key={k.id} className="border-b border-border last:border-0 hover:bg-primary-50/20">
                          <td className={cx(TD, "font-medium text-foreground")}>{k.keyword}</td>
                          <td className={TD}><Tag color={TIER[k.tier].color} label={TIER[k.tier].label} /></td>
                          <td className={cx(TD, "text-right")}>{fmtNum(k.volume)}</td>
                          <td className={cx(TD, "text-right")}>{k.cpc != null ? fmtMoney(k.cpc) : "—"}</td>
                          <td className={TD}><span className="font-medium" style={{ color: dt.color }}>{dt.label}</span></td>
                          <td className={cx(TD, "text-muted")}>{k.intent || "—"}</td>
                          <td className={cx(TD, "text-right")}>
                            <span className="inline-flex gap-0.5">
                              <button className="rounded p-1 text-muted hover:bg-primary-50 hover:text-primary-700" title="แก้ไข" onClick={() => openEdit(k)}><Pencil className="h-4 w-4" /></button>
                              <button className="rounded p-1 text-muted hover:bg-red-50 hover:text-red-600" title="ลบ" onClick={() => onDelete(k)}><Trash2 className="h-4 w-4" /></button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          );
        })
          )}
        </div>
      )}

      {formOpen && <KeywordForm editing={editing} services={services} onClose={() => setFormOpen(false)} />}
      {importOpen && <KeywordImportModal onClose={() => setImportOpen(false)} />}
    </div>
  );
}
