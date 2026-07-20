"use client";

/**
 * นำเข้าคีย์เวิร์ดจาก CSV (Google Keyword Planner) — ปอน 2026-07-03.
 *
 * ปอน pulls a "Keyword Stats" export from Google Keyword Planner and only wants
 * to pick WHICH service the whole file belongs to — everything else (keyword,
 * volume, CPC, competition) comes from the file. The export is UTF-16 LE /
 * TAB-delimited; we sniff the BOM, decode, parse (lib/marketing-planner/
 * keyword-csv.ts), preview, and UPSERT: a keyword that already exists in the
 * chosen service is OVERWRITTEN in place (updated) — never a duplicate row —
 * and the rest are added. All in one store update (→ one DB save).
 */
import { useMemo, useState } from "react";
import { CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { KEYWORD_PLATFORMS, type KeywordItem } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { parseKeywordCsv, tierFromVolume, type ParsedKeywordRow } from "@/lib/marketing-planner/keyword-csv";
import { fmtMoney, fmtNum } from "@/lib/marketing-planner/util";
import { btnGhost, btnPrimary, cx, Field, inputCls, Modal, Tag } from "./ui";

const TIER_LABEL = { primary: "หลัก", secondary: "รอง", longtail: "ย่อย" } as const;
const TIER_COLOR = { primary: "#B30000", secondary: "#3b82f6", longtail: "#64748b" } as const;

/** Read a File as text, sniffing the byte-order-mark so Google's UTF-16 export
 *  decodes correctly (a plain FileReader.readAsText assumes UTF-8 → mojibake). */
async function readCsvFile(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder("utf-16le").decode(buf);
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder("utf-16be").decode(buf);
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return new TextDecoder("utf-8").decode(buf.subarray(3));
  return new TextDecoder("utf-8").decode(buf);
}

export function KeywordImportModal({ onClose }: { onClose: () => void }) {
  const { keywords, byGroup, importKeywords } = usePlanner();
  const serviceOptions = byGroup("service");

  const [service, setService] = useState("");
  // แพลตฟอร์มของทั้งไฟล์ — Keyword Planner ให้ Google/YouTube รวมกันมา จึงเป็นค่าตั้งต้น
  const [platform, setPlatform] = useState<string>("google_youtube");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedKeywordRow[] | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ added: number; updated: number } | null>(null);

  const onFile = async (file: File | undefined) => {
    setErr(""); setRows(null); setDone(null); setFileName(file?.name ?? "");
    if (!file) return;
    try {
      const res = parseKeywordCsv(await readCsvFile(file));
      if (!res.headerFound) {
        setErr("อ่านไฟล์ไม่ได้ — ไม่พบหัวตาราง “Keyword” (ต้องเป็นไฟล์ export จาก Google Keyword Planner)");
        return;
      }
      if (res.rows.length === 0) { setErr("ไม่พบคีย์เวิร์ดในไฟล์"); return; }
      setRows(res.rows);
    } catch {
      setErr("เปิดไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  };

  // Upsert plan — dedup the file itself (last occurrence wins), and flag whether each
  // keyword already exists in the chosen service (→ overwrite in place) or is new (→ add).
  // Nothing is skipped or duplicated: an existing keyword is UPDATED, not re-added.
  const { plan, addCount, updateCount } = useMemo(() => {
    if (!rows || !service) return { plan: [] as Array<{ r: ParsedKeywordRow; isUpdate: boolean }>, addCount: 0, updateCount: 0 };
    const existing = new Set(keywords.filter((k) => k.service === service && (k.platform || "google_youtube") === platform).map((k) => k.keyword.trim().toLowerCase()));
    const byKw = new Map<string, ParsedKeywordRow>();
    for (const r of rows) byKw.set(r.keyword.trim().toLowerCase(), r); // in-file dup → last wins
    const plan = [...byKw].map(([k, r]) => ({ r, isUpdate: existing.has(k) }));
    return { plan, addCount: plan.filter((p) => !p.isUpdate).length, updateCount: plan.filter((p) => p.isUpdate).length };
  }, [rows, service, platform, keywords]);

  const doImport = () => {
    if (!service || plan.length === 0) return;
    setBusy(true);
    const items: Omit<KeywordItem, "id">[] = plan.map(({ r }) => ({
      service,
      platform,
      tier: tierFromVolume(r.volume),
      keyword: r.keyword,
      volume: r.volume,
      cpc: r.cpc,
      difficulty: r.difficulty,
    }));
    const res = importKeywords(items);
    setBusy(false);
    setDone(res);
  };

  const previewList = service ? plan : (rows ?? []).map((r) => ({ r, isUpdate: false }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="นำเข้าคีย์เวิร์ดจาก CSV (Google Keyword Planner)"
      footer={
        done ? (
          <button type="button" className={btnPrimary} onClick={onClose}>เสร็จสิ้น</button>
        ) : (
          <>
            <button type="button" className={btnGhost} onClick={onClose}>ยกเลิก</button>
            <button type="button" className={btnPrimary} disabled={!service || plan.length === 0 || busy} onClick={doImport}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              นำเข้า{plan.length ? ` ${fmtNum(plan.length)} คีย์เวิร์ด` : ""}
            </button>
          </>
        )
      }
    >
      {done ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <CheckCircle2 className="h-11 w-11 text-green-500" />
          <p className="text-sm font-bold text-foreground">นำเข้าสำเร็จ</p>
          <p className="text-[13px] text-muted">
            บริการ “{service}” — เพิ่มใหม่ {fmtNum(done.added)}
            {done.updated ? ` · อัปเดตคำเดิม ${fmtNum(done.updated)}` : ""} คีย์เวิร์ด
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="แพลตฟอร์มของไฟล์นี้" hint="คำเดียวกันคนละแพลตฟอร์มเก็บแยกแถว (volume/CPC ไม่เท่ากัน)">
              <select className={inputCls} value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="แพลตฟอร์มคีย์เวิร์ด">
                {KEYWORD_PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="บริการที่จะผูกคีย์เวิร์ด" required hint="เลือกบริการเดียว — คีย์เวิร์ดทั้งไฟล์จะเข้าบริการนี้">
              {serviceOptions.length > 0 ? (
                <select className={inputCls} value={service} onChange={(e) => setService(e.target.value)}>
                  <option value="">— เลือกบริการ —</option>
                  {serviceOptions.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
              ) : (
                <input className={inputCls} value={service} onChange={(e) => setService(e.target.value)} placeholder="เช่น นำเข้าสินค้าจากจีน" />
              )}
            </Field>
            <Field label="ไฟล์ CSV" required hint="ไฟล์ export จาก Keyword Planner (UTF-16 · คั่นด้วยแท็บ)">
              <label className={cx(btnGhost, "w-full cursor-pointer justify-start font-normal")}>
                <FileUp className="h-4 w-4 shrink-0" />
                <span className="truncate">{fileName || "เลือกไฟล์ .csv"}</span>
                <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
            </Field>
          </div>

          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-600 dark:bg-red-950/30">{err}</p>}

          {rows && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
                <span className="font-semibold text-foreground">พบ {fmtNum(rows.length)} คีย์เวิร์ดในไฟล์</span>
                {service ? (
                  <>
                    <span className="text-green-600">เพิ่มใหม่ {fmtNum(addCount)}</span>
                    {updateCount > 0 && <span className="text-blue-600">อัปเดตคำเดิม {fmtNum(updateCount)}</span>}
                  </>
                ) : (
                  <span className="font-medium text-amber-600">← เลือกบริการก่อน</span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-muted">
                Volume / CPC / ความยาก ดึงจากไฟล์ · ระดับกำหนดอัตโนมัติจาก Volume
                (≥ 1,000 = หลัก · ≥ 100 = รอง · น้อยกว่า = ย่อย) แก้รายตัวได้ทีหลัง ·
                ช่องว่างภาษาไทยที่ Google ใส่มาถูกรวมให้อัตโนมัติ ·
                <span className="text-foreground"> คำที่มีอยู่แล้วในบริการนี้จะถูกทับด้วยค่าล่าสุด (ไม่เพิ่มบรรทัดซ้ำ)</span>
              </p>
              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-[12px]">
                  <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-surface/95">
                    <tr className="border-b border-border text-left">
                      <th className="px-2 py-1.5 font-bold text-muted">คีย์เวิร์ด</th>
                      <th className="px-2 py-1.5 text-right font-bold text-muted">Volume</th>
                      <th className="px-2 py-1.5 text-right font-bold text-muted">CPC</th>
                      <th className="px-2 py-1.5 text-right font-bold text-muted">ความยาก</th>
                      <th className="px-2 py-1.5 font-bold text-muted">ระดับ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewList.slice(0, 50).map(({ r, isUpdate }, i) => {
                      const tier = tierFromVolume(r.volume);
                      return (
                        <tr key={i} className="border-b border-border last:border-0">
                          <td className="px-2 py-1 font-medium text-foreground">
                            {r.keyword}
                            {isUpdate && <span className="ml-1.5 rounded bg-blue-50 px-1 py-0.5 text-[10px] font-medium text-blue-600 dark:bg-blue-950/40">อัปเดต</span>}
                          </td>
                          <td className="px-2 py-1 text-right">{fmtNum(r.volume)}</td>
                          <td className="px-2 py-1 text-right">{r.cpc != null ? fmtMoney(r.cpc) : "—"}</td>
                          <td className="px-2 py-1 text-right">{r.difficulty ?? "—"}</td>
                          <td className="px-2 py-1"><Tag color={TIER_COLOR[tier]} label={TIER_LABEL[tier]} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {previewList.length > 50 && (
                <p className="text-[11px] text-muted">แสดง 50 แถวแรก · ทั้งหมด {fmtNum(previewList.length)} แถว</p>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
