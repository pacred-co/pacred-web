"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Save, Send, Check, X, Upload, Loader2, Eye, EyeOff, Trash2, ExternalLink, ArrowLeft,
} from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { ArticleContent } from "@/components/knowledge/article-content";
import {
  saveCmsArticle, submitCmsArticle, approveCmsArticle, rejectCmsArticle,
  unpublishCmsArticle, deleteCmsArticle, uploadCmsCover, type AdminArticle,
} from "@/actions/admin/cms-articles";
import {
  CMS_CATEGORIES, CMS_CATEGORY_META, KNOWLEDGE_SUBCATS, CMS_STATUS_LABEL,
  type CmsCategory, type CmsStatus,
} from "@/lib/validators/cms-article";

const STATUS_STYLE: Record<CmsStatus, string> = {
  draft:     "border-slate-300 bg-slate-100 text-slate-700",
  pending:   "border-amber-300 bg-amber-50 text-amber-700",
  published: "border-green-300 bg-green-50 text-green-700",
  rejected:  "border-rose-300 bg-rose-50 text-rose-700",
};

const ERR_TH: Record<string, string> = {
  approve_requires_ultra: "อนุมัติได้เฉพาะ Ultra Admin Z เท่านั้น",
  not_submittable: "ส่งอนุมัติไม่ได้ (สถานะไม่ใช่ ร่าง/ตีกลับ)",
  already_published: "บทความนี้เผยแพร่ไปแล้ว",
  not_published: "บทความนี้ยังไม่ได้เผยแพร่",
  delete_forbidden: "ลบไม่ได้ — ต้องเป็นเจ้าของร่าง หรือ Ultra Admin Z",
  slug_conflict: "สร้าง URL ของบทความไม่สำเร็จ ลองอีกครั้ง",
};
const errText = (c: string) => ERR_TH[c] ?? c ?? "เกิดข้อผิดพลาด";

