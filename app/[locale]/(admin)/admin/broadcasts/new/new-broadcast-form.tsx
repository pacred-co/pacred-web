"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { adminCreateBroadcast } from "@/actions/admin/broadcasts";
import {
  BROADCAST_AUDIENCES, BROADCAST_AUDIENCE_LABEL,
  type BroadcastAudience,
} from "@/lib/validators/broadcast";

export function NewBroadcastForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title,       setTitle]       = useState("");
  const [body,        setBody]        = useState("");
  const [linkHref,    setLinkHref]    = useState("");
  const [audience,    setAudience]    = useState<BroadcastAudience>("all");
  const [audienceIds, setAudienceIds] = useState(""); // comma-sep
  const [err,         setErr]         = useState<string | null>(null);

  function fire() {
    setErr(null);
    const idList = audience === "specific_ids"
      ? audienceIds.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    startTransition(async () => {
      const res = await adminCreateBroadcast({
        title:        title.trim(),
        body:         body.trim(),
        link_href:    linkHref.trim() || undefined,
        audience,
        audience_ids: idList,
      });
      if (res.ok) {
        router.push(`/admin/broadcasts/${res.data!.id}`);
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => { e.preventDefault(); fire(); }}
    >
      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <Field label="หัวข้อ" required>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            placeholder="เช่น ปิดทำการสงกรานต์ 13-15 เม.ย."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <span className="text-[10px] text-muted">{title.length} / 200</span>
        </Field>

        <Field label="เนื้อหา" required>
          <textarea
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={2000}
            placeholder="เขียนข้อความที่ลูกค้าจะเห็นใน popup..."
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
          <span className="text-[10px] text-muted">{body.length} / 2000</span>
        </Field>

        <Field label="ลิงก์ปลายทาง (optional)">
          <input
            type="text"
            value={linkHref}
            onChange={(e) => setLinkHref(e.target.value)}
            maxLength={500}
            placeholder="/promo/songkran หรือ /dashboard"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
          />
        </Field>
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3">
        <Field label="กลุ่มลูกค้าเป้าหมาย" required>
          <select
            value={audience}
            onChange={(e) => setAudience(e.target.value as BroadcastAudience)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            {BROADCAST_AUDIENCES.map((a) => (
              <option key={a} value={a}>{BROADCAST_AUDIENCE_LABEL[a]}</option>
            ))}
          </select>
        </Field>

        {audience === "specific_ids" && (
          <Field label="Profile UUIDs (คั่นด้วย comma หรือ newline)">
            <textarea
              rows={4}
              value={audienceIds}
              onChange={(e) => setAudienceIds(e.target.value)}
              placeholder="uuid1, uuid2, uuid3"
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-mono"
            />
            <span className="text-[10px] text-muted">
              {audienceIds.split(/[\s,]+/).filter(Boolean).length} ลูกค้า
            </span>
          </Field>
        )}
      </section>

      <p className="text-[11px] text-muted">
        💡 บันทึกเป็น draft ก่อน → ในหน้า detail กด &quot;ส่งทันที&quot; หรือ &quot;กำหนดเวลา&quot;
      </p>

      {err && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      <div className="flex gap-3 pt-2 border-t border-border">
        <button
          type="submit"
          disabled={pending || title.trim().length === 0 || body.trim().length === 0}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ บันทึก draft + ไปหน้า detail"}
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
