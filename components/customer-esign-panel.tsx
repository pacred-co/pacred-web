"use client";

/**
 * ช่องแนบ "ลายเซ็น + ตรายางอิเล็กทรอนิกส์" ใน profile ลูกค้า (owner 2026-07-24).
 *
 * เก็บเป็น data ประจำบัญชี → เอกสารดึงไปใช้เอง (ตัวแรก = ฟอร์ม 50 ทวิ:
 * แปะลงช่อง "ลงชื่อผู้จ่ายเงิน" + "ประทับตรานิติบุคคล" ให้เลย ไม่ต้องเซ็นมือทุกใบ).
 *
 * §0f confirm-before-mutate: ลบต้องยืนยันก่อน · อัพโหลดมี preview + ผลลัพธ์ชัด.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { uploadMyEsign, removeMyEsign, type EsignKind } from "@/actions/customer-esign";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { compressImageFile } from "@/lib/image-compress";

function Slot({
  kind,
  title,
  hint,
  previewUrl,
}: {
  kind: EsignKind;
  title: string;
  hint: string;
  previewUrl: string | null;
}) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const onFile = (file: File | null) => {
    if (!file) return;
    setMsg(null);
    startTransition(async () => {
      // บีบรูปฝั่ง browser ก่อน (ลายเซ็นจากกล้องมือถือ = หลาย MB · fail-soft ใช้ไฟล์เดิม)
      const compact = await compressImageFile(file).catch(() => file);
      const fd = new FormData();
      fd.set("file", compact);
      const res = await uploadMyEsign(kind, fd);
      if (res.ok) {
        setMsg("✅ บันทึกแล้ว — เอกสารที่ออกหลังจากนี้จะใช้รูปนี้อัตโนมัติ");
        router.refresh();
      } else {
        setMsg(`❌ ${res.error}`);
      }
    });
  };

  const onRemove = () => {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setConfirmRemove(false);
    startTransition(async () => {
      const res = await removeMyEsign(kind);
      setMsg(res.ok ? "ลบแล้ว" : `❌ ${res.error}`);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="rounded-xl border border-border bg-surface/50 p-4">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-0.5 text-[11px] text-muted">{hint}</p>

      {previewUrl ? (
        <div className="mt-3 flex items-center gap-3">
          {/* พื้นตารางหมากรุกให้เห็นขอบรูปโปร่งใส */}
          <div
            className="rounded-lg border border-border p-1"
            style={{
              backgroundImage:
                "linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%),linear-gradient(45deg,#eee 25%,transparent 25%,transparent 75%,#eee 75%)",
              backgroundSize: "12px 12px",
              backgroundPosition: "0 0,6px 6px",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt={title} className="h-20 max-w-[220px] object-contain" />
          </div>
          <button
            type="button"
            onClick={onRemove}
            disabled={busy}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              confirmRemove
                ? "border-red-400 bg-red-50 text-red-700"
                : "border-border text-muted hover:bg-surface"
            }`}
          >
            {confirmRemove ? "กดอีกครั้งเพื่อยืนยันลบ" : "🗑 ลบรูปนี้"}
          </button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-muted">ยังไม่ได้ตั้งค่า</p>
      )}

      <div className="mt-3">
        <StyledFileInput
          accept="image/png,image/jpeg,image/webp"
          disabled={busy}
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          label={busy ? "กำลังอัพโหลด…" : previewUrl ? "เปลี่ยนรูป" : "อัพโหลดรูป"}
        />
      </div>
      {msg ? <p className="mt-2 text-xs">{msg}</p> : null}
    </div>
  );
}

export function CustomerEsignPanel({
  signatureUrl,
  stampUrl,
}: {
  signatureUrl: string | null;
  stampUrl: string | null;
}) {
  return (
    <section className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
      <h3 className="text-base font-bold text-foreground">
        ✍️ ลายเซ็น + ตรายางอิเล็กทรอนิกส์
      </h3>
      <p className="mt-1 text-xs text-muted">
        ตั้งค่าครั้งเดียว — ระบบจะแปะให้อัตโนมัติบนเอกสารที่ต้องเซ็น เช่น
        <strong> ฟอร์มใบหัก ณ ที่จ่าย (50 ทวิ)</strong> ไม่ต้องพิมพ์ออกมาเซ็นมือทุกใบ
        · รูปถูกเก็บแบบส่วนตัว (เปิดดูได้เฉพาะบัญชีคุณและเจ้าหน้าที่)
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Slot
          kind="signature"
          title="ลายเซ็นผู้มีอำนาจ"
          hint="เซ็นบนกระดาษขาว ถ่ายรูปให้ชัด หรือไฟล์ PNG พื้นโปร่งใสยิ่งดี"
          previewUrl={signatureUrl}
        />
        <Slot
          kind="stamp"
          title="ตรายางบริษัท (นิติบุคคล)"
          hint="ประทับบนกระดาษขาว ถ่ายรูปตรงๆ ให้เต็มดวง"
          previewUrl={stampUrl}
        />
      </div>
    </section>
  );
}
