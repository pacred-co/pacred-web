"use client";

/**
 * Client component for "ช่องทางองค์กร" — 4 channel tabs (เบอร์โทร · ไลน์ ·
 * WeChat · โดเมนเนม), each a CRUD section mirroring the
 * `organization-email/client.tsx` pattern (Pacred Tailwind dialogs via
 * `components/ui/pacred-dialog.tsx`, server-action calls, useConfirmDialogs
 * for the destructive prompt).
 *
 * Logic is 1:1 with the legacy add/update handlers (see
 * `actions/admin/organization-channels.ts` for the per-handler citations);
 * the UI is our own design per AGENTS.md §0a.
 *
 * Password columns (line · wechat) show a show/hide eye toggle exactly like
 * the email page's passEmail field.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addOrgTell, updateOrgTell, deleteOrgTell,
  addOrgLine, updateOrgLine, deleteOrgLine,
  addOrgWechat, updateOrgWechat, deleteOrgWechat,
  addOrgDomain, updateOrgDomain, deleteOrgDomain,
} from "@/actions/admin/organization-channels";
import { PacredDialog, useConfirmDialogs } from "@/components/ui/pacred-dialog";

// ── Display row types (formatted strings from the server page) ──
type TellRow = {
  id: number; date: string; dateupdate: string; tell: string;
  nameequipment: string; numberequipment: string;
  adminidcreate: string; adminidupdate: string; note: string;
};
type LineRow = {
  id: number; date: string; dateupdate: string; line: string;
  emailline: string; telline: string; passline: string;
  adminidcreate: string; adminidupdate: string; note: string;
};
type WechatRow = {
  id: number; date: string; dateupdate: string; wechat: string;
  emailwechat: string; telwechat: string; passwechat: string;
  adminidcreate: string; adminidupdate: string; note: string;
};
type DomainRow = {
  id: number; date: string; dateupdate: string; domain: string;
  start_date: string; end_date: string; pay_date: string;
  start_date_input: string; end_date_input: string;
  adminidcreate: string; adminidupdate: string; note: string;
};

type TabKey = "tell" | "line" | "wechat" | "domain";
const TABS: { key: TabKey; label: string }[] = [
  { key: "tell",   label: "เบอร์โทรในองค์กร" },
  { key: "line",   label: "ไลน์ในองค์กร" },
  { key: "wechat", label: "WeChat ในองค์กร" },
  { key: "domain", label: "โดเมนเนม" },
];

// ── shared small bits ──
function inputCls() {
  return "form-control form-control-lg";
}
function fieldLabel(text: string) {
  return <label className="form-control-label">{text}</label>;
}
function adminLink(id: string) {
  return id ? <a href={`/admin/admins/${encodeURIComponent(id)}`}>{id}</a> : <span className="text-muted">—</span>;
}

function PwCell({ value }: { value: string }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="password-container">
      <input className="password" type={shown ? "text" : "password"} value={value} readOnly />
      <span
        className="toggle-button"
        role="button"
        tabIndex={0}
        onClick={() => setShown((v) => !v)}
        onKeyDown={(e) => { if (e.key === "Enter") setShown((v) => !v); }}
      >
        <i className={shown ? "fa fa-eye" : "fa fa-eye-slash"} aria-hidden="true"></i>
      </span>
    </span>
  );
}

function ModalFooter({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="mt-6 flex justify-end gap-2 border-t border-gray-200 pt-4">
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        ยกเลิก
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-gray-300"
      >
        {pending ? "กำลังบันทึก..." : "บันทึก"}
      </button>
    </div>
  );
}

/** Row action buttons (edit + delete) — gated on canMutate. */
function RowActions({
  canMutate, pending, onEdit, onDelete,
}: {
  canMutate: boolean; pending: boolean; onEdit: () => void; onDelete: () => void;
}) {
  if (!canMutate) return <span className="text-muted">—</span>;
  return (
    <div className="btn-group-pcs">
      <button type="button" onClick={onEdit} disabled={pending} className="btn btn-sm btn-warning btn-rounded">
        แก้ไขข้อมูล
      </button>{" "}
      <button type="button" onClick={onDelete} disabled={pending} className="btn btn-sm btn-danger btn-rounded">
        ลบรายการ
      </button>
    </div>
  );
}

