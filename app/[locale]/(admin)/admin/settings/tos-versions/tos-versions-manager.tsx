"use client";

/**
 * V-G4 — admin client for TOS versions list + create + edit + activate.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTosVersion, updateTosVersion, activateTosVersion } from "@/actions/admin/tos-versions";
import { TOS_SCOPES, TOS_SCOPE_LABEL, type TosScope } from "@/lib/validators/tos-version";

export type TosVersionRow = {
  id:             string;
  version_no:     string;
  title:          string;
  body_md:        string;
  effective_from: string;
  applies_to:     TosScope;
  is_active:      boolean;
  created_at:     string;
  updated_at:     string;
};

type Props = {
  versions:         TosVersionRow[];
  acceptanceCounts: Record<string, number>;
};

export function TosVersionsManager({ versions, acceptanceCounts }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <CreateForm />
      {versions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-surface-alt/30 p-6 text-center text-sm text-muted">
          ยังไม่มีเวอร์ชัน TOS ใน DB — เพิ่มข้างบนเพื่อเริ่มต้น (V1 ไม่กระทบ customer-side gate)
        </p>
      ) : (
        <ul className="space-y-3">
          {versions.map((v) => (
            <VersionRow
              key={v.id}
              version={v}
              acceptanceCount={acceptanceCounts[v.id] ?? 0}
              editing={editingId === v.id}
              onEdit={() => setEditingId(v.id)}
              onCancelEdit={() => setEditingId(null)}
              onSaved={() => setEditingId(null)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Create form
// ────────────────────────────────────────────────────────────

function CreateForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [versionNo, setVersionNo] = useState("");
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [appliesTo, setAppliesTo] = useState<TosScope>("all");
  const [isActive, setIsActive] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setVersionNo(""); setTitle(""); setBodyMd("");
    setEffectiveFrom(todayIso()); setAppliesTo("all"); setIsActive(false); setErr(null);
  }

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await createTosVersion({
        version_no:     versionNo.trim(),
        title:          title.trim(),
        body_md:        bodyMd,
        effective_from: effectiveFrom,
        applies_to:     appliesTo,
        is_active:      isActive,
      });
      if (res.ok) {
        reset();
        setOpen(false);
        router.refresh();
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-dashed border-border bg-surface-alt/40 px-4 py-2 text-sm text-primary-600 hover:bg-surface-alt"
      >
        ➕ เพิ่มเวอร์ชัน TOS ใหม่
      </button>
    );
  }

  return (
    <form
      className="rounded-lg border border-border bg-surface-alt/40 p-4 space-y-3"
      onSubmit={(e) => { e.preventDefault(); fire(); }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Version no" required>
          <input
            type="text"
            value={versionNo}
            onChange={(e) => setVersionNo(e.target.value)}
            placeholder="v2.0 หรือ 2026-05-17"
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
            required
          />
        </Field>
        <Field label="Effective from" required>
          <input
            type="date"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
        </Field>
        <Field label="Applies to">
          <select
            value={appliesTo}
            onChange={(e) => setAppliesTo(e.target.value as TosScope)}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          >
            {TOS_SCOPES.map((s) => (
              <option key={s} value={s}>{TOS_SCOPE_LABEL[s]}</option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Title" required>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="ข้อตกลงและเงื่อนไข v2.0"
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          required
        />
      </Field>
      <Field label="Body (markdown)" required>
        <textarea
          rows={10}
          value={bodyMd}
          onChange={(e) => setBodyMd(e.target.value)}
          maxLength={200_000}
          placeholder="# ข้อตกลงและเงื่อนไข\n\n## 1. คำจำกัดความ\n..."
          className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-mono"
          required
        />
        <p className="text-[10px] text-muted">{bodyMd.length} / 200,000 ตัวอักษร · Markdown รองรับ (V-G4.1 จะ render เป็น HTML ในหน้าลูกค้า)</p>
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          className="accent-primary-600"
        />
        เปิดใช้งานทันทีหลังบันทึก (ยกเลิก active ของเวอร์ชันอื่นใน scope เดียวกัน)
      </label>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !versionNo.trim() || !title.trim() || !bodyMd.trim()}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ เพิ่มเวอร์ชัน"}
        </button>
        <button
          type="button"
          onClick={() => { reset(); setOpen(false); }}
          disabled={pending}
          className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
        >
          ยกเลิก
        </button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────
// Version row (view + activate + inline edit)
// ────────────────────────────────────────────────────────────

function VersionRow({
  version, acceptanceCount, editing, onEdit, onCancelEdit, onSaved,
}: {
  version:          TosVersionRow;
  acceptanceCount:  number;
  editing:          boolean;
  onEdit:           () => void;
  onCancelEdit:     () => void;
  onSaved:          () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState(version.title);
  const [bodyMd, setBodyMd] = useState(version.body_md);
  const [effectiveFrom, setEffectiveFrom] = useState(version.effective_from);
  const [appliesTo, setAppliesTo] = useState<TosScope>(version.applies_to);
  const [err, setErr] = useState<string | null>(null);

  function fireActivate() {
    setErr(null);
    startTransition(async () => {
      const res = await activateTosVersion(version.id);
      if (res.ok) router.refresh();
      else        setErr(translateError(res.error));
    });
  }

  function fireSave() {
    setErr(null);
    startTransition(async () => {
      const res = await updateTosVersion({
        id:             version.id,
        title,
        body_md:        bodyMd,
        effective_from: effectiveFrom,
        applies_to:     appliesTo,
      });
      if (res.ok) {
        onSaved();
        router.refresh();
      } else {
        setErr(translateError(res.error));
      }
    });
  }

  if (editing) {
    return (
      <li className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 space-y-3">
        <p className="text-xs font-bold">แก้ไข <span className="font-mono">{version.version_no}</span></p>
        <Field label="Title">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Effective from">
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Applies to">
            <select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as TosScope)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              {TOS_SCOPES.map((s) => (
                <option key={s} value={s}>{TOS_SCOPE_LABEL[s]}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Body (markdown)">
          <textarea
            rows={10}
            value={bodyMd}
            onChange={(e) => setBodyMd(e.target.value)}
            maxLength={200_000}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-xs font-mono"
          />
        </Field>
        {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={fireSave}
            disabled={pending}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {pending ? "กำลังบันทึก..." : "✓ บันทึก"}
          </button>
          <button
            type="button"
            onClick={() => {
              setTitle(version.title); setBodyMd(version.body_md);
              setEffectiveFrom(version.effective_from); setAppliesTo(version.applies_to);
              setErr(null);
              onCancelEdit();
            }}
            disabled={pending}
            className="rounded-lg border border-border bg-white px-4 py-2 text-sm hover:bg-surface-alt disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className={`rounded-2xl border p-4 ${version.is_active ? "border-green-200 bg-green-50/40" : "border-border bg-white dark:bg-surface"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1">
          <h3 className="font-bold flex items-center gap-2">
            <span className="font-mono text-sm">{version.version_no}</span>
            <span className="text-sm font-normal">{version.title}</span>
            {version.is_active && <span className="rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-[10px] text-green-800">ACTIVE</span>}
          </h3>
          <p className="text-xs text-muted">
            มีผลตั้งแต่ {new Date(version.effective_from).toLocaleDateString("th-TH")}
            {" · "}{TOS_SCOPE_LABEL[version.applies_to]}
            {" · "}<strong>{acceptanceCount}</strong> ลูกค้ายอมรับแล้ว
          </p>
        </div>
        <div className="flex gap-2">
          {!version.is_active && (
            <button
              type="button"
              onClick={fireActivate}
              disabled={pending}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50"
            >
              เปิดใช้งาน
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs hover:bg-surface-alt"
          >
            แก้ไข
          </button>
        </div>
      </div>
      {err && <p className="mt-2 text-xs text-red-700">{err}</p>}
      <details className="mt-3">
        <summary className="cursor-pointer text-xs text-muted hover:text-foreground">ดู body markdown</summary>
        <pre className="mt-2 rounded-lg bg-surface-alt/50 p-3 text-[11px] font-mono whitespace-pre-wrap max-h-96 overflow-y-auto">{version.body_md}</pre>
      </details>
    </li>
  );
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs text-muted">{label}{required && <span className="text-red-500">*</span>}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function translateError(code: string): string {
  if (code.startsWith("insert_failed"))           return `บันทึกล้มเหลว: ${code}`;
  if (code.startsWith("update_failed"))           return `อัพเดทล้มเหลว: ${code}`;
  if (code.startsWith("deactivate_others_failed"))return `ปิด active เวอร์ชันอื่นล้มเหลว: ${code}`;
  if (code.startsWith("activate_failed"))         return `เปิดใช้งานล้มเหลว: ${code}`;
  switch (code) {
    case "version_no_exists": return "version_no นี้มีอยู่แล้ว";
    case "not_found":         return "ไม่พบเวอร์ชัน";
    case "no_changes":        return "ไม่มีการเปลี่ยนแปลง";
    default:                  return code;
  }
}
