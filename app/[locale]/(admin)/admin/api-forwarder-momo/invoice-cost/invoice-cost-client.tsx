"use client";

import { useRef, useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import {
  previewMomoInvoiceCost,
  applyMomoInvoiceCost,
  type MomoIngestPreview,
  type MomoIngestPreviewRow,
  type MomoInvoiceCabinetRollup,
} from "@/actions/admin/momo-invoice-ingest";

const baht = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Mirrors MOMO_INVOICE_PDF_MAX_BYTES (lib/admin/momo-invoice-pdf-text.ts). The server
 *  re-asserts it — this only spares the accountant a pointless 20 MB upload. */
const MAX_PDF_BYTES = 20 * 1024 * 1024;

/** อ่านไฟล์ → base64 (ตัด "data:...;base64," ออก) — แบบเดียวกับหน้าอัพ packing list. */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read_failed"));
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.readAsDataURL(file);
  });
}

/** แหล่งที่มาของใบที่กำลังดูอยู่ — ส่งกลับไปตอนกดบันทึกให้ server แกะซ้ำเอง. */
type Source = { kind: "pdf"; fileBase64: string; fileName: string } | { kind: "text"; text: string };
const sourcePayload = (s: Source) => (s.kind === "pdf" ? { fileBase64: s.fileBase64 } : { text: s.text });

const CBM_BASIS_LABEL: Record<string, string> = {
  line_total: "คิว = ยอดรวมทั้งบรรทัด (ต้นทุน = คิว × เรท · จำนวนกล่องไม่ใช่ตัวคูณ)",
  per_box: "คิว = ต่อกล่อง (ต้นทุน = คิว × เรท × จำนวนกล่อง)",
};

/**
 * สรุป "ต่อตู้" + สะพานไปตัดจ่ายค่าตู้ — owner: "MOMO วางบิลเรามาเป็น Tracking ครับ แต่เรา
 * คิดเป็นตู้ ไปตรวจให้ตรงกันนะครับ" แล้ว "ทำตัดจ่ายต้นทุนตู้ในระบบเราได้เลย".
 *
 * ตารางข้างล่างเป็นราย-แทรคกิ้ง (grain ของใบ) แต่การจ่ายเกิดที่ **ตู้** — ก่อนหน้านี้บัญชี
 * ต้องบวกเองว่าตู้นี้ใบเรียกเก็บเท่าไร แล้วไปไล่หาตู้เองใน 44 ตู้ที่หน้าจ่าย.
 */
/**
 * ลิงก์ไปหน้าตัดจ่าย พร้อมติ๊กตู้ให้.
 * 🔴 ต้องส่ง `page` ให้ถูกแท็บ — หน้ารายงานตู้แยก waiting (ยังไม่ถึงไทย) / succeed (ถึงไทยแล้ว)
 *    และ default = waiting. ตู้ที่ MOMO วางบิลมาส่วนใหญ่ถึงไทยแล้ว (อยู่ succeed) → ลิงก์ที่ไม่ส่ง
 *    page จะเด้งไปแท็บที่ "ไม่มีตู้นั้น" = ติ๊กไม่ติด แล้วบัญชีก็หาไม่เจอเหมือนเดิม.
 */
function payHref(cabinets: string[], page: string | null, invoiceNo: string | null): string {
  const qs = new URLSearchParams({ actionPay: "1", cabinet: cabinets.join(",") });
  if (page) qs.set("page", page);
  if (invoiceNo) qs.set("invoice", invoiceNo);
  return `/admin/report-cnt?${qs.toString()}`;
}