/** "เพิ่มใหม่" toolbar shown above each tab's table. */
function AddToolbar({ canMutate, onAdd }: { canMutate: boolean; onAdd: () => void }) {
  if (!canMutate) return null;
  return (
    <div className="text-right mb-2">
      <button
        type="button"
        onClick={onAdd}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"
      >
        + เพิ่มใหม่
      </button>
    </div>
  );
}

function TableShell({ headers, empty, children }: { headers: string[]; empty: boolean; children: React.ReactNode }) {
  return (
    <div className="table-responsive p-05 scrollbar-x-visible">
      <table className="table display table-bordered table-striped no-footer dtr-inline header-fixed">
        <thead>
          <tr className="text-center">
            {headers.map((h) => <th key={h}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {empty ? (
            <tr>
              <td colSpan={headers.length} className="text-center" style={{ padding: "32px 0" }}>
                <em>ยังไม่มีรายการ — กด &quot;เพิ่มใหม่&quot; เพื่อเริ่ม</em>
              </td>
            </tr>
          ) : children}
        </tbody>
      </table>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────

export function OrgChannelsClient({
  canMutate, tellRows, lineRows, wechatRows, domainRows,
}: {
  canMutate: boolean;
  tellRows: TellRow[];
  lineRows: LineRow[];
  wechatRows: WechatRow[];
  domainRows: DomainRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("tell");
  const [pending, startTransition] = useTransition();
  const [alert, setAlert] = useState<string | null>(null);
  const { confirm, dialogs: confirmDialog } = useConfirmDialogs();

  function flashOk(msg: string) {
    setAlert(msg);
    router.refresh();
    setTimeout(() => setAlert(null), 3000);
  }
  function dupOrError(error: string, dupMsg: string) {
    setAlert(error === "eDuplicate" ? dupMsg : error);
  }

  return (
    <>
      {/* Tab bar */}
      <ul className="nav nav-tabs mb-3" role="tablist">
        {TABS.map((t) => (
          <li className="nav-item" key={t.key}>
            <button
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => { setTab(t.key); setAlert(null); }}
              className={
                "nav-link border-0 bg-transparent cursor-pointer " +
                (tab === t.key ? "active font-semibold text-primary-700 border-b-2 border-primary-600" : "text-gray-600")
              }
            >
              {t.label}
            </button>
          </li>
        ))}
      </ul>

      {alert && (
        <div className="alert alert-info" role="alert" style={{ margin: "8px 0" }}>
          {alert}
        </div>
      )}

      {tab === "tell" && (
        <TellSection
          canMutate={canMutate} rows={tellRows} pending={pending}
          startTransition={startTransition} flashOk={flashOk} dupOrError={dupOrError} confirm={confirm}
        />
      )}
      {tab === "line" && (
        <LineSection
          canMutate={canMutate} rows={lineRows} pending={pending}
          startTransition={startTransition} flashOk={flashOk} dupOrError={dupOrError} confirm={confirm}
        />
      )}
      {tab === "wechat" && (
        <WechatSection
          canMutate={canMutate} rows={wechatRows} pending={pending}
          startTransition={startTransition} flashOk={flashOk} dupOrError={dupOrError} confirm={confirm}
        />
      )}
      {tab === "domain" && (
        <DomainSection
          canMutate={canMutate} rows={domainRows} pending={pending}
          startTransition={startTransition} flashOk={flashOk} dupOrError={dupOrError} confirm={confirm}
        />
      )}

      {confirmDialog}
    </>
  );
}

// Shared prop bundle every section receives.
type SectionCtx = {
  canMutate: boolean;
  pending: boolean;
  startTransition: (cb: () => void) => void;
  flashOk: (msg: string) => void;
  dupOrError: (error: string, dupMsg: string) => void;
  confirm: (message: string) => Promise<boolean>;
};

// ──────────────────────────────────────────────────────────────
// เบอร์โทร — tell · nameequipment · numberequipment · note
// ──────────────────────────────────────────────────────────────
function TellSection({ canMutate, rows, pending, startTransition, flashOk, dupOrError, confirm }: SectionCtx & { rows: TellRow[] }) {
  const addRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const [editRow, setEditRow] = useState<TellRow | null>(null);

  function openEdit(r: TellRow) { setEditRow(r); queueMicrotask(() => editRef.current?.showModal()); }
  function closeEdit() { editRef.current?.close(); setEditRow(null); }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await addOrgTell({
        tell: String(fd.get("tell") ?? ""),
        nameEquipment: String(fd.get("nameEquipment") ?? ""),
        numberEquipment: String(fd.get("numberEquipment") ?? ""),
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("เพิ่มข้อมูลสำเร็จ"); addRef.current?.close(); form.reset(); }
      else dupOrError(res.error, "เบอร์โทรนี้มีอยู่แล้ว");
    });
  }
  function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editRow) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrgTell({
        ID: editRow.id, tellOld: editRow.tell,
        tell: String(fd.get("tell") ?? ""),
        nameEquipment: String(fd.get("nameEquipment") ?? ""),
        numberEquipment: String(fd.get("numberEquipment") ?? ""),
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("แก้ไขข้อมูลสำเร็จ"); closeEdit(); }
      else dupOrError(res.error, "เบอร์โทรนี้มีอยู่แล้ว");
    });
  }
  async function onDelete(r: TellRow) {
    if (!(await confirm(`ลบรายการ "${r.tell}" ?`))) return;
    startTransition(async () => {
      const res = await deleteOrgTell({ ID: r.id });
      if (res.ok) flashOk("ลบรายการสำเร็จ"); else dupOrError(res.error, "");
    });
  }

  return (
    <>
      <AddToolbar canMutate={canMutate} onAdd={() => addRef.current?.showModal()} />
      <TableShell
        headers={["วันที่สร้าง", "เบอร์โทร", "ชื่ออุปกรณ์", "หมายเลขอุปกรณ์", "โน๊ตช่วยจำ", "ผู้สร้าง", "อัปเดตล่าสุด", "อัปเดตโดย", "ตัวเลือก"]}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.date}</td>
            <td>{r.tell}</td>
            <td>{r.nameequipment}</td>
            <td>{r.numberequipment}</td>
            <td>{r.note}</td>
            <td>{adminLink(r.adminidcreate)}</td>
            <td>{r.dateupdate}</td>
            <td>{adminLink(r.adminidupdate)}</td>
            <td className="text-center"><RowActions canMutate={canMutate} pending={pending} onEdit={() => openEdit(r)} onDelete={() => onDelete(r)} /></td>
          </tr>
        ))}
      </TableShell>

      {canMutate && (
        <PacredDialog dialogRef={addRef} title="เพิ่มเบอร์โทรองค์กร" size="lg">
          <TellForm pending={pending} onSubmit={onAdd} onCancel={() => addRef.current?.close()} />
        </PacredDialog>
      )}
      <PacredDialog dialogRef={editRef} title="แก้ไขเบอร์โทรองค์กร" size="lg" onClose={() => setEditRow(null)}>
        {editRow && <TellForm pending={pending} onSubmit={onEdit} onCancel={closeEdit} row={editRow} />}
      </PacredDialog>
    </>
  );
}

