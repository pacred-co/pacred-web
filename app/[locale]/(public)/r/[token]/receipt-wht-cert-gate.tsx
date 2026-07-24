"use client";

/**
 * ReceiptWhtCertGate (ภูม 2026-06-10 · un-blocked 2026-06-14 · 🔒 RE-BLOCKED
 * 2026-07-24 — owner เคาะ: "ต้องตรวจ 50 ทวิก่อนปริ้น · สร้างรอไว้แล้วแค่ block การพิมพ์").
 *
 * ใบเสร็จนิติที่หัก 1%: ดูบนจอได้ (เช็คยอด/ใช้ออก 50 ทวิ) แต่ **พิมพ์/ดาวน์โหลดไม่ได้**
 * จนกว่าบัญชีจะตรวจรับใบ 50 ทวิ (approve/waive ที่ /admin/accounting/wht-certs).
 * การซ่อนกระดาษตอนพิมพ์ทำที่หน้าแม่ (print:hidden + หน้าแจ้ง print-only) — กด Cmd+P
 * เองก็ไม่ได้ใบเสร็จ. legacy PCS ไม่มี gate ในระบบ (จัดการนอกระบบ) — นี่คือ improvement
 * ที่ owner สั่ง.
 *
 * ไก่-กับ-ไข่ (เหตุที่เคยปลด 2026-06-14: ลูกค้าต้องเห็นยอดก่อนถึงออก 50 ทวิ ได้) แก้แล้ว
 * ด้วยฟอร์มกรอกให้ที่ /r/[token]/wht-form — ลูกค้าแค่ พิมพ์ฟอร์ม → เซ็น+ประทับตรา → แนบ.
 *
 * Images are compressed client-side (canvas, ≤1600px, q0.82) BEFORE base64 so we
 * never hit the 1MB server-action body limit (the documented Wave-23 trap). PDFs
 * pass through with a hard <900KB guard. `print:hidden` — never in the printout.
 */

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Upload, Clock, Loader2 } from "lucide-react";
import { uploadReceiptWhtCert } from "@/actions/receipt-wht-cert";

const MAX_SEND_BYTES = 900 * 1024; // keep the base64 payload under the 1MB action limit

/** Compress an image File to a JPEG data URL ≤1600px; pass PDFs through as-is. */
async function fileToDataUrl(file: File): Promise<string> {
  if (file.type === "application/pdf") {
    if (file.size > MAX_SEND_BYTES) throw new Error("ไฟล์ PDF ใหญ่เกินไป — ถ่ายรูปใบ 50 ทวิ แทนได้");
    return await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(new Error("อ่านไฟล์ไม่สำเร็จ"));
      r.readAsDataURL(file);
    });
  }
  // image → draw to a capped canvas → JPEG
  const bitmap = await createImageBitmap(file);
  const max = 1600;
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("ประมวลผลรูปไม่สำเร็จ");
  ctx.drawImage(bitmap, 0, 0, w, h);
  let q = 0.82;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (dataUrl.length * 0.75 > MAX_SEND_BYTES && q > 0.4) {
    q -= 0.12;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }
  return dataUrl;
}

export default function ReceiptWhtCertGate({
  token,
  status,
}: {
  token: string;
  status: "none" | "pending";
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [certNo, setCertNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const onPick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setBusy(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const res = await uploadReceiptWhtCert({ token, dataUrl, certNo: certNo.trim() || undefined });
      if (res.ok) {
        router.refresh();
      } else {
        setErr(res.error);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [token, certNo, router]);

  if (status === "pending") {
    return (
      <div className="no-print print:hidden mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 mb-3">
        <div className="flex items-start gap-3">
          <Clock className="h-5 w-5 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">แนบใบ 50 ทวิ แล้ว · รอบัญชีตรวจรับ</p>
            <p className="mt-0.5 text-amber-800">
              ตรวจผ่านเมื่อไร <b>ใบเสร็จจะพิมพ์/ดาวน์โหลดได้ทันที</b> — ไม่ต้องทำอะไรเพิ่ม
              ถ้าเอกสารไม่ผ่านเจ้าหน้าที่จะติดต่อกลับ
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="mt-2 text-xs font-medium text-amber-700 underline disabled:opacity-50"
            >
              {busy ? "กำลังอัปโหลด…" : "แนบไฟล์ใหม่"}
            </button>
            {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
          onChange={(e) => onPick(e.target.files?.[0])} />
      </div>
    );
  }

  return (
    <div className="no-print print:hidden mx-auto max-w-2xl rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 mb-3">
      <div className="flex items-start gap-3">
        <ShieldCheck className="h-6 w-6 mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1 text-sm">
          <p className="font-semibold text-amber-900">🔒 ใบเสร็จฉบับนี้ยังพิมพ์ไม่ได้ — ต้องแนบใบ 50 ทวิ ให้บัญชีตรวจก่อน</p>
          <p className="mt-0.5 text-amber-800">
            ใบเสร็จนี้มีการหักภาษี ณ ที่จ่าย 1% จึงต้องมี<b>หนังสือรับรองการหักภาษี (50 ทวิ)</b>
            ประกอบก่อนออกฉบับจริง · ดูยอดบนจอได้เลย · <b>3 ขั้น</b>: พิมพ์ฟอร์มด้านล่าง →
            เซ็นชื่อ+ประทับตรา → ถ่ายรูป/สแกนแนบกลับตรงนี้ — บัญชีตรวจแล้วพิมพ์ได้ทันที
          </p>

          <a
            href={`/r/${token}/wht-form`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border-2 border-emerald-500 bg-white px-4 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
          >
            📄 พิมพ์ฟอร์ม 50 ทวิ (กรอกข้อมูลให้แล้ว — แค่เซ็น+ประทับตรา)
          </a>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="text"
              value={certNo}
              onChange={(e) => setCertNo(e.target.value)}
              placeholder="เลขที่ 50 ทวิ (ถ้ามี)"
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-amber-300 sm:w-48"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {busy ? "กำลังอัปโหลด…" : "แนบใบ 50 ทวิ (รูป/PDF)"}
            </button>
          </div>
          {err && <p className="mt-1.5 text-xs font-medium text-red-700">{err}</p>}
        </div>
      </div>
      <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])} />
    </div>
  );
}
