"use client";

/**
 * V-G5 — admin CRUD for one kind of org_contacts. Renders inside a tab.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createOrgContact, updateOrgContact, deleteOrgContact } from "@/actions/admin/org-contacts";
import type { OrgContactKind } from "@/lib/validators/org-contact";

type Row = {
  id:             string;
  kind:           OrgContactKind;
  label:          string;
  value:          string;
  department:     string | null;
  is_active:      boolean;
  display_order:  number;
  notes:          string | null;
  created_at:     string;
  updated_at:     string;
};

type Props = {
  kind:        OrgContactKind;
  initialRows: Row[];
};

export function ContactsManager({ kind, initialRows }: Props) {
  return (
    <div className="space-y-4">
      <NewRowForm kind={kind} />
      <RowsTable rows={initialRows} />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// New row form (collapsible)
// ────────────────────────────────────────────────────────────

function NewRowForm({ kind }: { kind: OrgContactKind }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [department, setDepartment] = useState("");
  const [order, setOrder] = useState<number>(0);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setLabel(""); setValue(""); setDepartment(""); setOrder(0); setErr(null);
  }

  function fire() {
    setErr(null);
    startTransition(async () => {
      const res = await createOrgContact({
        kind,
        label,
        value,
        department: department.trim() || undefined,
        display_order: order,
        is_active: true,
      });
      if (res.ok) {
        reset();
        setOpen(false);
        router.refresh();
      } else {
        setErr(res.error);
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
        ➕ เพิ่มข้อมูลติดต่อ
      </button>
    );
  }

  return (
    <form
      className="rounded-lg border border-border bg-surface-alt/40 p-4 space-y-3"
      onSubmit={(e) => { e.preventDefault(); fire(); }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Label (ป้ายชื่อ)" required>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder='เช่น "ฝ่ายขาย", "Cargo line"'
            maxLength={120}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
        </Field>
        <Field label="Value (ค่า)" required>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='เช่น "sales@pacred.co", "02-421-3325"'
            maxLength={500}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
            required
          />
        </Field>
        <Field label="Department (กลุ่ม, optional)">
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder='เช่น "ขาย", "บัญชี"'
            maxLength={80}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm"
          />
        </Field>
        <Field label="Display order (ลำดับ)">
          <input
            type="number"
            min={0}
            max={9999}
            value={order}
            onChange={(e) => setOrder(Math.max(0, Number(e.target.value) || 0))}
            className="w-32 rounded-lg border border-border bg-white px-3 py-2 text-sm font-mono"
          />
        </Field>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || !label.trim() || !value.trim()}
          className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {pending ? "กำลังบันทึก..." : "✓ เพิ่ม"}
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
// Rows table
// ────────────────────────────────────────────────────────────

function RowsTable({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface-alt/30 p-6 text-center text-sm text-muted">
        ยังไม่มีข้อมูล — กด &quot;เพิ่มข้อมูลติดต่อ&quot; ด้านบนเพื่อเริ่มต้น
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-alt/50 text-xs uppercase tracking-wide text-muted">
          <tr className="text-left">
            <th className="px-3 py-2 w-16">ลำดับ</th>
            <th className="px-3 py-2">Label</th>
            <th className="px-3 py-2">Value</th>
            <th className="px-3 py-2 w-32">Department</th>
            <th className="px-3 py-2 w-24">Active</th>
            <th className="px-3 py-2 w-28"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => <RowEditor key={r.id} row={r} />)}
        </tbody>
      </table>
    </div>
  );
}

function RowEditor({ row }: { row: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(row.label);
  const [value, setValue] = useState(row.value);
  const [department, setDepartment] = useState(row.department ?? "");
  const [order, setOrder] = useState(row.display_order);
  const [isActive, setIsActive] = useState(row.is_active);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function fireUpdate() {
    setErr(null);
    startTransition(async () => {
      const res = await updateOrgContact({
        id:           row.id,
        label,
        value,
        department:   department.trim() || null,
        display_order: order,
        is_active:    isActive,
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        setErr(res.error);
      }
    });
  }

  function fireToggleActive() {
    setErr(null);
    startTransition(async () => {
      const res = await updateOrgContact({
        id:        row.id,
        is_active: !row.is_active,
      });
      if (res.ok) router.refresh();
      else        setErr(res.error);
    });
  }

  function fireDelete() {
    setErr(null);
    startTransition(async () => {
      const res = await deleteOrgContact({ id: row.id });
      if (res.ok) router.refresh();
      else        setErr(res.error);
    });
  }

  if (editing) {
    return (
      <tr className="border-t border-border bg-amber-50/40">
        <td className="px-3 py-2">
          <input
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(Math.max(0, Number(e.target.value) || 0))}
            className="w-16 rounded border border-border bg-white px-2 py-1 text-xs font-mono"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
          />
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
          />
          {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
        </td>
        <td className="px-3 py-2">
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            className="w-full rounded border border-border bg-white px-2 py-1 text-xs"
          />
        </td>
        <td className="px-3 py-2">
          <label className="inline-flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-primary-600"
            />
            {isActive ? "เปิด" : "ปิด"}
          </label>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <button
            type="button"
            onClick={fireUpdate}
            disabled={pending || !label.trim() || !value.trim()}
            className="rounded bg-primary-600 px-2 py-1 text-[11px] font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            ✓ บันทึก
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setLabel(row.label); setValue(row.value);
              setDepartment(row.department ?? ""); setOrder(row.display_order); setIsActive(row.is_active);
              setErr(null);
            }}
            disabled={pending}
            className="ml-1 rounded border border-border bg-white px-2 py-1 text-[11px] hover:bg-surface-alt disabled:opacity-50"
          >
            ยกเลิก
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className={`border-t border-border ${row.is_active ? "" : "opacity-60"}`}>
      <td className="px-3 py-2 text-xs font-mono">{row.display_order}</td>
      <td className="px-3 py-2 text-sm">{row.label}</td>
      <td className="px-3 py-2 text-sm break-all">{row.value}</td>
      <td className="px-3 py-2 text-xs">{row.department ?? "—"}</td>
      <td className="px-3 py-2">
        <button
          type="button"
          onClick={fireToggleActive}
          disabled={pending}
          className={`rounded-full border px-2 py-0.5 text-[11px] ${
            row.is_active
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-gray-50 text-gray-600 border-gray-200"
          }`}
        >
          {row.is_active ? "✓ เปิด" : "○ ปิด"}
        </button>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-primary-500 hover:underline"
        >
          แก้ไข
        </button>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ml-2 text-xs text-red-600 hover:underline"
          >
            ลบ
          </button>
        ) : (
          <span className="ml-2">
            <button
              type="button"
              onClick={fireDelete}
              disabled={pending}
              className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
            >
              ✓ ยืนยันลบ
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
              className="ml-1 text-[11px] text-muted hover:underline"
            >
              ยกเลิก
            </button>
          </span>
        )}
        {err && <p className="mt-1 text-[11px] text-red-700">{err}</p>}
      </td>
    </tr>
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
