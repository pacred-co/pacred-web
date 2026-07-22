"use client";

/**
 * G1 client — the HS-consult workspace.
 *
 *   • SUBMIT form  : product photo(s) + TH/EN name + qty/notes → createHsConsultTicket.
 *                    As the submitter types the name, searchHsCodes shows existing
 *                    คลัง HS matches inline (self-serve / Doc need not re-answer).
 *   • ANSWER panel : HsCodePicker (reuse-search) pre-fills อากร/ฟอร์มอี/stat;
 *                    + the เลี่ยงพิกัด / license-flag fields + "ออกใบกำกับได้ไหม";
 *                    + optional "บันทึกเข้าคลัง HS" grows the dictionary.
 *   • QUEUE        : status filter (รอตอบ / ตอบแล้ว / ยืนยันแล้ว / ทั้งหมด) + search;
 *                    each row is self-explaining (§0g) and ≥11px (§0h).
 *
 * §0f: answer / audit-confirm / cancel all confirm before mutate.
 * Mobile-first: 44px tap targets · full-width inputs · stacked cards.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  ClipboardList,
  Loader2,
  ShieldCheck,
  Ban,
  ImageOff,
  Plus,
} from "lucide-react";
import { HsCodePicker } from "@/components/admin/hs-code-picker";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { StyledFileInput } from "@/components/ui/styled-file-input";
import { formatThaiDateTime } from "@/lib/utils/thai-datetime";
import { searchHsCodes, type HsSearchRow } from "@/actions/admin/hs-codes";
import {
  listHsConsultTickets,
  createHsConsultTicket,
  answerHsConsultTicket,
  auditConfirmHsConsultTicket,
  cancelHsConsultTicket,
  adminUploadHsConsultPhoto,
  type HsConsultTicket,
  type HsConsultStatus,
} from "@/actions/admin/hs-consult";

const MAX_PHOTOS = 8;
const LICENSE_FLAGS = ["มอก", "อย", "ใบอนุญาต", "ทุ่มตลาด", "เกษตร", "DG"] as const;
type LicenseFlag = (typeof LICENSE_FLAGS)[number];

const FILTERS: { key: HsConsultStatus | "all"; label: string }[] = [
  { key: "open", label: "รอตอบ" },
  { key: "answered", label: "ตอบแล้ว" },
  { key: "audit_confirmed", label: "ยืนยันแล้ว" },
  { key: "cancelled", label: "ยกเลิก" },
  { key: "all", label: "ทั้งหมด" },
];

const STATUS_PILL: Record<HsConsultStatus, { label: string; cls: string }> = {
  open: { label: "รอตอบ", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  answered: { label: "ตอบแล้ว", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  audit_confirmed: { label: "ยืนยันแล้ว", cls: "bg-green-50 text-green-700 border-green-200" },
  cancelled: { label: "ยกเลิก", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

const inputCls =
  "w-full rounded-md border border-border bg-white dark:bg-surface px-3 py-2 text-[14px] min-h-[44px]";

export function HsConsultClient({
  initialTickets,
  initialFilter,
}: {
  initialTickets: HsConsultTicket[];
  initialFilter: HsConsultStatus | "all";
}) {
  const { confirm, alert, dialogs } = useConfirmDialogs();
  const [tickets, setTickets] = useState<HsConsultTicket[]>(initialTickets);
  const [filter, setFilter] = useState<HsConsultStatus | "all">(initialFilter);
  const [search, setSearch] = useState("");
  const [loading, startLoad] = useTransition();
  const [showSubmit, setShowSubmit] = useState(false);

  function reload(nextFilter = filter, nextSearch = search) {
    startLoad(async () => {
      const res = await listHsConsultTickets({ filter: nextFilter, search: nextSearch, limit: 150 });
      if (res.ok && res.data) setTickets(res.data);
      else await alert(`โหลดไม่สำเร็จ: ${res.ok ? "" : res.error}`);
    });
  }

  function onFilter(next: HsConsultStatus | "all") {
    setFilter(next);
    reload(next, search);
  }

  return (
    <div className="space-y-5">
      {dialogs}

      {/* New consult */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm">
        <button
          type="button"
          onClick={() => setShowSubmit((s) => !s)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Plus className="h-4 w-4 text-primary-600" /> ส่งคำถามพิกัดใหม่ (เซล/CS)
          </span>
          <span className="text-[11px] text-muted">{showSubmit ? "ซ่อน" : "เปิด"}</span>
        </button>
        {showSubmit && (
          <div className="border-t border-border p-4">
            <SubmitForm
              onCreated={() => {
                setShowSubmit(false);
                reload();
              }}
              onError={(m) => alert(m)}
            />
          </div>
        )}
      </div>

      {/* Filter + search */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => onFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium border ${
              filter === f.key
                ? "border-primary-500 bg-primary-50 text-primary-700"
                : "border-border bg-white text-foreground hover:bg-surface-alt"
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") reload(filter, search); }}
            placeholder="ค้นชื่อสินค้า / เลข HS…"
            className="rounded-md border border-border bg-white dark:bg-surface px-3 py-1.5 text-[13px] min-h-[40px] w-56 max-w-[60vw]"
          />
          <button
            type="button"
            onClick={() => reload(filter, search)}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-alt min-h-[40px]"
          >
            ค้นหา
          </button>
        </div>
      </div>

      {/* Queue */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด…
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted">
          ไม่มีรายการในสถานะนี้
        </div>
      ) : (
        <ul className="space-y-3">
          {tickets.map((t) => (
            <TicketCard
              key={t.id}
              ticket={t}
              confirm={confirm}
              alert={alert}
              onChanged={() => reload()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SubmitForm — Sale/CS request + photo upload + inline reuse-search
// ════════════════════════════════════════════════════════════════════
function SubmitForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (m: string) => void;
}) {
  const [nameTh, setNameTh] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState("");
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  // Inline reuse-search over the dictionary as the submitter types the name.
  const [matches, setMatches] = useState<HsSearchRow[]>([]);
  // Dropping the suggestions once the name is too short belongs to the CAUSE of the
  // change (typing / the submit-reset below), not to the effect — clearing it in the
  // effect body queued an extra render pass per keystroke
  // (react-hooks/set-state-in-effect).
  function onNameThChange(v: string) {
    setNameTh(v);
    if (v.trim().length < 2) setMatches([]);
  }
  useEffect(() => {
    const q = nameTh.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const tmr = setTimeout(() => {
      searchHsCodes(q, 5)
        .then((r) => { if (!cancelled) setMatches(r.ok && r.data ? r.data : []); })
        .catch(() => { if (!cancelled) setMatches([]); });
    }, 350);
    return () => { cancelled = true; clearTimeout(tmr); };
  }, [nameTh]);

  function onFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list) return;
    setFiles(Array.from(list).slice(0, MAX_PHOTOS));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!nameTh.trim()) { onError("กรอกชื่อสินค้า (ไทย) ก่อน"); return; }

    startTransition(async () => {
      // 1) upload photos sequentially
      const draftKey = `drafts-${Math.random().toString(36).slice(2, 10)}`;
      const keys: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setProgress(`กำลังอัปโหลดรูป ${i + 1}/${files.length}…`);
        const fd = new FormData();
        fd.append("file", files[i]!);
        fd.append("draftKey", draftKey);
        const up = await adminUploadHsConsultPhoto(fd);
        if (!up.ok) { setProgress(""); onError(`อัปโหลดรูปไม่สำเร็จ: ${up.error}`); return; }
        keys.push(up.data!.storage_path);
      }
      setProgress("");

      // 2) create ticket
      const res = await createHsConsultTicket({
        product_name_th: nameTh.trim(),
        product_name_en: nameEn.trim() || undefined,
        qty: qty.trim() || undefined,
        request_note: note.trim() || undefined,
        photo_keys: keys,
      });
      if (!res.ok) { onError(res.error); return; }
      setNameTh(""); setNameEn(""); setQty(""); setNote(""); setFiles([]); setMatches([]);
      onCreated();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold mb-1">ชื่อสินค้า (ไทย) *</label>
          <input value={nameTh} onChange={(e) => onNameThChange(e.target.value)} className={inputCls} placeholder="เช่น แก้วเซรามิก" maxLength={300} />
          {matches.length > 0 && (
            <div className="mt-1.5 rounded-md border border-sky-200 bg-sky-50/60 p-2 text-[11px]">
              <p className="font-semibold text-sky-800">มีในคลัง HS แล้ว — อาจตอบเองได้:</p>
              <ul className="mt-1 space-y-0.5">
                {matches.map((m) => (
                  <li key={m.code} className="text-sky-900">
                    <span className="font-semibold tabular-nums">{m.code}</span> — {m.description}
                    <span className="text-sky-700"> · อากร {m.default_duty_pct}% · Form-E {m.form_e_duty_pct}% · สถิติ {m.default_stat_code ?? "000"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">ชื่อสินค้า (อังกฤษ)</label>
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={inputCls} placeholder="ceramic cup" maxLength={300} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold mb-1">จำนวน / หน่วย</label>
          <input value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} placeholder="เช่น 48 กล่อง" maxLength={100} />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">บริการที่ตั้งใจ / หมายเหตุ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="สเปค / บริการ / หมายเหตุ" maxLength={2000} />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold mb-1">รูปสินค้า (สูงสุด {MAX_PHOTOS})</label>
        <StyledFileInput
          ref={fileRef}
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          multiple
          onChange={onFilePick}
          label="แนบรูปสินค้า"
          hint={`jpg/png/webp/heic · ไม่เกิน 10 MB · สูงสุด ${MAX_PHOTOS} รูป`}
          selectedLabel={files.length > 0 ? `${files.length} รูป` : undefined}
        />
      </div>

      {progress && <p className="text-xs text-muted">{progress}</p>}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 min-h-[44px]"
        >
          {pending ? "กำลังส่ง…" : "ส่งคำถาม"}
        </button>
      </div>
    </form>
  );
}

// ════════════════════════════════════════════════════════════════════
// TicketCard — self-explaining row + inline Doc answer panel
// ════════════════════════════════════════════════════════════════════
function TicketCard({
  ticket,
  confirm,
  alert,
  onChanged,
}: {
  ticket: HsConsultTicket;
  confirm: (m: string) => Promise<boolean>;
  alert: (m: string) => Promise<boolean>;
  onChanged: () => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [pending, startTransition] = useTransition();
  const pill = STATUS_PILL[ticket.status];

  function doAudit() {
    startTransition(async () => {
      if (!(await confirm("ยืนยันคำตอบพิกัดนี้ (audit) ?"))) return;
      const res = await auditConfirmHsConsultTicket({ id: ticket.id });
      if (!res.ok) { await alert(res.error); return; }
      onChanged();
    });
  }
  function doCancel() {
    startTransition(async () => {
      if (!(await confirm("ยกเลิกตั๋วนี้?"))) return;
      const res = await cancelHsConsultTicket({ id: ticket.id });
      if (!res.ok) { await alert(res.error); return; }
      onChanged();
    });
  }

  return (
    <li className="rounded-2xl border border-border bg-white dark:bg-surface p-4 shadow-sm">
      <div className="flex items-start gap-3">
        {/* photo thumb */}
        <div className="shrink-0">
          {ticket.photo_urls[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ticket.photo_urls[0]}
              alt={ticket.product_name_th}
              className="h-16 w-16 rounded-lg border border-border object-cover"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-border text-muted">
              <ImageOff className="h-5 w-5" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${pill.cls}`}>{pill.label}</span>
            <span className="font-semibold text-foreground truncate">{ticket.product_name_th}</span>
            {ticket.product_name_en && <span className="text-[11px] text-muted">({ticket.product_name_en})</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-muted">
            {ticket.qty ? `จำนวน ${ticket.qty} · ` : ""}เปิด {formatThaiDateTime(ticket.created_at)}
            {ticket.photo_urls.length > 1 ? ` · ${ticket.photo_urls.length} รูป` : ""}
          </p>
          {ticket.request_note && <p className="mt-1 text-[13px] text-foreground">{ticket.request_note}</p>}

          {/* answer summary */}
          {ticket.hs_code && (
            <div className="mt-2 rounded-lg bg-surface-alt/60 p-2 text-[12px]">
              <span className="font-semibold tabular-nums text-primary-700">HS {ticket.hs_code}</span>
              {ticket.duty_pct != null && <span> · อากร {ticket.duty_pct}%</span>}
              {ticket.form_e_pct != null && <span> · Form-E {ticket.form_e_pct}%</span>}
              {ticket.stat_code && <span> · สถิติ {ticket.stat_code}</span>}
              {ticket.can_issue_tax_invoice != null && (
                <span> · ใบกำกับ: {ticket.can_issue_tax_invoice ? "ได้" : "ไม่ได้"}</span>
              )}
              {ticket.is_evaded && (
                <span className="ml-1 rounded bg-amber-100 px-1 text-amber-800">
                  เลี่ยงพิกัด{ticket.license_flags.length ? ` · ${ticket.license_flags.join("/")}` : ""}
                </span>
              )}
              {ticket.original_restricted_item && (
                <span className="block text-[11px] text-muted">จริงคือ: {ticket.original_restricted_item}</span>
              )}
              {ticket.answer_note && <span className="block text-[12px] text-foreground">{ticket.answer_note}</span>}
            </div>
          )}
        </div>
      </div>

      {/* actions */}
      {ticket.status !== "cancelled" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setAnswering((a) => !a)}
            className="inline-flex items-center gap-1 rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 hover:bg-primary-100 min-h-[40px]"
          >
            <ClipboardList className="h-3.5 w-3.5" /> {ticket.hs_code ? "แก้คำตอบ" : "ตอบพิกัด"}
          </button>
          {ticket.status === "answered" && (
            <button
              type="button"
              onClick={doAudit}
              disabled={pending}
              className="inline-flex items-center gap-1 rounded-lg border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-50 min-h-[40px]"
            >
              <ShieldCheck className="h-3.5 w-3.5" /> ยืนยัน (audit)
            </button>
          )}
          <button
            type="button"
            onClick={doCancel}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-muted hover:bg-surface-alt disabled:opacity-50 min-h-[40px]"
          >
            <Ban className="h-3.5 w-3.5" /> ยกเลิก
          </button>
        </div>
      )}

      {answering && (
        <div className="mt-3 border-t border-border pt-3">
          <AnswerPanel
            ticket={ticket}
            confirm={confirm}
            alert={alert}
            onDone={() => { setAnswering(false); onChanged(); }}
          />
        </div>
      )}
    </li>
  );
}

// ════════════════════════════════════════════════════════════════════
// AnswerPanel — Doc/pricing/accounting answer (reuse-search + เลี่ยง + grow)
// ════════════════════════════════════════════════════════════════════
function AnswerPanel({
  ticket,
  confirm,
  alert,
  onDone,
}: {
  ticket: HsConsultTicket;
  confirm: (m: string) => Promise<boolean>;
  alert: (m: string) => Promise<boolean>;
  onDone: () => void;
}) {
  const [hs, setHs] = useState(ticket.hs_code ?? "");
  const [duty, setDuty] = useState(ticket.duty_pct != null ? String(ticket.duty_pct) : "");
  const [formE, setFormE] = useState(ticket.form_e_pct != null ? String(ticket.form_e_pct) : "");
  const [stat, setStat] = useState(ticket.stat_code ?? "");
  const [canInvoice, setCanInvoice] = useState<"" | "yes" | "no">(
    ticket.can_issue_tax_invoice == null ? "" : ticket.can_issue_tax_invoice ? "yes" : "no",
  );
  const [note, setNote] = useState(ticket.answer_note ?? "");
  const [isEvaded, setIsEvaded] = useState(ticket.is_evaded);
  const [origItem, setOrigItem] = useState(ticket.original_restricted_item ?? "");
  const [flags, setFlags] = useState<LicenseFlag[]>(
    (ticket.license_flags ?? []).filter((f): f is LicenseFlag => (LICENSE_FLAGS as readonly string[]).includes(f)),
  );
  const [saveToLib, setSaveToLib] = useState(false);
  const [pending, startTransition] = useTransition();

  const dutyNum = useMemo(() => (duty.trim() === "" ? undefined : Number(duty)), [duty]);
  const formENum = useMemo(() => (formE.trim() === "" ? undefined : Number(formE)), [formE]);

  function toggleFlag(f: LicenseFlag) {
    setFlags((prev) => (prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]));
  }

  function onPick(row: HsSearchRow) {
    // pre-fill อากร/ฟอร์มอี/stat from the dictionary row.
    setDuty(String(row.default_duty_pct));
    setFormE(String(row.form_e_duty_pct));
    if (row.default_stat_code) setStat(row.default_stat_code);
  }

  function submit() {
    if (!hs.trim()) { alert("กรอกเลข HS ก่อน"); return; }
    if (dutyNum != null && (dutyNum < 0 || dutyNum > 100)) { alert("อากร% ต้องอยู่ 0–100"); return; }
    if (formENum != null && (formENum < 0 || formENum > 100)) { alert("Form-E% ต้องอยู่ 0–100"); return; }

    startTransition(async () => {
      const msg = saveToLib ? "บันทึกคำตอบ + เพิ่มเข้าคลัง HS ?" : "บันทึกคำตอบพิกัดนี้?";
      if (!(await confirm(msg))) return;
      const res = await answerHsConsultTicket({
        id: ticket.id,
        hs_code: hs.trim(),
        duty_pct: dutyNum,
        form_e_pct: formENum,
        stat_code: stat.trim() || undefined,
        can_issue_tax_invoice: canInvoice === "" ? undefined : canInvoice === "yes",
        answer_note: note.trim() || undefined,
        is_evaded: isEvaded,
        original_restricted_item: origItem.trim() || undefined,
        license_flags: flags,
        save_to_library: saveToLib,
      });
      if (!res.ok) { await alert(res.error); return; }
      if (saveToLib && res.data && !res.data.grewLibrary) {
        await alert("บันทึกคำตอบแล้ว แต่เพิ่มเข้าคลัง HS ไม่สำเร็จ");
      }
      onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-lg bg-surface-alt/40 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold mb-1">เลข HS *</label>
          <HsCodePicker
            value={hs}
            onChange={setHs}
            onPick={onPick}
            inputClassName={inputCls}
            aria-label="เลข HS"
          />
          <p className="mt-1 text-[11px] text-muted">พิมพ์ ≥2 ตัว → เลือกจากคลัง HS เพื่อดึงอากร/สถิติ</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-semibold mb-1">อากร %</label>
            <input value={duty} onChange={(e) => setDuty(e.target.value)} inputMode="decimal" className={inputCls} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Form-E %</label>
            <input value={formE} onChange={(e) => setFormE(e.target.value)} inputMode="decimal" className={inputCls} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">สถิติ</label>
            <input value={stat} onChange={(e) => setStat(e.target.value)} className={inputCls} placeholder="000" maxLength={10} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold mb-1">ออกใบกำกับได้ไหม</label>
          <div className="flex gap-2">
            {([["", "—"], ["yes", "ได้"], ["no", "ไม่ได้"]] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setCanInvoice(val)}
                className={`flex-1 rounded-md border px-2 py-2 text-xs min-h-[44px] ${
                  canInvoice === val ? "border-primary-500 bg-primary-50 text-primary-700" : "border-border hover:bg-surface-alt"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">หมายเหตุคำตอบ</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} placeholder="คำอธิบายเพิ่มเติม" maxLength={2000} />
        </div>
      </div>

      {/* เลี่ยงพิกัด */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" checked={isEvaded} onChange={(e) => setIsEvaded(e.target.checked)} className="h-4 w-4" />
          เลี่ยงพิกัด (ของจริงติดข้อจำกัด)
        </label>
        {isEvaded && (
          <div className="mt-2 space-y-2">
            <div>
              <label className="block text-xs font-semibold mb-1">จริงๆ คือสินค้าอะไร (ก่อนเลี่ยง)</label>
              <input value={origItem} onChange={(e) => setOrigItem(e.target.value)} className={inputCls} placeholder="เช่น อาหารเสริม" maxLength={300} />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">ติดอะไร</label>
              <div className="flex flex-wrap gap-2">
                {LICENSE_FLAGS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleFlag(f)}
                    className={`rounded-full border px-3 py-1.5 text-xs min-h-[40px] ${
                      flags.includes(f) ? "border-amber-500 bg-amber-100 text-amber-800" : "border-border hover:bg-surface-alt"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <label className="inline-flex items-center gap-2 text-sm">
        <input type="checkbox" checked={saveToLib} onChange={(e) => setSaveToLib(e.target.checked)} className="h-4 w-4" />
        บันทึกเข้าคลัง HS (ให้ครั้งหน้าค้นเจอ)
      </label>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-primary-600 text-white px-4 py-2 text-sm font-medium hover:bg-primary-700 disabled:opacity-50 min-h-[44px]"
        >
          {pending ? "กำลังบันทึก…" : "บันทึกคำตอบ"}
        </button>
      </div>
    </div>
  );
}
