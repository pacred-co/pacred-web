"use client";

/**
 * อี้อู upload-2 — packing list → ผูกตู้ + advance status (MONEY-FREE · ภูม 2026-07-16).
 *
 * Upload the packing list → PREVIEW (writes nothing, shows exactly what will change) →
 * "ผูกตู้ + อัปเดตสถานะ" → applyYiwuPacking. No basis write, no reprice — only the
 * container gets assigned (to empty-cabinet rows) and fstatus advances 1/2 → 3.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CustomerCodeLink } from "@/components/admin/customer-code-link";
import {
  previewYiwuPacking,
  applyYiwuPacking,
  type YiwuReconcileSummary,
  type YiwuBaseResult,
} from "@/actions/admin/yiwu-packing-reconcile";
import { addYiwuDeliveryNoteShipments } from "@/actions/admin/yiwu-delivery-note";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";

const n2 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
const n3 = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: 6 }));
// ก×ย×ส (ซม.) ของกล่องแรก — "—" ถ้าไฟล์ไม่มีขนาด
const dims = (w?: number | null, l?: number | null, h?: number | null) =>
  w == null && l == null && h == null ? "—" : `${w ?? "?"}×${l ?? "?"}×${h ?? "?"}`;

// keep `new Date()` out of render (Next 16 react-hooks/purity)
function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// A base is CREATE-ELIGIBLE only when reconcile skipped it because it isn't in the
// system at all ("ไม่พบออเดอร์ในระบบ" = "ของเราแต่ CS ลืมคีย์" or "ไม่ใช่ของเรา"). We do
// NOT offer create for cross-customer collisions ("ชนข้ามลูกค้า") nor read errors
// ("อ่านไม่สำเร็จ") — those are data problems, not a missing arrival row. We also need
// measurements to build the shipment payload (must have box + at least one of น้ำหนัก/คิว).
const NOT_IN_SYSTEM_REASON = "ไม่พบออเดอร์ในระบบ";
function isCreateEligible(r: YiwuBaseResult): boolean {
  if (r.ok || !r.skipped) return false;
  if (!(r.reason ?? "").startsWith(NOT_IN_SYSTEM_REASON)) return false;
  const boxes = Number(r.boxes ?? 0);
  const hasMeasure = Number(r.weight ?? 0) > 0 || Number(r.cbm ?? 0) > 0;
  return boxes >= 1 && hasMeasure;
}

// per-base create outcome shown inline in the row (สำเร็จ/ซ้ำ/error).
type CreateOutcome = { kind: "ok" | "skip" | "error"; msg: string };

export function YiwuPackingClient() {
  const { confirm, dialogs } = useConfirmDialogs();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<YiwuReconcileSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [applying, startApply] = useTransition();
  const [result, setResult] = useState<YiwuReconcileSummary | null>(null);

  // "เอาเข้าระบบ" (สร้าง tb_forwarder อี้อู จาก packing) — per-base PR input + outcome.
  const [prByBase, setPrByBase] = useState<Record<string, string>>({});
  const [createOutcome, setCreateOutcome] = useState<Record<string, CreateOutcome>>({});
  const [creatingBase, setCreatingBase] = useState<string | null>(null);
  const [, startCreate] = useTransition();

  // สร้าง shipment อี้อู 1 ตัว จาก base ที่ยังไม่มีในระบบ — REUSE addYiwuDeliveryNoteShipments
  // (GUARD 1 กันซ้ำ · GUARD 2 validate PR · box-split · auto-price ครบใน action นั้น). เรา
  // ไม่เขียน INSERT/เงินใหม่เลย. 1 shipment = 1 row (base อี้อูไม่มี "-N" split ในไฟล์).
  async function onCreate(r: YiwuBaseResult) {
    const base = r.base;
    const pr = (prByBase[base] ?? "").trim().toUpperCase();
    if (!/^PR\d+$/.test(pr)) {
      setCreateOutcome((m) => ({ ...m, [base]: { kind: "error", msg: "กรอกรหัสลูกค้า (PR ตามด้วยตัวเลข) ให้ถูกต้อง" } }));
      return;
    }
    const container = ((result ?? preview)?.container ?? "").trim();
    const ok = await confirm(
      `ยืนยันเอา ${base} เข้าระบบ?\n\n` +
      `• ลูกค้า: ${pr}\n` +
      `• ${r.boxes ?? "?"} กล่อง · ${n2(r.weight)} กก. · ${n3(r.cbm)} คิว` +
      (container ? `\n• อ้างอิงตู้: ${container}` : "") +
      `\n• สถานะเริ่มต้น: ถึงโกดังจีนแล้ว (อี้อู) — ระบบตั้งราคาให้อัตโนมัติ\n\n` +
      `ถ้าเลขนี้มีในระบบแล้ว ระบบจะข้ามให้ (กันสร้างซ้ำ). หลังเข้าระบบแล้ว ` +
      `ให้อัป/พรีวิวไฟล์ packing นี้ซ้ำ เพื่อผูกตู้ + เลื่อนสถานะเป็น "กำลังส่งมาไทย".`,
    );
    if (!ok) return;

    setCreatingBase(base);
    setCreateOutcome((m) => { const n = { ...m }; delete n[base]; return n; });
    startCreate(async () => {
      try {
        const res = await addYiwuDeliveryNoteShipments([
          {
            orderNo: base,
            memberCode: pr,
            arrivalDate: todayIsoDate(),
            packingId: container || undefined,
            rows: [
              {
                boxCount: Number(r.boxes) || 1,
                weightKg: Number(r.weight) || 0,
                lengthCm: Number(r.length) || 0,
                widthCm: Number(r.width) || 0,
                heightCm: Number(r.height) || 0,
                cbm: Number(r.cbm) || 0,
                productType: "",
              },
            ],
          },
        ]);
        if (!res.ok) {
          setCreateOutcome((m) => ({ ...m, [base]: { kind: "error", msg: res.error } }));
          return;
        }
        const one = res.data?.results?.[0];
        if (one?.ok) {
          setCreateOutcome((m) => ({ ...m, [base]: { kind: "ok", msg: `เข้าระบบแล้ว (${one.fids?.length ?? 0} แถว)` } }));
          router.refresh();
        } else if (one?.skipped) {
          setCreateOutcome((m) => ({ ...m, [base]: { kind: "skip", msg: one.error ?? "มีในระบบแล้ว (ข้าม)" } }));
        } else {
          setCreateOutcome((m) => ({ ...m, [base]: { kind: "error", msg: one?.error ?? "ไม่สำเร็จ — ลองใหม่" } }));
        }
      } catch {
        setCreateOutcome((m) => ({ ...m, [base]: { kind: "error", msg: "เกิดข้อผิดพลาด — ลองใหม่" } }));
      } finally {
        setCreatingBase(null);
      }
    });
  }

  async function onPick(file: File | null) {
    setErr(null); setPreview(null); setResult(null);
    if (!file) { setFileName(""); return; }
    setFileName(file.name);
    setPreviewing(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await previewYiwuPacking(fd);
      if (!res.ok) setErr(res.error);
      else if (res.data) setPreview(res.data);
    } catch {
      setErr("อ่านไฟล์ไม่สำเร็จ — ลองใหม่");
    } finally {
      setPreviewing(false);
    }
  }

  async function onApply() {
    if (!preview) return;
    const ok = await confirm(
      `ยืนยันผูกตู้ + อัปเดตสถานะ?\n\n` +
      `• ตู้: ${preview.container || "(ไม่มีในไฟล์)"}\n` +
      `• ผูกตู้ให้ ${preview.assigned} แถว · เลื่อนเป็น “กำลังส่งมาไทย” ${preview.advanced} แถว\n` +
      (preview.skipped > 0 ? `• ข้าม ${preview.skipped} เลข (ดูเหตุผลในตาราง)\n` : "") +
      `\nงานนี้ไม่แตะน้ำหนัก/ราคา (มาจากใบส่งของแล้ว)`,
    );
    if (!ok) return;
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr("ไฟล์หาย — เลือกใหม่"); return; }
    startApply(async () => {
      setErr(null);
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await applyYiwuPacking(fd);
        if (!res.ok) setErr(res.error);
        else if (res.data) { setResult(res.data); setPreview(null); }
      } catch {
        setErr("อัปเดตไม่สำเร็จ — ลองใหม่");
      }
    });
  }

  const shown = result ?? preview;
  const eligibleCount = shown?.results.filter(isCreateEligible).length ?? 0;

  return (
    <section className="rounded-2xl border border-gray-200 bg-surface p-5 shadow-sm">
      <div className="mb-1 flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-xl bg-sky-600 text-white shadow-sm">📦</span>
        <h2 className="text-base font-semibold">ขั้นตอน 2 · จับคู่ packing list (ผูกตู้ + กำลังส่งมาไทย)</h2>
      </div>
      <p className="mb-3 text-[12px] text-muted">
        อัปไฟล์ packing list (.xlsx) ที่พนักงานทำ → ระบบจับคู่เลข 单号 กับออเดอร์ที่อัปใบส่งของไว้ →
        ผูกเลขตู้ + เลื่อนสถานะเป็น <strong>กำลังส่งมาไทย</strong>.{" "}
        <span className="text-sky-700">ไม่แตะน้ำหนัก/ราคา (มาจากใบส่งของแล้ว) — ปลอดภัย 100%</span>
      </p>

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-4 py-2 text-sm font-medium text-sky-800 hover:bg-sky-100">
        <span>📄 เลือกไฟล์ packing list (.xlsx)</span>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </label>
      {fileName && <span className="ml-2 text-[12px] text-muted">{fileName}</span>}
      {previewing && <p className="mt-2 text-[12px] text-sky-700">⏳ กำลังอ่าน + จับคู่…</p>}
      {err && <p className="mt-2 rounded-lg bg-red-50 px-3 py-1.5 text-[12px] text-red-700">⚠ {err}</p>}

      {shown && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-lg bg-gray-100 px-3 py-1 font-medium">
              ตู้: {shown.container || "— (ไม่พบในไฟล์)"}
            </span>
            <span className="rounded-lg bg-emerald-600 px-3 py-1 font-medium text-white">
              {result ? "ผูกตู้แล้ว" : "จะผูกตู้"} {shown.assigned} แถว
            </span>
            <span className="rounded-lg bg-teal-600 px-3 py-1 font-medium text-white">
              {result ? "เลื่อนแล้ว" : "จะเลื่อน"} {shown.advanced} แถว
            </span>
            {shown.skipped > 0 && (
              <span className="rounded-lg bg-amber-500 px-3 py-1 font-medium text-white">ข้าม {shown.skipped} เลข</span>
            )}
            {eligibleCount > 0 && (
              <span className="rounded-lg bg-rose-600 px-3 py-1 font-medium text-white">ยังไม่มีในระบบ {eligibleCount} เลข (กรอก PR → เอาเข้าระบบ)</span>
            )}
          </div>

          <p className="mb-1.5 text-[11px] text-muted">
            กล่อง/น้ำหนัก/ขนาด/คิว = ข้อมูลจากไฟล์ packing (กางให้ตรวจ · ไม่ได้เอาไปคิดเงิน · ขนาด = กล่องแรก) · ผูกตู้/เลื่อนสถานะ = สิ่งที่ระบบจะทำ
          </p>
          {eligibleCount > 0 && (
            <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] leading-relaxed text-rose-800">
              <strong>เลขที่ยังไม่มีในระบบ</strong> = ของเราแต่ CS ลืมคีย์ใบส่งของ <em>หรือ</em> ไม่ใช่ของเรา (ของบริษัทอื่นในตู้รวม).
              ถ้าเป็นของเรา → <strong>กรอก PR แล้วกด “เอาเข้าระบบ”</strong> เพื่อสร้างรายการอี้อูจากข้อมูล packing (มีตัวกันสร้างซ้ำ).
              <strong>ถ้าไม่ใช่ของเรา / ไม่แน่ใจ = ปล่อยไว้</strong> ไม่ต้องกรอก. หลังเอาเข้าระบบแล้ว
              ให้ <strong>อัป/พรีวิวไฟล์ packing นี้ซ้ำ</strong> เพื่อผูกตู้ + เลื่อนสถานะเป็น “กำลังส่งมาไทย” (การเอาเข้าระบบสร้างได้แค่สถานะ “ถึงโกดังจีน”).
            </div>
          )}
          <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-gray-200">
            <table className="w-full min-w-[880px] border-collapse text-[13px] [&_td]:border [&_th]:border [&_td]:border-gray-200 [&_th]:border-gray-200">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] text-muted">
                  <th className="px-2.5 py-1.5 font-medium">เลข 单号</th>
                  <th className="px-2.5 py-1.5 font-medium">ลูกค้า</th>
                  <th className="px-2.5 py-1.5 font-medium">กล่อง</th>
                  <th className="px-2.5 py-1.5 font-medium">น้ำหนัก(กก.)</th>
                  <th className="px-2.5 py-1.5 font-medium">ขนาด ก×ย×ส(ซม.)</th>
                  <th className="px-2.5 py-1.5 font-medium">คิว(CBM)</th>
                  <th className="px-2.5 py-1.5 font-medium">พบในระบบ</th>
                  <th className="px-2.5 py-1.5 font-medium">ผูกตู้</th>
                  <th className="px-2.5 py-1.5 font-medium">เลื่อนสถานะ</th>
                  <th className="px-2.5 py-1.5 font-medium">หมายเหตุ</th>
                  {eligibleCount > 0 && <th className="px-2.5 py-1.5 font-medium">เอาเข้าระบบ (ถ้าเป็นของเรา)</th>}
                </tr>
              </thead>
              <tbody>
                {shown.results.map((r, i) => {
                  const eligible = isCreateEligible(r);
                  const outcome = createOutcome[r.base];
                  const created = outcome?.kind === "ok";
                  return (
                  <tr key={i} className="odd:bg-white even:bg-gray-50/60">
                    <td className="px-2.5 py-1.5 font-medium">{r.base}</td>
                    <td className="px-2.5 py-1.5"><CustomerCodeLink code={r.userid} /></td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{r.boxes ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{n2(r.weight)}</td>
                    <td className="px-2.5 py-1.5 text-right font-mono text-[12px] tabular-nums">{dims(r.width, r.length, r.height)}</td>
                    <td className="px-2.5 py-1.5 text-right tabular-nums">{n3(r.cbm)}</td>
                    <td className="px-2.5 py-1.5 text-center tabular-nums">{r.matched ?? "—"}</td>
                    <td className="px-2.5 py-1.5 text-center tabular-nums">{r.cabinetAssigned || "—"}</td>
                    <td className="px-2.5 py-1.5 text-center tabular-nums">{r.advanced || "—"}</td>
                    <td className="px-2.5 py-1.5">
                      {r.ok
                        ? <span className="text-emerald-700">✓ {result ? "ทำแล้ว" : "พร้อม"}</span>
                        : <span className="text-amber-700">⊘ {r.reason}</span>}
                    </td>
                    {eligibleCount > 0 && (
                      <td className="px-2.5 py-1.5">
                        {eligible ? (
                          created ? (
                            <span className="text-[12px] font-medium text-emerald-700">✓ {outcome.msg}</span>
                          ) : (
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-1.5">
                                <input
                                  value={prByBase[r.base] ?? ""}
                                  onChange={(e) => setPrByBase((m) => ({ ...m, [r.base]: e.target.value }))}
                                  placeholder="PR172"
                                  autoComplete="off"
                                  disabled={creatingBase === r.base}
                                  className="w-24 rounded-md border border-gray-300 px-2 py-1 text-[13px] uppercase focus:border-rose-500 focus:ring-1 focus:ring-rose-500 disabled:opacity-60"
                                />
                                <button
                                  type="button"
                                  onClick={() => onCreate(r)}
                                  disabled={creatingBase === r.base}
                                  className="shrink-0 rounded-md bg-rose-600 px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
                                >
                                  {creatingBase === r.base ? "⏳…" : "＋ เอาเข้าระบบ"}
                                </button>
                              </div>
                              {outcome && outcome.kind !== "ok" && (
                                <span className={`text-[11px] ${outcome.kind === "skip" ? "text-amber-700" : "text-red-600"}`}>
                                  {outcome.kind === "skip" ? "⊘" : "⚠"} {outcome.msg}
                                </span>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="text-[11px] text-muted">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!result && (
            <button
              type="button"
              onClick={onApply}
              disabled={applying || (preview?.assigned === 0 && preview?.advanced === 0)}
              className="mt-3 rounded-xl bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
            >
              {applying ? "⏳ กำลังผูกตู้…" : "🔗 ผูกตู้ + อัปเดตสถานะ"}
            </button>
          )}
          {result && (
            <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
              ✅ เสร็จ — ผูกตู้ {result.assigned} แถว · เลื่อนเป็นกำลังส่งมาไทย {result.advanced} แถว
              {result.skipped > 0 ? ` · ข้าม ${result.skipped} เลข` : ""}
            </p>
          )}
        </div>
      )}

      {dialogs}
    </section>
  );
}