export function ArticleEditor({ initial, canApprove }: { initial: AdminArticle | null; canApprove: boolean }) {
  const router = useRouter();
  const { confirm, dialogs } = useConfirmDialogs();
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<CmsCategory>((initial?.category as CmsCategory) ?? "knowledge");
  const [subCategory, setSubCategory] = useState(initial?.subCategory ?? "นำเข้า");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(initial?.excerpt ?? "");
  const [coverUrl, setCoverUrl] = useState(initial?.coverUrl ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const status = initial?.status ?? "draft";
  const isNew = !initial;
  const isPublished = status === "published";
  const isPending = status === "pending";

  function payload() {
    return {
      id: initial?.id,
      category,
      title: title.trim(),
      excerpt: excerpt.trim(),
      coverUrl: coverUrl.trim(),
      body: body.trim(),
      subCategory: category === "knowledge" ? subCategory : "",
    };
  }

  async function doUpload(file: File) {
    setErr(null); setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadCmsCover(fd);
    setUploading(false);
    if (res.ok && res.data) { setCoverUrl(res.data.url); setNotice("อัปโหลดรูปปกแล้ว"); }
    else if (!res.ok) setErr(errText(res.error));
  }

  /** Save; returns the id (existing or freshly-created), or null on error. */
  async function persist(): Promise<number | null> {
    const res = await saveCmsArticle(payload());
    if (res.ok && res.data) return res.data.id;
    if (!res.ok) setErr(errText(res.error));
    return null;
  }

  function onSave() {
    setErr(null); setNotice(null);
    start(async () => {
      const id = await persist();
      if (id == null) return;
      if (isNew) router.push(`/admin/articles/${id}`);
      else { setNotice("บันทึกแล้ว"); router.refresh(); }
    });
  }

  function onSubmit() {
    setErr(null); setNotice(null);
    start(async () => {
      const id = await persist();
      if (id == null) return;
      const res = await submitCmsArticle({ id });
      if (!res.ok) { setErr(errText(res.error ?? "")); return; }
      setNotice("ส่งให้ Ultra Admin Z อนุมัติแล้ว");
      if (isNew) router.push(`/admin/articles/${id}`); else router.refresh();
    });
  }

  function onApprove() {
    if (!initial) return;
    start(async () => {
      if (!(await confirm("อนุมัติและเผยแพร่บทความนี้ขึ้นหน้าเว็บ?"))) return;
      const res = await approveCmsArticle({ id: initial.id });
      if (!res.ok) { setErr(errText(res.error ?? "")); return; }
      setNotice("✅ เผยแพร่แล้ว — ขึ้นหน้าเว็บเรียบร้อย"); router.refresh();
    });
  }
  function onReject() {
    if (!initial) return;
    start(async () => {
      if (!(await confirm("ตีกลับบทความนี้ให้แก้ไข?"))) return;
      const note = window.prompt("เหตุผล/สิ่งที่ต้องแก้ (ไม่บังคับ):", "") ?? "";
      const res = await rejectCmsArticle({ id: initial.id, note: note.trim() });
      if (!res.ok) { setErr(errText(res.error ?? "")); return; }
      setNotice("ตีกลับแล้ว"); router.refresh();
    });
  }
  function onUnpublish() {
    if (!initial) return;
    start(async () => {
      if (!(await confirm("นำบทความนี้ลงจากหน้าเว็บ (กลับเป็นร่าง)?"))) return;
      const res = await unpublishCmsArticle({ id: initial.id });
      if (!res.ok) { setErr(errText(res.error ?? "")); return; }
      setNotice("นำลงจากหน้าเว็บแล้ว"); router.refresh();
    });
  }
  function onDelete() {
    if (!initial) return;
    start(async () => {
      if (!(await confirm("ลบบทความนี้ถาวร?"))) return;
      const res = await deleteCmsArticle({ id: initial.id });
      if (!res.ok) { setErr(errText(res.error ?? "")); return; }
      router.push("/admin/articles");
    });
  }

  const inputCls = "w-full rounded-lg border border-border bg-white px-3 py-2 text-sm dark:bg-surface";
  const labelCls = "block text-[13px] font-semibold text-foreground mb-1";

  return (
    <div className="space-y-4">
      {dialogs}

      {/* Top bar — back + status + public link */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/admin/articles" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> รายการบทความ
        </Link>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-semibold ${STATUS_STYLE[status]}`}>
            {CMS_STATUS_LABEL[status]}
          </span>
          {isPublished && initial?.slug ? (
            <a href={`/articles/${initial.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:underline">
              <ExternalLink className="h-3.5 w-3.5" /> ดูหน้าเว็บ
            </a>
          ) : null}
        </div>
      </div>

      {initial?.status === "rejected" && initial.rejectNote ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-800">
          <b>ถูกตีกลับ:</b> {initial.rejectNote}
        </div>
      ) : null}
      {err ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div> : null}
      {notice ? <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* ── Editor form ── */}
        <div className="space-y-3 rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>หมวดหมู่</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as CmsCategory)} className={inputCls} aria-label="หมวดหมู่บทความ">
                {CMS_CATEGORIES.map((c) => <option key={c} value={c}>{CMS_CATEGORY_META[c].label}</option>)}
              </select>
              <p className="mt-1 text-[11px] text-muted">ขึ้นที่หน้า {CMS_CATEGORY_META[category].path}</p>
            </div>
            {category === "knowledge" ? (
              <div>
                <label className={labelCls}>ป้ายหมวด (สาระน่ารู้)</label>
                <select value={subCategory} onChange={(e) => setSubCategory(e.target.value)} className={inputCls} aria-label="ป้ายหมวดสาระน่ารู้">
                  {KNOWLEDGE_SUBCATS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            ) : null}
          </div>

          <div>
            <label className={labelCls}>หัวข้อบทความ</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น นำเข้าจีนยังไงให้คุ้ม…" className={inputCls} />
          </div>

          <div>
            <label className={labelCls}>คำโปรย (สรุปสั้นๆ ใต้หัวข้อ)</label>
            <textarea value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={2} placeholder="2–3 บรรทัด สรุปว่าบทความนี้เกี่ยวกับอะไร" className={`${inputCls} resize-y`} />
          </div>

          {/* Cover upload */}
          <div>
            <label className={labelCls}>รูปปก</label>
            <div className="flex items-center gap-3">
              <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-alt">
                {coverUrl ? <Image src={coverUrl} alt="ปก" fill sizes="64px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] text-muted">ไม่มีรูป</span>}
              </div>
              <div className="flex flex-col gap-1.5">
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50">
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} อัปโหลดรูปปก
                </button>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) doUpload(f); }} />
                <p className="text-[11px] text-muted">แนวตั้ง 3:4 จะสวยที่สุด · ≤ 5 MB</p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelCls + " mb-0"}>เนื้อหา</label>
              <button type="button" onClick={() => setPreview((p) => !p)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:underline">
                {preview ? <><EyeOff className="h-3.5 w-3.5" /> ซ่อนตัวอย่าง</> : <><Eye className="h-3.5 w-3.5" /> ดูตัวอย่าง</>}
              </button>
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={16} placeholder={"พิมพ์เนื้อหาได้เลย — ระบบจัดรูปแบบให้อัตโนมัติ\n\nเคล็ดลับจัดรูปแบบ:\n📦 ขึ้นต้นบรรทัดด้วยอิโมจิ = หัวข้อใหญ่\n1. ตัวเลขนำหน้า = ลิสต์เป็นข้อๆ\n- ขีดนำหน้า = bullet\n“ครอบด้วยอัญประกาศ” = คำพูดเน้น"} className={`${inputCls} resize-y font-mono text-[13px] leading-relaxed`} />
            <p className="mt-1 text-[11px] text-muted">พิมพ์ข้อความธรรมดา ระบบ render เป็นบทความสวยเองเหมือนบทความเดิม — กด “ดูตัวอย่าง” เพื่อเช็ค</p>
          </div>

          {/* Save / submit actions */}
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <button type="button" onClick={onSave} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-4 py-2 text-sm font-semibold text-foreground hover:bg-surface-alt disabled:opacity-50 dark:bg-surface">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} บันทึกร่าง
            </button>
            {!isPublished ? (
              <button type="button" onClick={onSubmit} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-50">
                <Send className="h-4 w-4" /> บันทึก + ส่งอนุมัติ
              </button>
            ) : null}
          </div>
        </div>

        {/* ── Preview / approval column ── */}
        <div className="space-y-4">
          {/* Ultra approval panel */}
          {!isNew && (canApprove || isPending) ? (
            <div className="rounded-2xl border border-primary-200 bg-primary-50/40 p-4 dark:border-primary-900/50 dark:bg-primary-950/10">
              <h3 className="text-sm font-black text-foreground">การอนุมัติ (Ultra Admin Z)</h3>
              {canApprove ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {!isPublished ? (
                    <button type="button" onClick={onApprove} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                      <Check className="h-4 w-4" /> อนุมัติ + เผยแพร่
                    </button>
                  ) : (
                    <button type="button" onClick={onUnpublish} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                      <EyeOff className="h-4 w-4" /> นำลงจากเว็บ
                    </button>
                  )}
                  {!isPublished ? (
                    <button type="button" onClick={onReject} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50">
                      <X className="h-4 w-4" /> ตีกลับ
                    </button>
                  ) : null}
                  <button type="button" onClick={onDelete} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-alt disabled:opacity-50">
                    <Trash2 className="h-4 w-4" /> ลบ
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[13px] text-muted">รอ Ultra Admin Z อนุมัติ — เมื่ออนุมัติแล้วบทความจะขึ้นหน้าเว็บทันที</p>
              )}
            </div>
          ) : null}

          {/* Live preview */}
          {preview ? (
            <div className="rounded-2xl border border-border bg-white p-4 shadow-sm dark:bg-surface">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted">ตัวอย่างหน้าเว็บ</p>
              <h2 className="text-xl font-black text-foreground">{title || "หัวข้อบทความ"}</h2>
              {excerpt ? <p className="mt-1 text-sm text-muted">{excerpt}</p> : null}
              <div className="mt-3">
                {body.trim() ? <ArticleContent text={body} title={title} /> : <p className="text-sm text-muted">— ยังไม่มีเนื้อหา —</p>}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-surface-alt/40 p-6 text-center text-sm text-muted">
              กด “ดูตัวอย่าง” ที่ช่องเนื้อหา เพื่อดูว่าบทความจะออกมาหน้าตาแบบไหนบนเว็บ
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