function TellForm({ pending, onSubmit, onCancel, row }: { pending: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void; row?: TellRow }) {
  return (
    <form className="form-horizontal" onSubmit={onSubmit} autoComplete="off">
      <div className="row mb-1">
        <div className="col-md-6">
          {fieldLabel("เบอร์โทร")}
          <input className={inputCls()} name="tell" type="text" defaultValue={row?.tell ?? ""} maxLength={20} required />
        </div>
        <div className="col-md-6">
          {fieldLabel("ชื่ออุปกรณ์")}
          <input className={inputCls()} name="nameEquipment" type="text" defaultValue={row?.nameequipment ?? ""} maxLength={255} required />
        </div>
      </div>
      <div className="row mb-1">
        <div className="col-md-6">
          {fieldLabel("หมายเลขอุปกรณ์")}
          <input className={inputCls()} name="numberEquipment" type="text" defaultValue={row?.numberequipment ?? ""} maxLength={255} required />
        </div>
      </div>
      <div className="row">
        <div className="col-md-12">
          {fieldLabel("โน๊ตช่วยจำ")}
          <textarea className={inputCls()} name="note" rows={3} defaultValue={row?.note ?? ""}></textarea>
        </div>
      </div>
      <ModalFooter pending={pending} onCancel={onCancel} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────
// ไลน์ — line · emailline · telline · passline(🔒) · note
// ──────────────────────────────────────────────────────────────
function LineSection({ canMutate, rows, pending, startTransition, flashOk, dupOrError, confirm }: SectionCtx & { rows: LineRow[] }) {
  const addRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const [editRow, setEditRow] = useState<LineRow | null>(null);

  function openEdit(r: LineRow) { setEditRow(r); queueMicrotask(() => editRef.current?.showModal()); }
  function closeEdit() { editRef.current?.close(); setEditRow(null); }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await addOrgLine({
        line: String(fd.get("line") ?? ""),
        emailLine: String(fd.get("emailLine") ?? "") || undefined,
        telLine: String(fd.get("telLine") ?? "") || undefined,
        passLine: String(fd.get("passLine") ?? "") || undefined,
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("เพิ่มข้อมูลสำเร็จ"); addRef.current?.close(); form.reset(); }
      else dupOrError(res.error, "ไลน์นี้มีอยู่แล้ว");
    });
  }
  function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editRow) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrgLine({
        ID: editRow.id, lineOld: editRow.line,
        line: String(fd.get("line") ?? ""),
        emailLine: String(fd.get("emailLine") ?? "") || undefined,
        telLine: String(fd.get("telLine") ?? "") || undefined,
        passLine: String(fd.get("passLine") ?? "") || undefined,
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("แก้ไขข้อมูลสำเร็จ"); closeEdit(); }
      else dupOrError(res.error, "ไลน์นี้มีอยู่แล้ว");
    });
  }
  async function onDelete(r: LineRow) {
    if (!(await confirm(`ลบรายการ "${r.line}" ?`))) return;
    startTransition(async () => {
      const res = await deleteOrgLine({ ID: r.id });
      if (res.ok) flashOk("ลบรายการสำเร็จ"); else dupOrError(res.error, "");
    });
  }

  return (
    <>
      <AddToolbar canMutate={canMutate} onAdd={() => addRef.current?.showModal()} />
      <TableShell
        headers={["วันที่สร้าง", "ไลน์", "อีเมลที่ผูกไลน์", "เบอร์ที่ผูกไลน์", "รหัสผ่าน", "โน๊ตช่วยจำ", "ผู้สร้าง", "อัปเดตล่าสุด", "ตัวเลือก"]}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.date}</td>
            <td>{r.line}</td>
            <td>{r.emailline}</td>
            <td>{r.telline}</td>
            <td className="password-container"><PwCell value={r.passline} /></td>
            <td>{r.note}</td>
            <td>{adminLink(r.adminidcreate)}</td>
            <td>{r.dateupdate}</td>
            <td className="text-center"><RowActions canMutate={canMutate} pending={pending} onEdit={() => openEdit(r)} onDelete={() => onDelete(r)} /></td>
          </tr>
        ))}
      </TableShell>

      {canMutate && (
        <PacredDialog dialogRef={addRef} title="เพิ่มไลน์องค์กร" size="lg">
          <LineForm pending={pending} onSubmit={onAdd} onCancel={() => addRef.current?.close()} />
        </PacredDialog>
      )}
      <PacredDialog dialogRef={editRef} title="แก้ไขไลน์องค์กร" size="lg" onClose={() => setEditRow(null)}>
        {editRow && <LineForm pending={pending} onSubmit={onEdit} onCancel={closeEdit} row={editRow} />}
      </PacredDialog>
    </>
  );
}

