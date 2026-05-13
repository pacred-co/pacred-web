"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import {
  Plus, X, Save, Loader2, Trash2, Pencil, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  adminUpsertPolicy, adminTogglePublishPolicy, adminDeletePolicy,
} from "@/actions/admin/policies";

type Category = "general" | "hr" | "it" | "finance" | "operations" | "compliance" | "safety" | "data_privacy";

type PolicySeed = {
  id?: string;
  title: string;
  category: Category;
  version: string;
  body: string;
  external_url: string;
  requires_ack: boolean;
  is_published: boolean;
  effective_at: string;
  expires_at: string;
};

const EMPTY: PolicySeed = {
  title: "", category: "general", version: "1.0", body: "", external_url: "",
  requires_ack: false, is_published: false, effective_at: "", expires_at: "",
};

const inputCls = "w-full rounded-lg border border-border bg-surface-alt/30 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/40";

export function PolicyFormButton({
  buttonLabel, initial, asPencil = false,
}: { buttonLabel: string; initial?: PolicySeed; asPencil?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<PolicySeed>(initial ?? EMPTY);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    startTransition(async () => {
      const res = await adminUpsertPolicy({
        id:           form.id,
        title:        form.title,
        category:     form.category,
        version:      form.version,
        body:         form.body || null,
        external_url: form.external_url || null,
        requires_ack: form.requires_ack,
        is_published: form.is_published,
        effective_at: form.effective_at || null,
        expires_at:   form.expires_at   || null,
      });
      if (res.ok) { setOpen(false); router.refresh(); }
      else setErr(res.error);
    });
  }

  if (!open) {
    if (asPencil) {
      return (
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
          title="แก้ไข">
          <Pencil className="w-3.5 h-3.5" />
        </button>
      );
    }
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white text-primary-700 px-3 py-2 text-xs sm:text-sm font-bold hover:bg-white/90 shadow">
        <Plus className="w-4 h-4" />
        {buttonLabel}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <form onSubmit={submit} className="w-full max-w-2xl rounded-2xl bg-white dark:bg-surface border border-border shadow-xl p-5 space-y-3 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base">{form.id ? "แก้ไขนโยบาย" : "เพิ่มนโยบายใหม่"}</h3>
          <button type="button" onClick={() => setOpen(false)} className="text-muted hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>
        {err && <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{err}</div>}

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">ชื่อนโยบาย *</span>
          <input required value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} className={inputCls} placeholder="เช่น ระเบียบพนักงาน Pacred 2026" />
        </label>

        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block space-y-1 sm:col-span-2">
            <span className="text-xs font-semibold text-muted">หมวด</span>
            <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))} className={inputCls}>
              <option value="general">ทั่วไป</option>
              <option value="hr">HR · พนักงาน</option>
              <option value="it">IT · เทคโนโลยี</option>
              <option value="finance">การเงิน</option>
              <option value="operations">ปฏิบัติการ</option>
              <option value="compliance">Compliance</option>
              <option value="safety">ความปลอดภัย</option>
              <option value="data_privacy">PDPA · ข้อมูลส่วนบุคคล</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">เวอร์ชัน</span>
            <input value={form.version} onChange={(e) => setForm((f) => ({ ...f, version: e.target.value }))} className={`${inputCls} font-mono`} placeholder="1.0" />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">มีผลตั้งแต่</span>
            <input type="date" value={form.effective_at} onChange={(e) => setForm((f) => ({ ...f, effective_at: e.target.value }))} className={inputCls} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-muted">หมดอายุ</span>
            <input type="date" value={form.expires_at} onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))} className={inputCls} />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">URL เอกสารภายนอก (Notion/Confluence/PDF)</span>
          <input type="url" value={form.external_url} onChange={(e) => setForm((f) => ({ ...f, external_url: e.target.value }))} className={inputCls} placeholder="https://..." />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-semibold text-muted">เนื้อหา (markdown — หรือเว้นว่างถ้าใช้ URL ภายนอก)</span>
          <textarea rows={8} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} className={`${inputCls} font-mono text-xs`} />
        </label>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.requires_ack} onChange={(e) => setForm((f) => ({ ...f, requires_ack: e.target.checked }))} />
            <span>บังคับให้พนักงานกดรับทราบ</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.is_published} onChange={(e) => setForm((f) => ({ ...f, is_published: e.target.checked }))} />
            <span>เผยแพร่ทันที (visible ต่อพนักงาน)</span>
          </label>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
          <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button type="submit" size="sm" disabled={pending || !form.title.trim()}>
            {pending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            บันทึก
          </Button>
        </div>
      </form>
    </div>
  );
}

export function PolicyRowActions({
  id, isPublished,
}: { id: string; isPublished: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function togglePublish() {
    startTransition(async () => {
      const res = await adminTogglePublishPolicy({ id, is_published: !isPublished });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  function remove() {
    if (!confirm("ลบนโยบายนี้ออกจากระบบ? (จะลบ acknowledgments ทั้งหมดด้วย)")) return;
    startTransition(async () => {
      const res = await adminDeletePolicy({ id });
      if (res.ok) router.refresh();
      else alert(res.error);
    });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={togglePublish}
        disabled={pending}
        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-bold transition-colors disabled:opacity-50 ${
          isPublished
            ? "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        }`}
        title={isPublished ? "ยกเลิกเผยแพร่" : "เผยแพร่"}
      >
        {pending ? <Loader2 className="w-3 h-3 animate-spin" /> : isPublished ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
        {isPublished ? "Unpublish" : "Publish"}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
        title="ลบนโยบาย"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
