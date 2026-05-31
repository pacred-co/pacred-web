"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateBroadcast } from "@/actions/admin/broadcasts";

/**
 * Faithful create form for a `tb_notify` popup (legacy `popup/add.php`).
 *
 * Legacy fields: title (ชื่อเรื่องประกาศ) · dateStart (วันเริ่มต้นการแสดงผล) ·
 * dateExp (วันหมดอายุการแสดงผล) · content (รูปภาพสำหรับ Popup — image filename) ·
 * url (ลิงก์อ่านเพิ่มเติม). We keep `content` as a short text-line OR image URL
 * (varchar(100)); image upload to storage is a follow-up (Pacred-design polish).
 *
 * The legacy popup is shown to ALL active customers — there is no audience
 * picker (the old rebuilt one is dropped, see actions/admin/broadcasts.ts).
 */
export function NewBroadcastForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title,     setTitle]     = useState("");
  const [content,   setContent]   = useState("");
  const [url,       setUrl]       = useState("");
  const [dateStart, setDateStart] = useState(""); // datetime-local
  const [dateExp,   setDateExp]   = useState(""); // datetime-local
  const [err,       setErr]       = useState<string | null>(null);

  function localToIso(v: string): string | undefined {
    if (!v) return undefined;
    const d = new Date(v); // datetime-local is interpreted in the browser TZ
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
  }

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await adminCreateBroadcast({
        title:     title.trim(),
        content:   content.trim() || undefined,
        url:       url.trim() || undefined,
        datestart: localToIso(dateStart),
        dateexp:   localToIso(dateExp),
      });
      if (res.ok) {
        router.push(`/admin/broadcasts/${res.data!.id}`);
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); fire(); }}>
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <Field label="ชื่อเรื่องประกาศ" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={400}
            placeholder="เช่น ปิดทำการสงกรานต์ 13-15 เม.ย."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <span className="text-[10px] text-muted">{title.length} / 400</span>
        </Field>

        <Field label="ข้อความ / ลิงก์รูปภาพสำหรับ Popup">
          <input
            type="text"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={100}
            placeholder="ข้อความสั้น หรือ URL รูป https://…/promo.jpg"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
          <span className="text-[10px] text-muted">
            {content.length} / 100 — ถ้าเป็น URL รูป (.png/.jpg) จะแสดงเป็นรูปใน popup
          </span>
        </Field>

        <Field label="ลิงก์ปลายทาง (optional)">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            maxLength={400}
            placeholder="/promo/songkran หรือ https://…"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
          />
        </Field>
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <h2 className="text-sm font-bold">ช่วงเวลาแสดงผล</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="วันเริ่มแสดงผล">
            <input
              type="datetime-local"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="วันหมดอายุการแสดงผล">
            <input
              type="datetime-local"
              value={dateExp}
              onChange={(e) => setDateExp(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </Field>
        </div>
        <p className="text-[11px] text-muted">
          เว้นว่าง = แสดงตั้งแต่ตอนนี้ ยาว 1 ปี.
        </p>
      </section>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] text-blue-800">
        📢 ประกาศนี้จะแสดงให้ <strong>ลูกค้าทุกคน</strong> เห็นตอน login (ไม่มีการเลือกกลุ่ม — ตรงกับระบบเดิม).
      </div>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex gap-3 pt-2 border-t border-border">
        <button
          type="submit"
          disabled={pending || title.trim().length === 0}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ บันทึก Pop-up"}
        </button>
        <button
          type="button"
          onClick={() => history.back()}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-5 py-2.5 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}{required && <span className="text-red-500">*</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function translateError(code: string): string {
  if (code.startsWith("insert_failed")) return `บันทึกล้มเหลว: ${code}`;
  return code;
}