function LineForm({ pending, onSubmit, onCancel, row }: { pending: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void; row?: LineRow }) {
  return (
    <form className="form-horizontal" onSubmit={onSubmit} autoComplete="off">
      <div className="row mb-1">
        <div className="col-md-6">
          {fieldLabel("ไลน์ (LINE ID)")}
          <input className={inputCls()} name="line" type="text" defaultValue={row?.line ?? ""} maxLength={255} required />
        </div>
        <div className="col-md-6">
          {fieldLabel("อีเมลที่ผูกไลน์")}
          <input className={inputCls()} name="emailLine" type="text" defaultValue={row?.emailline ?? ""} maxLength={30} />
        </div>
      </div>
      <div className="row mb-1">
        <div className="col-md-6">
          {fieldLabel("เบอร์ที่ผูกไลน์")}
          <input className={inputCls()} name="telLine" type="text" defaultValue={row?.telline ?? ""} maxLength={30} />
        </div>
        <div className="col-md-6">
          {fieldLabel("รหัสผ่าน")}
          <input className={inputCls()} name="passLine" type="text" defaultValue={row?.passline ?? ""} maxLength={255} />
        </div>
      </div>
      <div className="row">
        <div className="col-md-12">
          {fieldLabel("โน๊ตช่วยจำ")}
          <textarea className={inputCls()} name="note" rows={3} defaultValue={row?.note ?? ""}></textarea>
        </div>
      </div>
      <ModalFooter pending={pending} onCancel={onCancel} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────
// WeChat — wechat · emailwechat · telwechat · passwechat(🔒) · note
// ──────────────────────────────────────────────────────────────
function WechatSection({ canMutate, rows, pending, startTransition, flashOk, dupOrError, confirm }: SectionCtx & { rows: WechatRow[] }) {
  const addRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const [editRow, setEditRow] = useState<WechatRow | null>(null);

  function openEdit(r: WechatRow) { setEditRow(r); queueMicrotask(() => editRef.current?.showModal()); }
  function closeEdit() { editRef.current?.close(); setEditRow(null); }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await addOrgWechat({
        wechat: String(fd.get("wechat") ?? ""),
        emailWechat: String(fd.get("emailWechat") ?? "") || undefined,
        telWechat: String(fd.get("telWechat") ?? "") || undefined,
        passWechat: String(fd.get("passWechat") ?? "") || undefined,
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("เพิ่มข้อมูลสำเร็จ"); addRef.current?.close(); form.reset(); }
      else dupOrError(res.error, "WeChat นี้มีอยู่แล้ว");
    });
  }
  function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editRow) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrgWechat({
        ID: editRow.id, wechatOld: editRow.wechat,
        wechat: String(fd.get("wechat") ?? ""),
        emailWechat: String(fd.get("emailWechat") ?? "") || undefined,
        telWechat: String(fd.get("telWechat") ?? "") || undefined,
        passWechat: String(fd.get("passWechat") ?? "") || undefined,
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("แก้ไขข้อมูลสำเร็จ"); closeEdit(); }
      else dupOrError(res.error, "WeChat นี้มีอยู่แล้ว");
    });
  }
  async function onDelete(r: WechatRow) {
    if (!(await confirm(`ลบรายการ "${r.wechat}" ?`))) return;
    startTransition(async () => {
      const res = await deleteOrgWechat({ ID: r.id });
      if (res.ok) flashOk("ลบรายการสำเร็จ"); else dupOrError(res.error, "");
    });
  }

  return (
    <>
      <AddToolbar canMutate={canMutate} onAdd={() => addRef.current?.showModal()} />
      <TableShell
        headers={["วันที่สร้าง", "WeChat", "อีเมลที่ผูก", "เบอร์ที่ผูก", "รหัสผ่าน", "โน๊ตช่วยจำ", "ผู้สร้าง", "อัปเดตล่าสุด", "ตัวเลือก"]}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.date}</td>
            <td>{r.wechat}</td>
            <td>{r.emailwechat}</td>
            <td>{r.telwechat}</td>
            <td className="password-container"><PwCell value={r.passwechat} /></td>
            <td>{r.note}</td>
            <td>{adminLink(r.adminidcreate)}</td>
            <td>{r.dateupdate}</td>
            <td className="text-center"><RowActions canMutate={canMutate} pending={pending} onEdit={() => openEdit(r)} onDelete={() => onDelete(r)} /></td>
          </tr>
        ))}
      </TableShell>

      {canMutate && (
        <PacredDialog dialogRef={addRef} title="เพิ่ม WeChat องค์กร" size="lg">
          <WechatForm pending={pending} onSubmit={onAdd} onCancel={() => addRef.current?.close()} />
        </PacredDialog>
      )}
      <PacredDialog dialogRef={editRef} title="แก้ไข WeChat องค์กร" size="lg" onClose={() => setEditRow(null)}>
        {editRow && <WechatForm pending={pending} onSubmit={onEdit} onCancel={closeEdit} row={editRow} />}
      </PacredDialog>
    </>
  );
}

