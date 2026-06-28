"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import {
  Save, Send, Check, X, Upload, Loader2, Eye, EyeOff, Trash2, ExternalLink, ArrowLeft, ImagePlus, Search, Video, Plus, Star,
} from "lucide-react";
import { useConfirmDialogs } from "@/components/ui/pacred-dialog";
import { ArticleContent } from "@/components/knowledge/article-content";
import {
  saveCmsArticle, submitCmsArticle, approveCmsArticle, rejectCmsArticle,
  unpublishCmsArticle, deleteCmsArticle, uploadCmsCover, uploadCmsVideo, type AdminArticle,
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
  const [metaTitle, setMetaTitle] = useState(initial?.metaTitle ?? "");
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [videoUrl, setVideoUrl] = useState(initial?.videoUrl ?? "");
  const [galleryImages, setGalleryImages] = useState<string[]>(initial?.galleryImages ?? []);
  // our_work case-study pattern (mig 0213) — match the website case page.
  const [casePrice, setCasePrice] = useState(initial?.casePrice ?? "");
  const [caseRating, setCaseRating] = useState<number | null>(initial?.caseRating ?? null);
  const [caseRoute, setCaseRoute] = useState(initial?.caseRoute ?? "");
  const [caseFacts, setCaseFacts] = useState<{ label: string; value: string }[]>(initial?.caseFacts ?? []);
  const [seoOpen, setSeoOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const [insertingImg, setInsertingImg] = useState(false);
  const [preview, setPreview] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodyFileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const galleryFileRef = useRef<HTMLInputElement>(null);

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
      metaTitle: metaTitle.trim(),
      metaDescription: metaDescription.trim(),
      tags,
      videoUrl: category === "our_work" ? videoUrl.trim() : "",
      galleryImages: category === "our_work" ? galleryImages : [],
      casePrice: category === "our_work" ? casePrice.trim() : "",
      caseRating: category === "our_work" ? caseRating : null,
      caseRoute: category === "our_work" ? caseRoute.trim() : "",
      caseFacts: category === "our_work"
        ? caseFacts.map((f) => ({ label: f.label.trim(), value: f.value.trim() })).filter((f) => f.label || f.value)
        : [],
    };
  }

  function addTag(raw: string) {
    const t = raw.trim().replace(/,+$/, "").trim();
    if (!t) { setTagDraft(""); return; }
    setTags((cur) => (cur.includes(t) ? cur : [...cur, t].slice(0, 30)));
    setTagDraft("");
  }
  function removeTag(t: string) {
    setTags((cur) => cur.filter((x) => x !== t));
  }

  /** Upload an image and insert a markdown ![](url) marker at the body cursor. */
  async function insertBodyImage(file: File) {
    setErr(null); setInsertingImg(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadCmsCover(fd);
    setInsertingImg(false);
    if (!res.ok) { setErr(errText(res.error)); return; }
    if (!res.data) return;
    const marker = `\n![](${res.data.url})\n`;
    const el = bodyRef.current;
    const start = el?.selectionStart ?? body.length;
    const end = el?.selectionEnd ?? body.length;
    const next = body.slice(0, start) + marker + body.slice(end);
    setBody(next);
    if (el) queueMicrotask(() => { el.focus(); const pos = start + marker.length; el.setSelectionRange(pos, pos); });
    setNotice("แทรกรูปในเนื้อหาแล้ว — กด \"ดูตัวอย่าง\" เพื่อเช็ค");
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

  async function doUploadVideo(file: File) {
    setErr(null); setUploadingVideo(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadCmsVideo(fd);
    setUploadingVideo(false);
    if (res.ok && res.data) { setVideoUrl(res.data.url); setNotice("อัปโหลดวิดีโอแล้ว"); }
    else if (!res.ok) setErr(errText(res.error));
  }

  async function addGalleryImage(file: File) {
    setErr(null); setUploadingGallery(true);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadCmsCover(fd);
    setUploadingGallery(false);
    if (res.ok && res.data) {
      setGalleryImages((cur) => [...cur, res.data!.url]);
      setNotice("เพิ่มรูปแกลเลอรีแล้ว");
    } else if (!res.ok) setErr(errText(res.error));
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
            <a
              href={category === "our_work" ? `/our-work/${initial.slug}` : `/articles/${initial.slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:underline"
            >
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
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="เช่น นำเข้าของจีนยังไงให้คุ้ม…" className={inputCls} />
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
                {coverUrl ? <Image src={coverUrl} alt="ปก" fill sizes="64px" className="object-cover" /> : <span className="flex h-full items-center justify-center text-[11px] text-muted">ไม่มีรูป</span>}
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

          {/* ── สื่อผลงาน — only for ผลงานของเรา ── */}
          {category === "our_work" ? (
            <div className="rounded-xl border border-primary-100 bg-primary-50/30 p-3 space-y-3 dark:border-primary-900/30 dark:bg-primary-950/10">
              <p className="text-[13px] font-black text-foreground">สื่อผลงาน</p>

              {/* Video */}
              <div>
                <label className={labelCls}>วิดีโอ (ไม่บังคับ)</label>
                <div className="flex gap-2">
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=… หรือ URL วิดีโอ"
                    className={`${inputCls} flex-1`}
                    type="url"
                  />
                  <button
                    type="button"
                    onClick={() => videoFileRef.current?.click()}
                    disabled={uploadingVideo}
                    title="อัปโหลดไฟล์วิดีโอโดยตรง (≤ 50 MB)"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-xs font-semibold text-foreground hover:bg-surface-alt disabled:opacity-50 dark:bg-surface"
                  >
                    {uploadingVideo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />}
                    อัปโหลด
                  </button>
                  <input
                    ref={videoFileRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) doUploadVideo(f); if (e.target) e.target.value = ""; }}
                  />
                </div>
                {videoUrl ? (
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="flex-1 truncate text-[11px] text-muted">{videoUrl}</span>
                    <button type="button" onClick={() => setVideoUrl("")} className="text-[11px] font-semibold text-rose-600 hover:underline">ลบ</button>
                  </div>
                ) : null}
                <p className="mt-1 text-[11px] text-muted">วาง YouTube URL หรืออัปโหลดคลิปสั้น (≤ 50 MB) · ไม่มีก็ได้</p>
              </div>

              {/* Gallery */}
              <div>
                <label className={labelCls}>รูปแกลเลอรี (ต่อจากรูปปก)</label>
                {galleryImages.length > 0 ? (
                  <div className="mb-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {galleryImages.map((url, i) => (
                      <div key={`${url}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-surface-alt">
                        <Image src={url} alt={`แกลเลอรีรูปที่ ${i + 1}`} fill sizes="80px" className="object-cover" />
                        <button
                          type="button"
                          onClick={() => setGalleryImages((cur) => cur.filter((_, idx) => idx !== i))}
                          aria-label={`ลบรูปที่ ${i + 1}`}
                          className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X className="h-5 w-5 text-white" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => galleryFileRef.current?.click()}
                  disabled={uploadingGallery || galleryImages.length >= 20}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                >
                  {uploadingGallery ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                  เพิ่มรูปแกลเลอรี {galleryImages.length > 0 ? `(${galleryImages.length}/20)` : ""}
                </button>
                <input
                  ref={galleryFileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) addGalleryImage(f); if (e.target) e.target.value = ""; }}
                />
                <p className="mt-1 text-[11px] text-muted">รูปจะแสดงใน filmstrip ต่อจากรูปปก · Hover เพื่อลบ · สูงสุด 20 รูป · ≤ 5 MB/รูป</p>
              </div>

              {/* ── ข้อมูลเคส (แพทเทิร์นหน้าเว็บ) — ราคา · เรต · เส้นทาง · ข้อมูลขนส่ง ── */}
              <div className="border-t border-primary-100 pt-3 dark:border-primary-900/30">
                <p className="text-[13px] font-black text-foreground">ข้อมูลเคส (แพทเทิร์นหน้าเว็บ)</p>
                <p className="mb-2 text-[11px] text-muted">เติมให้ตรงหน้า /our-work — ราคา · เรตดาว · เส้นทาง · ข้อมูลขนส่ง (ไม่ใส่ก็ได้)</p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>ราคาเริ่มต้น</label>
                    <input value={casePrice} onChange={(e) => setCasePrice(e.target.value)} placeholder="เช่น เริ่ม $500" className={inputCls} />
                    <p className="mt-1 text-[11px] text-muted">โชว์กล่องขวา · ว่าง = “ขอใบเสนอราคาฟรี”</p>
                  </div>
                  <div>
                    <label className={labelCls}><Star className="mr-0.5 inline h-3 w-3 fill-yellow-400 text-yellow-400" />เรตดาว (0–5)</label>
                    <input
                      type="number" min={0} max={5} step={0.1}
                      value={caseRating ?? ""}
                      onChange={(e) => setCaseRating(e.target.value === "" ? null : Math.max(0, Math.min(5, Number(e.target.value))))}
                      placeholder="เช่น 5"
                      className={inputCls}
                    />
                    <p className="mt-1 text-[11px] text-muted">ว่าง = ค่าเฉลี่ยจากรีวิว / 5.0</p>
                  </div>
                </div>

                <div className="mt-3">
                  <label className={labelCls}>เส้นทาง</label>
                  <input value={caseRoute} onChange={(e) => setCaseRoute(e.target.value)} placeholder="เช่น กวางโจว → แหลมฉบัง" className={inputCls} />
                </div>

                <div className="mt-3">
                  <label className={labelCls}>ข้อมูลขนส่ง <span className="text-[11px] font-normal text-muted">(หัวข้อ · ค่า)</span></label>
                  {caseFacts.length > 0 ? (
                    <div className="space-y-2">
                      {caseFacts.map((f, i) => (
                        <div key={i} className="flex gap-2">
                          <input value={f.label} onChange={(e) => setCaseFacts((cur) => cur.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))} placeholder="หัวข้อ เช่น บริการ / ช่องทาง" className={`${inputCls} flex-1`} />
                          <input value={f.value} onChange={(e) => setCaseFacts((cur) => cur.map((x, idx) => (idx === i ? { ...x, value: e.target.value } : x)))} placeholder="ค่า เช่น ทางเรือ · FCL" className={`${inputCls} flex-1`} />
                          <button type="button" onClick={() => setCaseFacts((cur) => cur.filter((_, idx) => idx !== i))} aria-label={`ลบแถวที่ ${i + 1}`} className="inline-flex shrink-0 items-center rounded-lg border border-border px-2 text-muted hover:bg-surface-alt">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <button type="button" onClick={() => setCaseFacts((cur) => (cur.length >= 20 ? cur : [...cur, { label: "", value: "" }]))} disabled={caseFacts.length >= 20} className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-primary-300 bg-primary-50 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50">
                    <Plus className="h-3.5 w-3.5" /> เพิ่มแถวข้อมูล
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {/* Tags (HS code · product category …) — the /our-work filter bar */}
          <div>
            <label className={labelCls}>
              แท็ก <span className="text-[11px] font-normal text-muted">(เช่น HS code · ประเภทสินค้า — พิมพ์แล้วกด Enter)</span>
            </label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-white px-2 py-1.5 dark:bg-surface">
              {tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full border border-primary-200 bg-primary-50 px-2 py-0.5 text-xs font-semibold text-primary-700">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} aria-label={`ลบแท็ก ${t}`} className="hover:text-primary-900"><X className="h-3 w-3" /></button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagDraft); }
                  else if (e.key === "Backspace" && !tagDraft && tags.length) { removeTag(tags[tags.length - 1]); }
                }}
                onBlur={() => addTag(tagDraft)}
                placeholder={tags.length ? "เพิ่มแท็ก…" : "เช่น 3926.90 · พลาสติก · เครื่องสำอาง"}
                aria-label="เพิ่มแท็ก"
                className="min-w-[120px] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm outline-none"
              />
            </div>
            <p className="mt-1 text-[11px] text-muted">ใช้กรองผลงานบนหน้าเว็บ + เป็น <b>SEO keyword</b> ของหน้านี้ด้วย — ผู้เข้าชมกดแท็กแล้วจะเห็นผลงานในแท็กนั้น (เด่นในหน้า “ผลงานของเรา”)</p>
          </div>

          {/* Body */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className={labelCls + " mb-0"}>
                เนื้อหา{" "}
                {category === "our_work" ? (
                  <span className="text-[11px] font-normal text-muted">(ไม่บังคับ ถ้ามี gallery/video แล้ว)</span>
                ) : null}
              </label>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => bodyFileRef.current?.click()} disabled={insertingImg} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:underline disabled:opacity-50">
                  {insertingImg ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} แทรกรูป
                </button>
                <button type="button" onClick={() => setPreview((p) => !p)} className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary-600 hover:underline">
                  {preview ? <><EyeOff className="h-3.5 w-3.5" /> ซ่อนตัวอย่าง</> : <><Eye className="h-3.5 w-3.5" /> ดูตัวอย่าง</>}
                </button>
              </div>
            </div>
            <input ref={bodyFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) insertBodyImage(f); if (e.target) e.target.value = ""; }} />
            <textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} rows={16} placeholder={"พิมพ์เนื้อหาได้เลย — ระบบจัดรูปแบบให้อัตโนมัติ\n\nเคล็ดลับจัดรูปแบบ:\n📦 ขึ้นต้นบรรทัดด้วยอิโมจิ = หัวข้อใหญ่\n1. ตัวเลขนำหน้า = ลิสต์เป็นข้อๆ\n- ขีดนำหน้า = bullet\n\"ครอบด้วยอัญประกาศ\" = คำพูดเน้น\nกด \"แทรกรูป\" เพื่อใส่รูปในเนื้อหา"} className={`${inputCls} resize-y font-mono text-[13px] leading-relaxed`} />
            <p className="mt-1 text-[11px] text-muted">พิมพ์ข้อความธรรมดา ระบบ render เป็นบทความสวยเอง · กด “แทรกรูป” ใส่ได้หลายรูปในเนื้อหา · กด “ดูตัวอย่าง” เพื่อเช็ค</p>
          </div>

          {/* SEO (collapsible · optional) */}
          <div className="border-t border-border pt-3">
            <button type="button" onClick={() => setSeoOpen((s) => !s)} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-foreground">
              <Search className="h-4 w-4 text-muted" /> SEO — Google / แชร์ลิงก์ <span className="text-muted">{seoOpen ? "▲" : "▼"}</span>
              <span className="text-[11px] font-normal text-muted">ไม่ใส่ก็ได้ · ระบบใช้หัวข้อ/คำโปรยแทน</span>
            </button>
            {seoOpen ? (
              <div className="mt-2 space-y-3">
                <div>
                  <label className={labelCls}>SEO Title (ชื่อบนแท็บ/Google)</label>
                  <input value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} maxLength={200} placeholder="ปล่อยว่าง = ใช้หัวข้อบทความ" className={inputCls} />
                  <p className="mt-1 text-[11px] text-muted">{metaTitle.length}/200 · แนะนำ ~50–60 ตัวอักษร</p>
                </div>
                <div>
                  <label className={labelCls}>SEO Description (คำอธิบายใต้ลิงก์ใน Google)</label>
                  <textarea value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} maxLength={400} rows={2} placeholder="ปล่อยว่าง = ใช้คำโปรย" className={`${inputCls} resize-y`} />
                  <p className="mt-1 text-[11px] text-muted">{metaDescription.length}/400 · แนะนำ ~150–160 ตัวอักษร</p>
                </div>
              </div>
            ) : null}
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
