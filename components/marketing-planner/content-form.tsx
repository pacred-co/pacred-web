"use client";

/**
 * Create / edit a content item (owner brief §2.2). Every dropdown reads from
 * settings (GroupSelect) — nothing hardcoded. Multi-link editor with inline
 * preview. Validates title/publishDate/status/owner/URL before save.
 *
 * The body is keyed by (editId, defaultDate) and only mounts while open, so its
 * form state initialises once per open via a lazy useState initializer — no
 * sync-setState-in-effect.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Trash2, Link2 } from "lucide-react";
import type { ContentItem, ContentLink } from "@/lib/marketing-planner/types";
import { platformIdsOf, serviceIdsOf } from "@/lib/marketing-planner/types";
import { titleLimitFor } from "@/lib/marketing-planner/platform-title-limits";
import { usePlanner, uid } from "@/lib/marketing-planner/store";
import { fmtNum } from "@/lib/marketing-planner/util";
import { btnGhost, btnPrimary, cx, Field, GroupMultiSelect, GroupSelect, inputCls, Modal, UserSelect } from "./ui";
import { LinkPreview } from "./link-preview";

// Content ใหม่ default แพลตฟอร์ม = YouTube/Facebook/TikTok/IG (owner ปอน 2026-07-18).
// platform id = "platform-<key>" (SettingItem ไม่มี field key) → แยก key จาก id.
const DEFAULT_PLATFORM_KEYS = new Set(["youtube", "facebook", "tiktok", "instagram"]);
const platformKeyOf = (id: string) => id.replace(/^platform-/, "").toLowerCase();

type FormState = {
  title: string;
  topic: string;
  brief: string;
  marketingGoalId?: string;
  contentTypeId?: string;
  contentPillarId?: string;
  funnelStageId?: string;
  customerStageId?: string;
  platformIds: string[];
  platformTitles: Record<string, string>; // platformId → ชื่อดราฟต์ต่อแพลตฟอร์ม
  serviceIds: string[];
  campaignId?: string;
  formatId?: string;
  toneId?: string;
  targetAudience: string;
  keyword: string;
  hashtag: string;
  cta: string;
  hook: string;
  painPoint: string;
  context: string;
  storyTelling: string;
  proof: string;
  authority: string;
  visual: string;
  organicSelling: string;
  branding: string;
  esg: string;
  contact: string;
  channelIds: string[];
  priorityId?: string;
  statusId?: string;
  ownerId?: string;
  coOwnerIds: string[];
  startDate: string;
  deadline: string;
  publishDate: string;
  publishTime: string;
  note: string;
  links: ContentLink[];
};

function blank(defaults?: Partial<FormState>): FormState {
  return {
    title: "", topic: "", brief: "",
    targetAudience: "", keyword: "", hashtag: "", cta: "",
    hook: "", painPoint: "", context: "", storyTelling: "", proof: "", authority: "",
    visual: "", organicSelling: "", branding: "", esg: "", contact: "", channelIds: [], platformIds: [], platformTitles: {}, serviceIds: [],
    coOwnerIds: [], startDate: "", deadline: "", publishDate: "", publishTime: "", note: "",
    links: [],
    ...defaults,
  };
}

function fromContent(c: ContentItem): FormState {
  return {
    title: c.title, topic: c.topic ?? "", brief: c.brief ?? "",
    marketingGoalId: c.marketingGoalId, contentTypeId: c.contentTypeId, contentPillarId: c.contentPillarId,
    funnelStageId: c.funnelStageId, customerStageId: c.customerStageId, platformIds: platformIdsOf(c), platformTitles: c.platformTitles ?? {},
    serviceIds: serviceIdsOf(c), campaignId: c.campaignId, formatId: c.formatId, toneId: c.toneId,
    targetAudience: c.targetAudience ?? "", keyword: c.keyword ?? "", hashtag: c.hashtag ?? "", cta: c.cta ?? "",
    hook: c.hook ?? "", painPoint: c.painPoint ?? "", context: c.context ?? "", storyTelling: c.storyTelling ?? "",
    proof: c.proof ?? "", authority: c.authority ?? "", visual: c.visual ?? "", organicSelling: c.organicSelling ?? "",
    branding: c.branding ?? "", esg: c.esg ?? "", contact: c.contact ?? "", channelIds: c.channelIds ?? [],
    priorityId: c.priorityId, statusId: c.statusId, ownerId: c.ownerId, coOwnerIds: c.coOwnerIds ?? [],
    startDate: c.startDate ?? "", deadline: c.deadline ?? "", publishDate: c.publishDate ?? "", publishTime: c.publishTime ?? "",
    note: c.note ?? "", links: c.links.map((l) => ({ ...l })),
  };
}

function isValidUrl(s: string): boolean {
  const v = s.trim();
  if (!v) return false;
  try {
    new URL(v.includes("://") ? v : `https://${v}`);
    return /\./.test(v);
  } catch {
    return false;
  }
}

function FormSection({ title, children, cols = 2 }: { title: string; children: React.ReactNode; cols?: 1 | 2 | 3 }) {
  const grid = cols === 3 ? "sm:grid-cols-3" : cols === 1 ? "" : "sm:grid-cols-2";
  return (
    <fieldset className="space-y-2.5">
      <legend className="text-[12px] font-bold uppercase tracking-wide text-primary-600">{title}</legend>
      <div className={cx("grid gap-3", grid)}>{children}</div>
    </fieldset>
  );
}

/** 3-char n-grams of a string — used to fuzzy-match a service name to a keyword's
 *  free-text service label (Thai has no word spaces, so token match is unreliable). */