function WechatForm({ pending, onSubmit, onCancel, row }: { pending: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void; row?: WechatRow }) {
  return (
    <form className="form-horizontal" onSubmit={onSubmit} autoComplete="off">
      <div className="row mb-1">
        <div className="col-md-6">
          {fieldLabel("WeChat ID")}
          <input className={inputCls()} name="wechat" type="text" defaultValue={row?.wechat ?? ""} maxLength={255} required />
        </div>
        <div className="col-md-6">
          {fieldLabel("อีเมลที่ผูก")}
          <input className={inputCls()} name="emailWechat" type="text" defaultValue={row?.emailwechat ?? ""} maxLength={30} />
        </div>
      </div>
      <div className="row mb-1">
        <div className="col-md-6">
          {fieldLabel("เบอร์ที่ผูก")}
          <input className={inputCls()} name="telWechat" type="text" defaultValue={row?.telwechat ?? ""} maxLength={30} />
        </div>
        <div className="col-md-6">
          {fieldLabel("รหัสผ่าน")}
          <input className={inputCls()} name="passWechat" type="text" defaultValue={row?.passwechat ?? ""} maxLength={255} />
        </div>
      </div>
      <div className="row">
        <div className="col-md-12">
          {fieldLabel("โน๊ตช่วยจำ")}
          <textarea className={inputCls()} name="note" rows={3} defaultValue={row?.note ?? ""}></textarea>
        </div>
      </div>
      <ModalFooter pending={pending} onCancel={onCancel} />
    </form>
  );
}