function CabinetRollupCard({ rollup, invoiceNo }: { rollup: MomoInvoiceCabinetRollup[]; invoiceNo: string | null }) {
  if (rollup.length === 0) return null;
  // ติ๊กให้เฉพาะตู้ที่ "ตรวจผ่านแล้ว" — ตู้ที่ยังขัดแย้งต้องไม่ถูกพาไปจ่าย (owner: ตรวจให้ตรงก่อน)
  const payable = rollup.filter((c) => c.canPay && c.cabinet);
  // ปุ่มรวมได้ก็ต่อเมื่อทุกตู้อยู่แท็บเดียวกัน — ข้ามแท็บติ๊กพร้อมกันไม่ได้ (หน้าเดียว = แท็บเดียว)
  const pages = new Set(payable.map((c) => c.payPage));
  const payAllHref =
    payable.length > 1 && pages.size === 1
      ? payHref(payable.map((c) => c.cabinet as string), payable[0].payPage, invoiceNo)
      : null;

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">ตรวจต่อ “ตู้” — ใบนี้เรียกเก็บตู้ไหนบ้าง</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            MOMO วางบิลเป็น <strong>แทรคกิ้ง</strong> แต่เราจ่ายเป็น <strong>ตู้</strong> — นี่คือยอดของใบรอบนี้ที่รวมเป็นรายตู้แล้ว
          </p>
        </div>
        {payAllHref && (
          <Link
            href={payAllHref}
            className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            → ตัดจ่ายค่าตู้ ({payable.length} ตู้ที่ตรวจผ่าน · ติ๊กให้แล้ว)
          </Link>
        )}
      </div>

      <div className="overflow-x-auto scrollbar-x-visible">
        <table className="w-full text-xs">
          <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
            <tr>
              <th className="px-2 py-2 text-left">ตู้</th>
              <th className="px-2 py-2 text-right">ใบรอบนี้เรียกเก็บ</th>
              <th className="px-2 py-2 text-right">ต้นทุนทั้งตู้ในระบบเรา</th>
              <th className="px-2 py-2 text-left">ผล / ต้องทำอะไร</th>
              <th className="px-2 py-2 text-right">ตัดจ่าย</th>
            </tr>
          </thead>
          <tbody>
            {rollup.map((c) => (
              <tr
                key={c.cabinet ?? "none"}
                className={`border-t border-border align-top ${
                  !c.canPay ? "bg-red-50/60" : c.partialRound ? "bg-orange-50/50" : ""
                }`}
              >
                <td className="px-2 py-2">
                  <span className="font-mono font-medium">{c.cabinet ?? "(ใบไม่ระบุตู้)"}</span>
                  {c.transportLabel && <span className="ml-1 text-muted">· {c.transportLabel}</span>}
                  {c.paid && <span className="ml-1 rounded bg-gray-200 px-1 text-[11px] text-gray-700">จ่ายแล้ว</span>}
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  <span className="font-semibold">฿{baht(c.invoiceTotal)}</span>
                  <div className="text-[11px] text-muted">{c.invoiceLines} แทรคกิ้ง</div>
                </td>
                <td className="px-2 py-2 text-right whitespace-nowrap">
                  {c.ourCostSum == null ? (
                    <span className="text-red-700">ไม่มีตู้นี้ในระบบ</span>
                  ) : (
                    <>
                      <span>฿{baht(c.ourCostSum)}</span>
                      <div className="text-[11px] text-muted">{c.ourRows} แถว</div>
                    </>
                  )}
                </td>
                <td className="px-2 py-2 text-[11px]">
                  {c.payBlockReason ? (
                    <span className="font-medium text-red-700">🔴 {c.payBlockReason}</span>
                  ) : c.partialRound ? (
                    <>
                      <span className="font-medium text-orange-700">
                        🔴 MOMO ยังบิลตู้นี้ไม่ครบ — บิลแค่ {c.invoiceLines} จาก {c.ourRows} แถว
                      </span>
                      <div className="mt-0.5 text-muted">
                        ส่วนต่าง ฿{baht(c.roundDiff)} คือของที่ MOMO <strong>ยังไม่ได้เรียกเก็บ</strong> (ระบบตั้งเป็น
                        ต้นทุนประเมินไว้ก่อน) · <strong>จ่ายรอบนี้ ฿{baht(c.invoiceTotal)} เท่านั้น</strong> อย่าจ่ายยอดทั้งตู้
                        <br />
                        ⚠️ ระบบให้ตัดจ่าย <strong>ตู้ละครั้งเดียว</strong> — จ่ายตู้นี้ตอนนี้แล้ว รอบหน้าที่ MOMO บิลส่วนที่เหลือ
                        จะบันทึกเข้าตู้นี้ไม่ได้ · ให้บัญชีเคาะก่อนว่าจะจ่ายเลย หรือรอ MOMO บิลครบ
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-green-700">✓ ตรวจผ่าน — ตัดจ่ายได้</span>
                      <div className="mt-0.5 text-muted">
                        ยอดที่ต้องจ่าย MOMO รอบนี้ = <strong>฿{baht(c.invoiceTotal)}</strong>
                        {c.roundDiff != null && Math.abs(c.roundDiff) > 0.02 && (
                          <>
                            {" · "}ต้นทุนในระบบยังต่างอยู่ ฿{baht(Math.abs(c.roundDiff))} —{" "}
                            {c.willApplyLines > 0
                              ? "กด “ยืนยันบันทึกต้นทุน” ก่อน แล้วยอดจะตรงกัน"
                              : "ตรวจกับทีมพัฒนา"}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  {c.canPay && c.cabinet ? (
                    <Link
                      href={payHref([c.cabinet], c.payPage, invoiceNo)}
                      className="inline-block whitespace-nowrap rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-700"
                      title={`เปิดหน้ารายงานตู้ + ติ๊กตู้ ${c.cabinet} ให้อัตโนมัติ`}
                    >
                      → ตัดจ่ายตู้นี้
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
  );
}

/** ผลของแถว — บอกสถานะ + สิ่งที่ต้องทำต่อ ในตาแรก (§0g). */
function RowOutcome({ r }: { r: MomoIngestPreviewRow }) {
  if (!r.matched) return <span className="font-medium text-red-700">🔴 ไม่พบในระบบ</span>;
  if (r.duplicateFid) return <span className="font-medium text-red-700">🔴 ชี้ซ้ำรายการเดียวกัน</span>;
  if (r.cabinetConflict) return <span className="font-medium text-red-700">🔴 ตู้ไม่ตรง — ยังบันทึกไม่ได้</span>;
  if (r.cabinetPaid) return <span className="text-orange-700">⏸ ข้าม (จ่ายค่าตู้แล้ว)</span>;
  if (r.willApply) return <span className="font-medium text-amber-700">จะบันทึกต้นทุน</span>;
  return <span className="text-green-700">✓ ตรงแล้ว</span>;
}

export function MomoInvoiceCostClient() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source | null>(null);
  const [preview, setPreview] = useState<MomoIngestPreview | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  /** ทุกครั้งที่เปลี่ยนแหล่งที่มา ต้องล้าง preview เก่าทิ้ง — กันกดบันทึกจากใบที่ไม่ได้ดูอยู่. */
  function resetTo(s: Source | null) {
    setMsg(null);
    setPreview(null);
    setSource(s);
  }

  function runPreview(s: Source) {
    resetTo(s);
    start(async () => {
      const res = await previewMomoInvoiceCost(sourcePayload(s));
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "อ่านไม่สำเร็จ" : res.error }); return; }
      setPreview(res.data);
      if (res.data.rows.length === 0) {
        setMsg({
          kind: "err",
          text: s.kind === "pdf"
            ? "อ่านไฟล์ได้ แต่ไม่พบรายการในใบ — ไฟล์นี้อาจไม่ใช่ใบแจ้งหนี้ MOMO หรือ MOMO เปลี่ยนรูปแบบใบ · แจ้งทีมพัฒนาพร้อมไฟล์"
            : "อ่านไม่พบรายการในใบแจ้งหนี้ — ตรวจรูปแบบข้อความที่วาง",
        });
      }
    });
  }

  async function handleFile(file: File) {
    if (!/\.pdf$/i.test(file.name)) {
      resetTo(null);
      setMsg({ kind: "err", text: `รองรับเฉพาะไฟล์ .pdf (ใบแจ้งหนี้ที่ MOMO ส่งมา) — ไฟล์ที่เลือกคือ "${file.name}"` });
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      resetTo(null);
      setMsg({ kind: "err", text: `ไฟล์ใหญ่เกินไป (${(file.size / 1024 / 1024).toFixed(1)} MB) — จำกัด 20 MB · ใบแจ้งหนี้ MOMO จริงประมาณ 0.2 MB ไฟล์นี้อาจไม่ใช่ใบแจ้งหนี้` });
      return;
    }
    let b64: string;
    try {
      b64 = await fileToBase64(file);
    } catch {
      resetTo(null);
      setMsg({ kind: "err", text: "อ่านไฟล์ไม่สำเร็จ — ลองเลือกไฟล์ใหม่อีกครั้ง" });
      return;
    }
    runPreview({ kind: "pdf", fileBase64: b64, fileName: file.name });
  }

  function doApply() {
    if (!preview || !source) return;
    const n = preview.summary.willApply;
    if (n === 0) { setMsg({ kind: "err", text: "ไม่มีรายการที่ต้องอัปเดต" }); return; }
    const blocked = preview.summary.blocked;
    // §0f — ยืนยันก่อนเขียนเงิน + บอกให้ครบว่าอะไรจะถูกข้าม (ไม่ใช่ "ผิดพลาด N" ลอยๆ)
    const warn = blocked > 0 ? `\n\n⚠️ มี ${blocked} บรรทัดที่ถูกบล็อกและจะไม่ถูกบันทึก (ตู้ไม่ตรง / ไม่พบในระบบ) — ดูเหตุผลรายบรรทัดในตาราง` : "";
    const from = source.kind === "pdf" ? `\nจากไฟล์: ${source.fileName}` : "";
    if (!window.confirm(`บันทึกต้นทุนจากใบแจ้งหนี้ MOMO ${preview.invoiceNo ?? ""}${from}\nจำนวน ${n} แทรคกิ้ง · รวม ฿${baht(preview.rows.filter((r) => r.willApply).reduce((a, r) => a + r.invoiceCost, 0))}\n(ตู้ที่จ่ายเงินแล้วจะถูกข้าม)${warn}\n\nยืนยันบันทึก?`)) return;
    setMsg(null);
    start(async () => {
      // ส่ง "แหล่งที่มา" กลับไป ไม่ใช่ผลที่อ่านได้ — server แกะ + คิดใหม่เองทั้งหมด (กติกาเงิน)
      const res = await applyMomoInvoiceCost(sourcePayload(source));
      if (!res.ok || !res.data) { setMsg({ kind: "err", text: res.ok ? "บันทึกไม่สำเร็จ" : res.error }); return; }
      setMsg({ kind: "ok", text: `บันทึกต้นทุนแล้ว ${res.data.applied} แทรคกิ้ง (ใบ ${res.data.invoiceNo ?? "-"}) · อัปใบรอบถัดไปได้เลย` });
      // refresh the preview to reflect the new currentCost
      const re = await previewMomoInvoiceCost(sourcePayload(source));
      if (re.ok && re.data) setPreview(re.data);
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
        <label className="block text-sm font-medium">อัปโหลดใบแจ้งหนี้ MOMO (ฮุย ไท่ต๋า) — ไฟล์ PDF</label>
        <p className="text-xs text-muted">
          MOMO ส่งไฟล์ใบแจ้งหนี้มาเป็นรอบๆ — ลากไฟล์ PDF มาวาง หรือกดเลือกไฟล์ได้เลย (ไม่ต้องเปิดไฟล์ก๊อปข้อความแล้ว)
          ระบบจะอ่านต้นทุนต่อแทรคกิ้ง (ราคา &quot;รวม (Total)&quot; = ต้นทุนจริงที่ MOMO เรียกเก็บ Pacred)
          แล้ว<strong>ตรวจกับระบบเราว่าตรงกันไหม</strong>ก่อนให้กดบันทึก · MOMO วางบิลมาเป็น <strong>แทรคกิ้ง</strong>{" "}
          แต่เราคิดเป็น <strong>ตู้</strong> — บรรทัดที่ตู้ไม่ตรงจะถูกบล็อกไว้ให้ตรวจก่อน
          · <strong>อัปทีละใบ</strong> เสร็จแล้วอัปใบถัดไปได้เลย (ระบบตรวจยอดรวมของแต่ละใบกับ Sub-total ของใบนั้น จึงต้องแยกใบ)
        </p>

        {/* ทางเข้าหลัก — ลาก/วาง หรือ กดเลือกไฟล์ (§0d) */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void handleFile(f);
          }}
          onClick={() => !pending && fileInputRef.current?.click()}
          className={`cursor-pointer rounded-xl border-2 border-dashed px-4 py-8 text-center transition ${
            dragOver ? "border-primary-500 bg-primary-50/60" : "border-border bg-surface-alt/30 hover:border-primary-400"
          } ${pending ? "pointer-events-none opacity-60" : ""}`}
        >
          <p className="text-sm font-medium">
            {pending ? "กำลังอ่านไฟล์…" : "ลากไฟล์ PDF มาวางที่นี่ หรือ คลิกเพื่อเลือกไฟล์"}
          </p>
          <p className="mt-1 text-[11px] text-muted">รับเฉพาะ .pdf · ไม่เกิน 20 MB</p>
          {source?.kind === "pdf" && !pending && (
            <p className="mt-2 text-[12px] font-medium text-green-700">📄 {source.fileName}</p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
            e.target.value = ""; // อัปไฟล์เดิมซ้ำได้ (เช่น หลังแก้ตู้ให้ตรงแล้ว)
          }}
        />

        {preview && preview.canApply && preview.summary.willApply > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={doApply}
              disabled={pending}
              className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:opacity-50"
            >
              ยืนยันบันทึกต้นทุน ({preview.summary.willApply} แทรคกิ้ง)
            </button>
          </div>
        )}

        {/* ทางสำรอง — เผื่อไฟล์เปิดไม่ได้/ยังไม่มีไฟล์ แต่มีข้อความ (ของเดิม ใช้ได้เหมือนเดิม) */}
        <details open={showPaste} onToggle={(e) => setShowPaste((e.currentTarget as HTMLDetailsElement).open)}>
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
            ไม่มีไฟล์ PDF? วางข้อความจากใบแทน (ทางสำรอง)
          </summary>
          <div className="mt-2 space-y-2">
            <p className="text-[11px] text-muted">
              เปิดไฟล์ PDF → เลือกข้อความทั้งหมด (Ctrl/Cmd+A) → คัดลอก → วางที่นี่ · ต้องวาง<strong>ทั้งใบรวมส่วนท้าย</strong>{" "}
              (ระบบต้องเห็นยอด &quot;ค่าขนส่งทั้งหมด (Sub-total)&quot; ถึงจะยอมให้บันทึก)
            </p>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={8}
              placeholder="วางข้อความใบแจ้งหนี้ที่นี่…"
              className="w-full rounded-lg border border-border bg-surface-alt/40 p-3 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => runPreview({ kind: "text", text })}
              disabled={pending || text.trim().length < 10}
              className="rounded-full bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50"
            >
              {pending ? "กำลังอ่าน…" : "ดูตัวอย่างจากข้อความที่วาง"}
            </button>
          </div>
        </details>

        {/* ประตูที่ 1 — Σ ต้องตรง Sub-total บนใบ */}
        {preview && !preview.reconciles && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">🔴 ยอดไม่ตรง Sub-total บนใบ — บันทึกต้นทุนไม่ได้</p>
            <p className="mt-1 text-[13px]">
              แกะได้ {preview.rows.length} บรรทัด รวม ฿{baht(preview.linesTotal)}
              {preview.subTotal == null
                ? ' · หายอด "ค่าขนส่งทั้งหมด (Sub-total)" บนใบไม่เจอ — กรุณาวางข้อความให้ครบทั้งใบ รวมส่วนท้าย'
                : ` vs Sub-total บนใบ ฿${baht(preview.subTotal)} · ต่างกัน ฿${baht(Math.abs(preview.subTotal - preview.linesTotal))}`}
            </p>
            <p className="mt-1 text-[13px]">
              แปลว่ามีบรรทัดตกหล่นหรือรูปแบบใบเปลี่ยน — ระบบปฏิเสธทั้งไฟล์เพื่อกันเขียนต้นทุนผิด แจ้งทีมพัฒนาพร้อมเลขที่ใบ
            </p>
          </div>
        )}

        {/* ประตูที่ 2 — ต้องรู้วิธีอ่านคอลัมน์คิวของใบนี้ก่อน (ไม่เดา) */}
        {preview && preview.reconciles && !preview.cbmBasisUsable && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <p className="font-semibold">🔴 อ่านวิธีคิดคิวของใบนี้ไม่ชัด — บันทึกต้นทุนไม่ได้</p>
            <p className="mt-1 text-[13px]">{preview.cbmBasisReason}</p>
            <p className="mt-1 text-[13px]">
              ยอดรวมตรง Sub-total ก็จริง แต่ถ้า MOMO คิดผิดเป็นเท่าตัว ยอดรวมของเขาก็จะตรงกับความผิดของเขาเอง —
              ระบบจึงไม่เดาสูตร แจ้งทีมพัฒนาพร้อมเลขที่ใบ
            </p>
          </div>
        )}

        {msg && (
          <div className={`rounded-lg px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {msg.text}
          </div>
        )}
      </section>

      {/* สรุปต่อตู้ + สะพานไปตัดจ่าย — วางไว้ "บน" ตารางราย-แทรคกิ้ง เพราะการจ่ายเกิดที่ระดับตู้ */}
      {preview && preview.rows.length > 0 && (
        <CabinetRollupCard rollup={preview.byCabinet} invoiceNo={preview.invoiceNo} />
      )}

      {preview && preview.rows.length > 0 && (
        <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold">ใบ {preview.invoiceNo ?? "-"}</span>
            <span className="text-muted">ยอดสุทธิบนใบ: ฿{baht(preview.grandTotal)}</span>
            {preview.whtThb != null && preview.whtThb > 0 && (
              <span className="text-muted" title="MOMO หักภาษี ณ ที่จ่าย 1% ไว้บนใบแล้ว — ยอดสุทธิคือยอดหลังหัก">
                หัก ณ ที่จ่าย 1%: ฿{baht(preview.whtThb)}
              </span>
            )}
            <span className={`rounded-full px-2 py-0.5 text-[11px] ${preview.reconciles ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {preview.reconciles ? `Σ ตรง Sub-total ฿${baht(preview.subTotal)} ✓` : "Σ ไม่ตรง Sub-total ✗"}
            </span>
            <span className="rounded-full bg-gray-100 text-gray-700 px-2 py-0.5 text-[11px]">ทั้งหมด {preview.summary.total}</span>
            <span className="rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[11px]">จับคู่ได้ {preview.summary.matched}</span>
            <span className="rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px]">จะบันทึก {preview.summary.willApply}</span>
            {preview.summary.unmatched > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px]">ไม่พบในระบบ {preview.summary.unmatched}</span>}
            {preview.summary.cabinetConflicts > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px]">ตู้ไม่ตรง (บล็อก) {preview.summary.cabinetConflicts}</span>}
            {preview.summary.duplicateBlocked > 0 && <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px]">ชี้ซ้ำ {preview.summary.duplicateBlocked}</span>}
            {preview.summary.cabinetUnlinked > 0 && <span className="rounded-full bg-sky-100 text-sky-700 px-2 py-0.5 text-[11px]">ยังไม่ผูกตู้ {preview.summary.cabinetUnlinked}</span>}
            {preview.summary.matchedViaBase > 0 && <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 text-[11px]">จับคู่แบบเลขเปล่า {preview.summary.matchedViaBase}</span>}
            {preview.summary.totalMismatches > 0 && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[11px]">ยอดไม่ตรงสูตร {preview.summary.totalMismatches}</span>}
            {preview.summary.paidSkipped > 0 && <span className="rounded-full bg-orange-100 text-orange-700 px-2 py-0.5 text-[11px]">ข้าม (จ่ายแล้ว) {preview.summary.paidSkipped}</span>}
          </div>

          {/* บอกบัญชีว่า "ระบบอ่านใบนี้เป็นแบบไหน" — ไม่ให้เป็นกล่องดำบนเส้นทางเงิน */}
          <div className="rounded-lg border border-border bg-surface-alt/40 px-3 py-2 text-[12px]">
            <span className="font-medium">ระบบอ่านใบนี้ว่า: </span>
            {preview.cbmBasis ? (
              <span className="font-semibold text-foreground">{CBM_BASIS_LABEL[preview.cbmBasis]}</span>
            ) : (
              <span className="text-muted">ไม่ต้องชี้ขาด</span>
            )}
            <span className="ml-1 text-muted">· {preview.cbmBasisReason}</span>
          </div>

          {preview.summary.cabinetConflicts > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              🔴 <strong>ตู้ไม่ตรง {preview.summary.cabinetConflicts} บรรทัด</strong> — MOMO วางบิลเป็นแทรคกิ้ง แต่เราคิดต้นทุนเป็นตู้
              บรรทัดที่ตู้ไม่ตรงจะ<strong>ไม่ถูกบันทึก</strong>จนกว่าจะตรวจให้ตรงกัน (บรรทัดอื่นบันทึกได้ตามปกติ) · ดูเหตุผลรายบรรทัดด้านล่าง
            </div>
          )}

          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-xs">
              <thead className="bg-surface-alt/50 text-[11px] uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-2 py-2 text-left">แทรคกิ้ง (บนใบ)</th>
                  <th className="px-2 py-2 text-left">ลูกค้า / ตู้ (ระบบเรา)</th>
                  <th className="px-2 py-2 text-right">คิว × เรท · กล่อง</th>
                  <th className="px-2 py-2 text-right">ต้นทุนปัจจุบัน</th>
                  <th className="px-2 py-2 text-right">ต้นทุนใบแจ้งหนี้</th>
                  <th className="px-2 py-2 text-left">ผล / ต้องทำอะไร</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={r.tracking}
                    className={`border-t border-border align-top ${
                      !r.matched || r.cabinetConflict || r.duplicateFid ? "bg-red-50/60" : r.willApply ? "bg-amber-50/40" : ""
                    }`}
                  >
                    <td className="px-2 py-2 font-mono">
                      {r.tracking}
                      {r.matchedVia === "bare_base" && (
                        <span
                          className="ml-1 rounded bg-violet-100 px-1 text-[11px] font-sans text-violet-700"
                          title={`MOMO บิลกล่องแรกของชุดแยก · ระบบเราเก็บเป็นเลขเปล่า "${r.matchedTracking}" (น้ำหนัก/คิว ตรงกัน จึงจับคู่ให้)`}
                        >
                          = {r.matchedTracking}
                        </span>
                      )}
                      {r.totalMismatch && (
                        <span
                          className="ml-1 text-orange-600"
                          title={`ยอดบนใบ ฿${baht(r.invoiceCost)} ไม่ตรงกับ ${r.cbm} × ${baht(r.unitPrice)} = ฿${baht(Math.round(r.cbm * r.unitPrice * 100) / 100)} — MOMO คิดเลขไม่ตรงสูตรของใบนี้ ตรวจกับ MOMO`}
                        >
                          ⚠ ยอดไม่ตรงสูตร
                        </span>
                      )}
                      {r.rateMissing && (
                        <span className="ml-1 text-[11px] text-muted" title="ใบพิมพ์เรทเป็น 0.00 — ตรวจยอดด้วยสูตรไม่ได้ (ยอดที่พิมพ์ยังเป็นบิลจริง)">
                          (ใบไม่ได้พิมพ์เรท)
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-[11px]">
                      {r.matched ? (
                        <>
                          <span className="font-medium">{r.userid ?? "-"}</span>
                          <span className="text-muted"> / {r.fcabinetnumber ?? "(ยังไม่ผูกตู้)"}</span>
                          {r.cabinetConflict && (
                            <div className="mt-0.5 font-medium text-red-700">ใบว่า {r.invoiceCabinet}</div>
                          )}
                          {r.cabinetUnlinked && (
                            <div className="mt-0.5 text-sky-700">ใบว่าตู้ {r.invoiceCabinet} — ยังไม่ผูก (บันทึกต้นทุนได้)</div>
                          )}
                        </>
                      ) : (
                        <span className="text-red-700">—{r.invoiceCabinet ? ` (ใบว่าตู้ ${r.invoiceCabinet})` : ""}</span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right text-muted whitespace-nowrap">
                      {r.cbm} × {baht(r.unitPrice)} · {r.qty} กล่อง
                    </td>
                    <td className="px-2 py-2 text-right">{baht(r.currentCost)}</td>
                    <td className="px-2 py-2 text-right font-semibold">{baht(r.invoiceCost)}</td>
                    <td className="px-2 py-2 text-[11px]">
                      <RowOutcome r={r} />
                      {r.blockReason && <div className="mt-0.5 text-muted">{r.blockReason}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