function ngrams(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= s.length; i += 1) out.push(s.slice(i, i + n));
  return out;
}

type KwSuggestion = { keyword: string; service: string; volume?: number; matched?: boolean };

/** Keyword/SEO tag input — type your own OR pick from the Keyword-Planner dropdown
 *  (suggestions relevant to the picked service bubble to the top). Stored as a
 *  comma-joined string so search/filter/detail keep working with no data change. */
function KeywordTagInput({ value, onChange, suggestions }: { value: string; onChange: (v: string) => void; suggestions: KwSuggestion[] }) {
  const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const addTag = (kw: string) => {
    const t = kw.trim();
    if (t && !tags.includes(t)) onChange([...tags, t].join(", "));
    setText("");
  };
  const removeTag = (kw: string) => onChange(tags.filter((t) => t !== kw).join(", "));
  const q = text.trim().toLowerCase();
  const filtered = suggestions.filter((s) => !tags.includes(s.keyword) && (!q || s.keyword.toLowerCase().includes(q) || s.service.toLowerCase().includes(q)));
  return (
    <div className="relative" ref={ref}>
      <div className={cx(inputCls, "flex min-h-[38px] flex-wrap items-center gap-1")}>
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[12px] font-medium text-primary-700 dark:bg-primary-900/30">
            {t}
            <span role="button" tabIndex={-1} aria-label={`เอา ${t} ออก`} onClick={() => removeTag(t)} className="cursor-pointer leading-none hover:opacity-60">×</span>
          </span>
        ))}
        <input
          className="min-w-[140px] flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted/60"
          value={text}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(text); }
            else if (e.key === "Backspace" && !text && tags.length) removeTag(tags[tags.length - 1]);
          }}
          placeholder={tags.length ? "" : "พิมพ์ keyword เอง หรือเลือกจากรายการแนะนำ…"}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 z-40 mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-white p-1 shadow-lg dark:bg-surface">
          {filtered.slice(0, 40).map((s, i) => (
            <button key={`${s.keyword}-${i}`} type="button" onClick={() => addTag(s.keyword)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left hover:bg-primary-50 dark:hover:bg-primary-900/20">
              <span className="flex items-center gap-1.5 text-[13px] text-foreground">
                {s.matched && <span className="text-primary-600" title="ตรงกับบริการที่เลือก">★</span>}
                {s.keyword}
              </span>
              <span className="shrink-0 text-[11px] text-muted">{s.service}{s.volume ? ` · ${fmtNum(s.volume)}/ด.` : ""}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ContentForm({ open, onClose, editId, defaultDate }: { open: boolean; onClose: () => void; editId?: string; defaultDate?: string }) {
  if (!open) return null;
  return <ContentFormBody key={`${editId ?? "new"}:${defaultDate ?? ""}`} onClose={onClose} editId={editId} defaultDate={defaultDate} />;
}

/** ชื่อคอนเทนต์แยกต่อแพลตฟอร์ม (owner ปอน 2026-07-18) — 1 แถวต่อแพลตฟอร์มที่เลือก +
 *  ตัวนับตัวอักษรตามลิมิตจริงของแต่ละที่ (soft · แดงเมื่อเกิน · เว้นว่าง = ใช้ชื่อหลัก). */
function PlatformTitles({ platformIds, platformTitles, platformItems, mainTitle, onChange }: {
  platformIds: string[];
  platformTitles: Record<string, string>;
  platformItems: { id: string; name: string; color?: string }[];
  mainTitle: string;
  onChange: (pid: string, v: string) => void;
}) {
  const selected = platformItems.filter((p) => platformIds.includes(p.id));
  return (
    <div className="rounded-lg border border-dashed border-border p-2.5">
      <p className="mb-1.5 text-[12px] font-medium text-foreground">
        ชื่อต่อแพลตฟอร์ม <span className="font-normal text-muted">(ดราฟต์ให้พอดีลิมิตแต่ละที่ · เว้นว่าง = ใช้ชื่อหลัก)</span>
      </p>
      {selected.length === 0 ? (
        <p className="text-[12px] text-muted">เลือกแพลตฟอร์มในหัวข้อ “การจัดประเภท” ก่อน แล้วช่องชื่อจะขึ้นตามที่เลือก</p>
      ) : (
        <div className="space-y-1.5">
          {selected.map((p) => {
            const val = platformTitles[p.id] ?? "";
            const limit = titleLimitFor({ key: p.id.replace(/^platform-/, ""), name: p.name });
            const over = limit != null && val.length > limit;
            return (
              <div key={p.id} className="flex items-center gap-2">
                <span className="flex w-24 shrink-0 items-center gap-1.5 text-[12px] text-foreground">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.color ?? "#9ca3af" }} />
                  <span className="truncate" title={p.name}>{p.name}</span>
                </span>
                <input
                  className={cx(inputCls, "min-w-0 flex-1", over && "border-red-400 focus:border-red-400 focus:ring-red-100")}
                  value={val}
                  onChange={(e) => onChange(p.id, e.target.value)}
                  placeholder={mainTitle || `ชื่อสำหรับ ${p.name}`}
                />
                {limit != null && (
                  <span className={cx("w-14 shrink-0 text-right text-[11px] tabular-nums", over ? "font-semibold text-red-600" : "text-muted")}>
                    {val.length}/{limit}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ContentFormBody({ onClose, editId, defaultDate }: { onClose: () => void; editId?: string; defaultDate?: string }) {
  const { contents, byGroup, byId, keywords, addContent, updateContent } = usePlanner();
  const linkTypes = byGroup("linkType");
  const defaultStatus = byGroup("status")[0]?.id;
  // Content ใหม่ = default แพลตฟอร์ม YouTube/Facebook/TikTok/IG (resolve id จาก settings).
  const defaultPlatformIds = useMemo(
    () => byGroup("platform").filter((p) => DEFAULT_PLATFORM_KEYS.has(platformKeyOf(p.id))).map((p) => p.id),
    [byGroup],
  );

  const [form, setForm] = useState<FormState>(() => {
    const existing = editId ? contents.find((c) => c.id === editId) : undefined;
    return existing ? fromContent(existing) : blank({ publishDate: defaultDate ?? "", statusId: defaultStatus, platformIds: defaultPlatformIds });
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [craftOpen, setCraftOpen] = useState(false);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setPlatformTitle = (pid: string, v: string) => setForm((f) => ({ ...f, platformTitles: { ...f.platformTitles, [pid]: v } }));

  // Keyword suggestions from the Keyword Planner; keywords for any of the picked
  // services bubble to the top (matched by 3-gram — Thai has no word spaces).
  const kwSuggestions = useMemo<KwSuggestion[]>(() => {
    const names = form.serviceIds.map((id) => byId(id)?.name ?? "").filter(Boolean);
    const grams = names.flatMap((n) => ngrams(n.toLowerCase(), 3));
    const isMatch = (svc: string) => grams.length > 0 && grams.some((g) => svc.toLowerCase().includes(g));
    const mapped: KwSuggestion[] = keywords.map((k) => ({ keyword: k.keyword, service: k.service, volume: k.volume, matched: isMatch(k.service) }));
    return [...mapped.filter((m) => m.matched), ...mapped.filter((m) => !m.matched)];
  }, [keywords, form.serviceIds, byId]);
  const craftCount = [form.hook, form.painPoint, form.context, form.storyTelling, form.proof, form.authority, form.visual, form.organicSelling, form.branding, form.esg, form.contact, form.keyword].filter((x) => x.trim()).length;

  const addLink = () =>
    setForm((f) => ({ ...f, links: [...f.links, { id: uid("link"), linkTypeId: linkTypes[0]?.id ?? "", url: "", title: "", createdAt: new Date().toISOString() }] }));
  const updateLink = (id: string, patch: Partial<ContentLink>) =>
    setForm((f) => ({ ...f, links: f.links.map((l) => (l.id === id ? { ...l, ...patch } : l)) }));
  const removeLink = (id: string) => setForm((f) => ({ ...f, links: f.links.filter((l) => l.id !== id) }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.title.trim()) e.title = "กรุณากรอกชื่อคอนเทนต์";
    if (!form.publishDate) e.publishDate = "กรุณาเลือกวันที่ลง";
    if (!form.statusId) e.statusId = "กรุณาเลือกสถานะ";
    // ผู้รับผิดชอบ = optional: generated/placeholder slots have no owner yet, so
    // requiring one silently blocked saving a quick edit. Assign later if needed.
    form.links.forEach((l) => {
      if (l.url.trim() && !isValidUrl(l.url)) e[`link-${l.id}`] = "URL ไม่ถูกต้อง";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const links = form.links.filter((l) => l.url.trim());
    // เก็บชื่อต่อแพลตฟอร์ม เฉพาะที่เลือกอยู่ + ไม่ว่าง
    const platformTitles = Object.fromEntries(
      form.platformIds.map((pid) => [pid, (form.platformTitles[pid] ?? "").trim()] as const).filter(([, v]) => v),
    );
    const payload = {
      title: form.title.trim(),
      topic: form.topic.trim() || undefined,
      brief: form.brief.trim() || undefined,
      marketingGoalId: form.marketingGoalId, contentTypeId: form.contentTypeId, contentPillarId: form.contentPillarId,
      funnelStageId: form.funnelStageId, customerStageId: form.customerStageId, platformIds: form.platformIds, platformId: form.platformIds[0],
      platformTitles: Object.keys(platformTitles).length ? platformTitles : undefined,
      serviceIds: form.serviceIds, serviceId: form.serviceIds[0], campaignId: form.campaignId, formatId: form.formatId, toneId: form.toneId,
      targetAudience: form.targetAudience.trim() || undefined, keyword: form.keyword.trim() || undefined,
      hashtag: form.hashtag.trim() || undefined, cta: form.cta.trim() || undefined,
      hook: form.hook.trim() || undefined, painPoint: form.painPoint.trim() || undefined,
      context: form.context.trim() || undefined, storyTelling: form.storyTelling.trim() || undefined,
      proof: form.proof.trim() || undefined, authority: form.authority.trim() || undefined,
      visual: form.visual.trim() || undefined, organicSelling: form.organicSelling.trim() || undefined,
      branding: form.branding.trim() || undefined, esg: form.esg.trim() || undefined,
      contact: form.contact.trim() || undefined, channelIds: form.channelIds,
      priorityId: form.priorityId, statusId: form.statusId, ownerId: form.ownerId, coOwnerIds: form.coOwnerIds,
      startDate: form.startDate || undefined, deadline: form.deadline || undefined,
      publishDate: form.publishDate || undefined, publishTime: form.publishTime || undefined,
      note: form.note.trim() || undefined, links,
    };
    if (editId) updateContent(editId, payload);
    else addContent({ ...payload, title: payload.title });
    onClose();
  };

  const errCls = (k: string) => (errors[k] ? "border-red-400 focus:border-red-400 focus:ring-red-100" : "");

  return (
    <Modal
      open
      onClose={onClose}
      title={editId ? "แก้ไขคอนเทนต์" : "สร้างคอนเทนต์ใหม่"}
      size="xl"
      footer={
        <>
          {Object.keys(errors).length > 0 && (
            <span className="mr-auto self-center text-[12px] font-medium text-red-600">⚠ กรอกช่องที่จำเป็นให้ครบ (ช่องที่ทำเครื่องหมายสีแดง)</span>
          )}
          <button type="button" className={btnGhost} onClick={onClose}>ยกเลิก</button>
          <button type="button" className={btnPrimary} onClick={submit}>{editId ? "บันทึกการแก้ไข" : "สร้างคอนเทนต์"}</button>
        </>
      }
    >
      <div className="space-y-5">
        <FormSection title="ข้อมูลหลัก" cols={1}>
          <Field label="ชื่อคอนเทนต์" required hint={errors.title}>
            <input className={cx(inputCls, errCls("title"))} value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="เช่น นำเข้าจากจีนแบบ LCL ต้องรู้อะไรบ้าง" />
          </Field>
          <PlatformTitles platformIds={form.platformIds} platformTitles={form.platformTitles} platformItems={byGroup("platform")} mainTitle={form.title} onChange={setPlatformTitle} />
          <Field label="หัวข้อคอนเทนต์">
            <input className={inputCls} value={form.topic} onChange={(e) => set("topic", e.target.value)} />
          </Field>
          <Field label="คำอธิบาย / Brief">
            <textarea className={cx(inputCls, "min-h-[72px] resize-y")} value={form.brief} onChange={(e) => set("brief", e.target.value)} />
          </Field>
        </FormSection>

        <FormSection title="การจัดประเภท" cols={3}>
          <Field label="แพลตฟอร์ม (เลือกได้หลายช่อง)" className="sm:col-span-3">
            <GroupMultiSelect group="platform" value={form.platformIds} onChange={(ids) => set("platformIds", ids)} placeholder="— เลือกแพลตฟอร์ม (ได้หลายช่อง) —" />
          </Field>
          <Field label="ประเภทคอนเทนต์"><GroupSelect group="contentType" value={form.contentTypeId} onChange={(v) => set("contentTypeId", v)} /></Field>
          <Field label="เสาหลัก (Pillar)"><GroupSelect group="contentPillar" value={form.contentPillarId} onChange={(v) => set("contentPillarId", v)} /></Field>
          <Field label="บริการที่เกี่ยวข้อง (เลือกได้หลายช่อง)" className="sm:col-span-3">
            <GroupMultiSelect group="service" value={form.serviceIds} onChange={(ids) => set("serviceIds", ids)} placeholder="— เลือกบริการ (ได้หลายช่อง) —" />
          </Field>
        </FormSection>

        <FormSection title="กำหนดการ" cols={2}>
          <Field label="วันที่ลง" required hint={errors.publishDate}><input type="date" className={cx(inputCls, errCls("publishDate"))} value={form.publishDate} onChange={(e) => set("publishDate", e.target.value)} /></Field>
          <Field label="เวลาโพสต์"><input type="time" className={inputCls} value={form.publishTime} onChange={(e) => set("publishTime", e.target.value)} /></Field>
        </FormSection>

        <FormSection title="สถานะ & ผู้รับผิดชอบ" cols={2}>
          <Field label="สถานะ" required hint={errors.statusId}><GroupSelect group="status" value={form.statusId} onChange={(v) => set("statusId", v)} /></Field>
          <Field label="ผู้รับผิดชอบหลัก" hint={errors.ownerId}><UserSelect value={form.ownerId} onChange={(v) => set("ownerId", v)} /></Field>
        </FormSection>

        <FormSection title="SEO & รายละเอียด" cols={2}>
          <Field label="Keyword / SEO (เลือกได้หลายคำ · แนะนำตามบริการที่เลือก)" className="sm:col-span-2">
            <KeywordTagInput value={form.keyword} onChange={(v) => set("keyword", v)} suggestions={kwSuggestions} />
          </Field>
          <Field label="หมายเหตุ" className="sm:col-span-2"><textarea className={cx(inputCls, "min-h-[56px] resize-y")} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
        </FormSection>

        {/* Content Craft (ปอน MKT §3 — องค์ประกอบในคอนเทนต์) */}
        <div className="space-y-2.5">
          <button type="button" onClick={() => setCraftOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
            <span className="text-[12px] font-bold uppercase tracking-wide text-primary-600">องค์ประกอบคอนเทนต์ (Content Craft)</span>
            <span className="text-[11px] text-muted">{craftCount}/12 · {craftOpen ? "▲ ย่อ" : "▼ ขยาย"}</span>
          </button>
          {craftOpen && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Hook — คำแรกที่ทำให้หยุดดู"><input className={inputCls} value={form.hook} onChange={(e) => set("hook", e.target.value)} /></Field>
              <Field label="Pain Point — ปัญหาของผู้ชม"><input className={inputCls} value={form.painPoint} onChange={(e) => set("painPoint", e.target.value)} /></Field>
              <Field label="Context — เนื้อหาสื่อถึงอะไร" className="sm:col-span-2"><input className={inputCls} value={form.context} onChange={(e) => set("context", e.target.value)} /></Field>
              <Field label="Story Telling — เล่าเรื่องให้อิน" className="sm:col-span-2"><textarea className={cx(inputCls, "min-h-[56px] resize-y")} value={form.storyTelling} onChange={(e) => set("storyTelling", e.target.value)} /></Field>
              <Field label="Proof — ภาพ/คลิปสนับสนุนคำพูด"><input className={inputCls} value={form.proof} onChange={(e) => set("proof", e.target.value)} /></Field>
              <Field label="Authority — แสดงความเชี่ยวชาญ"><input className={inputCls} value={form.authority} onChange={(e) => set("authority", e.target.value)} /></Field>
              <Field label="Visual — องค์ประกอบในภาพ"><input className={inputCls} value={form.visual} onChange={(e) => set("visual", e.target.value)} /></Field>
              <Field label="Organic Selling — แทรกขายในช่องตัวเอง"><input className={inputCls} value={form.organicSelling} onChange={(e) => set("organicSelling", e.target.value)} /></Field>
              <Field label="Branding — สี/ฟอนต์/โลโก้/สโลแกน"><input className={inputCls} value={form.branding} onChange={(e) => set("branding", e.target.value)} /></Field>
              <Field label="ESG — จุดยืนสนับสนุน สังคม/ประเทศ/ลูกค้า"><input className={inputCls} value={form.esg} onChange={(e) => set("esg", e.target.value)} /></Field>
              <Field label="Contact — ช่องทางติดต่อ" className="sm:col-span-2"><input className={inputCls} value={form.contact} onChange={(e) => set("contact", e.target.value)} /></Field>
              <p className="text-[11px] text-muted sm:col-span-2">* SEO Keyword อยู่ในหัวข้อ “SEO &amp; รายละเอียด” ด้านบน (นับรวมใน {craftCount}/12)</p>
            </div>
          )}
        </div>

        <fieldset className="space-y-2.5">
          <div className="flex items-center justify-between">
            <legend className="text-[12px] font-bold uppercase tracking-wide text-primary-600">ลิงก์งาน</legend>
            <button type="button" className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-primary-700 hover:bg-primary-50" onClick={addLink}>
              <Plus className="h-3.5 w-3.5" /> เพิ่มลิงก์
            </button>
          </div>
          {form.links.length === 0 && (
            <p className="flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-3 text-[12px] text-muted">
              <Link2 className="h-4 w-4" /> ยังไม่มีลิงก์ — เพิ่มลิงก์บรีฟ / ดราฟต์ / งานจริง / ผลลัพธ์ ได้หลายช่อง
            </p>
          )}
          <div className="space-y-3">
            {form.links.map((l) => (
              <div key={l.id} className="rounded-lg border border-border p-2.5">
                <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto]">
                  <GroupSelect group="linkType" value={l.linkTypeId} onChange={(v) => updateLink(l.id, { linkTypeId: v ?? "" })} placeholder="ชนิดลิงก์" />
                  <input className={cx(inputCls, errors[`link-${l.id}`] && "border-red-400")} value={l.url} onChange={(e) => updateLink(l.id, { url: e.target.value })} placeholder="วางลิงก์ (YouTube / TikTok / Drive / รูป / ฯลฯ)" />
                  <button type="button" className="inline-flex items-center justify-center rounded-lg border border-border px-2 text-muted hover:border-red-300 hover:text-red-600" onClick={() => removeLink(l.id)} title="ลบลิงก์">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <input className={cx(inputCls, "mt-2")} value={l.title ?? ""} onChange={(e) => updateLink(l.id, { title: e.target.value })} placeholder="ชื่อ/คำอธิบายลิงก์ (ไม่บังคับ)" />
                {errors[`link-${l.id}`] && <p className="mt-1 text-[11px] text-red-600">{errors[`link-${l.id}`]}</p>}
                {l.url.trim() && isValidUrl(l.url) && (
                  <div className="mt-2"><LinkPreview url={l.url} title={l.title} compact /></div>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      </div>
    </Modal>
  );
}