// ──────────────────────────────────────────────────────────────
// โดเมนเนม — domain · start_date · end_date · pay_date(add-only) · note
// ──────────────────────────────────────────────────────────────
function DomainSection({ canMutate, rows, pending, startTransition, flashOk, dupOrError, confirm }: SectionCtx & { rows: DomainRow[] }) {
  const addRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const [editRow, setEditRow] = useState<DomainRow | null>(null);

  function openEdit(r: DomainRow) { setEditRow(r); queueMicrotask(() => editRef.current?.showModal()); }
  function closeEdit() { editRef.current?.close(); setEditRow(null); }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const form = e.currentTarget;
    startTransition(async () => {
      const res = await addOrgDomain({
        domainname: String(fd.get("domainname") ?? ""),
        start_date: String(fd.get("start_date") ?? "") || undefined,
        end_date: String(fd.get("end_date") ?? "") || undefined,
        date_pay: String(fd.get("date_pay") ?? "") || undefined,
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("เพิ่มข้อมูลสำเร็จ"); addRef.current?.close(); form.reset(); }
      else dupOrError(res.error, "โดเมนเนมนี้มีอยู่แล้ว");
    });
  }
  function onEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editRow) return;
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await updateOrgDomain({
        ID: editRow.id, domainOld: editRow.domain,
        domain: String(fd.get("domain") ?? ""),
        start_date: String(fd.get("start_date") ?? "") || undefined,
        end_date: String(fd.get("end_date") ?? "") || undefined,
        note: String(fd.get("note") ?? "") || undefined,
      });
      if (res.ok) { flashOk("แก้ไขข้อมูลสำเร็จ"); closeEdit(); }
      else dupOrError(res.error, "โดเมนเนมนี้มีอยู่แล้ว");
    });
  }
  async function onDelete(r: DomainRow) {
    if (!(await confirm(`ลบรายการ "${r.domain}" ?`))) return;
    startTransition(async () => {
      const res = await deleteOrgDomain({ ID: r.id });
      if (res.ok) flashOk("ลบรายการสำเร็จ"); else dupOrError(res.error, "");
    });
  }

  return (
    <>
      <AddToolbar canMutate={canMutate} onAdd={() => addRef.current?.showModal()} />
      <TableShell
        headers={["วันที่สร้าง", "โดเมนเนม", "เริ่มใช้", "หมดอายุ", "วันชำระ", "โน๊ตช่วยจำ", "ผู้สร้าง", "อัปเดตล่าสุด", "ตัวเลือก"]}
        empty={rows.length === 0}
      >
        {rows.map((r) => (
          <tr key={r.id}>
            <td>{r.date}</td>
            <td>{r.domain}</td>
            <td>{r.start_date}</td>
            <td>{r.end_date}</td>
            <td>{r.pay_date}</td>
            <td>{r.note}</td>
            <td>{adminLink(r.adminidcreate)}</td>
            <td>{r.dateupdate}</td>
            <td className="text-center"><RowActions canMutate={canMutate} pending={pending} onEdit={() => openEdit(r)} onDelete={() => onDelete(r)} /></td>
          </tr>
        ))}
      </TableShell>

      {canMutate && (
        <PacredDialog dialogRef={addRef} title="เพิ่มโดเมนเนมองค์กร" size="lg">
          <DomainForm pending={pending} onSubmit={onAdd} onCancel={() => addRef.current?.close()} mode="add" />
        </PacredDialog>
      )}
      <PacredDialog dialogRef={editRef} title="แก้ไขโดเมนเนมองค์กร" size="lg" onClose={() => setEditRow(null)}>
        {editRow && <DomainForm pending={pending} onSubmit={onEdit} onCancel={closeEdit} row={editRow} mode="edit" />}
      </PacredDialog>
    </>
  );
}

function DomainForm({ pending, onSubmit, onCancel, row, mode }: { pending: boolean; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; onCancel: () => void; row?: DomainRow; mode: "add" | "edit" }) {
  // legacy add posts `domainname`; update posts `domain` — keep the same field names.
  const nameField = mode === "add" ? "domainname" : "domain";
  return (
    <form className="form-horizontal" onSubmit={onSubmit} autoComplete="off">
      <div className="row mb-1">
        <div className="col-md-12">
          {fieldLabel("โดเมนเนม")}
          <input className={inputCls()} name={nameField} type="text" defaultValue={row?.domain ?? ""} maxLength={255} required />
        </div>
      </div>
      <div className="row mb-1">
        <div className="col-md-4">
          {fieldLabel("วันเริ่มใช้")}
          <input className={inputCls()} name="start_date" type="date" defaultValue={row?.start_date_input ?? ""} />
        </div>
        <div className="col-md-4">
          {fieldLabel("วันหมดอายุ")}
          <input className={inputCls()} name="end_date" type="date" defaultValue={row?.end_date_input ?? ""} />
        </div>
        {mode === "add" && (
          <div className="col-md-4">
            {fieldLabel("วันชำระ")}
            <input className={inputCls()} name="date_pay" type="date" />
          </div>
        )}
      </div>
      <div className="row">
        <div className="col-md-12">
          {fieldLabel("โน๊ตช่วยจำ")}
          <textarea className={inputCls()} name="note" rows={3} defaultValue={row?.note ?? ""}></textarea>
        </div>
      </div>
      <ModalFooter pending={pending} onCancel={onCancel} />
    </form>
  );
}
