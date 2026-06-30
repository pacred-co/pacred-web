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
import { useState } from "react";
import { Plus, Trash2, Link2 } from "lucide-react";
import type { ContentItem, ContentLink } from "@/lib/marketing-planner/types";
import { usePlanner, uid } from "@/lib/marketing-planner/store";
import { btnGhost, btnPrimary, cx, Field, GroupSelect, inputCls, Modal, UserMultiPicker, UserSelect } from "./ui";
import { LinkPreview } from "./link-preview";

type FormState = {
  title: string;
  topic: string;
  brief: string;
  marketingGoalId?: string;
  contentTypeId?: string;
  contentPillarId?: string;
  funnelStageId?: string;
  customerStageId?: string;
  platformId?: string;
  serviceId?: string;
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
    visual: "", organicSelling: "", branding: "", esg: "", contact: "", channelIds: [],
    coOwnerIds: [], startDate: "", deadline: "", publishDate: "", publishTime: "", note: "",
    links: [],
    ...defaults,
  };
}

function fromContent(c: ContentItem): FormState {
  return {
    title: c.title, topic: c.topic ?? "", brief: c.brief ?? "",
    marketingGoalId: c.marketingGoalId, contentTypeId: c.contentTypeId, contentPillarId: c.contentPillarId,
    funnelStageId: c.funnelStageId, customerStageId: c.customerStageId, platformId: c.platformId,
    serviceId: c.serviceId, campaignId: c.campaignId, formatId: c.formatId, toneId: c.toneId,
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

export function ContentForm({ open, onClose, editId, defaultDate }: { open: boolean; onClose: () => void; editId?: string; defaultDate?: string }) {
  if (!open) return null;
  return <ContentFormBody key={`${editId ?? "new"}:${defaultDate ?? ""}`} onClose={onClose} editId={editId} defaultDate={defaultDate} />;
}

function ContentFormBody({ onClose, editId, defaultDate }: { onClose: () => void; editId?: string; defaultDate?: string }) {
  const { contents, byGroup, addContent, updateContent } = usePlanner();
  const linkTypes = byGroup("linkType");
  const defaultStatus = byGroup("status")[0]?.id;

  const [form, setForm] = useState<FormState>(() => {
    const existing = editId ? contents.find((c) => c.id === editId) : undefined;
    return existing ? fromContent(existing) : blank({ publishDate: defaultDate ?? "", statusId: defaultStatus });
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [craftOpen, setCraftOpen] = useState(false);
  const channels = byGroup("channel");

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggleChannel = (id: string) =>
    setForm((f) => ({ ...f, channelIds: f.channelIds.includes(id) ? f.channelIds.filter((x) => x !== id) : [...f.channelIds, id] }));
  const craftCount = [form.hook, form.painPoint, form.context, form.storyTelling, form.proof, form.authority, form.visual, form.organicSelling, form.branding, form.esg, form.contact, form.cta, form.keyword].filter((x) => x.trim()).length;

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
    if (!form.ownerId) e.ownerId = "กรุณาเลือกผู้รับผิดชอบ";
    form.links.forEach((l) => {
      if (l.url.trim() && !isValidUrl(l.url)) e[`link-${l.id}`] = "URL ไม่ถูกต้อง";
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    const links = form.links.filter((l) => l.url.trim());
    const payload = {
      title: form.title.trim(),
      topic: form.topic.trim() || undefined,
      brief: form.brief.trim() || undefined,
      marketingGoalId: form.marketingGoalId, contentTypeId: form.contentTypeId, contentPillarId: form.contentPillarId,
      funnelStageId: form.funnelStageId, customerStageId: form.customerStageId, platformId: form.platformId,
      serviceId: form.serviceId, campaignId: form.campaignId, formatId: form.formatId, toneId: form.toneId,
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
          <Field label="หัวข้อคอนเทนต์">
            <input className={inputCls} value={form.topic} onChange={(e) => set("topic", e.target.value)} />
          </Field>
          <Field label="คำอธิบาย / Brief">
            <textarea className={cx(inputCls, "min-h-[72px] resize-y")} value={form.brief} onChange={(e) => set("brief", e.target.value)} />
          </Field>
        </FormSection>

        <FormSection title="การจัดประเภท" cols={3}>
          <Field label="แพลตฟอร์ม"><GroupSelect group="platform" value={form.platformId} onChange={(v) => set("platformId", v)} /></Field>
          <Field label="ประเภทคอนเทนต์"><GroupSelect group="contentType" value={form.contentTypeId} onChange={(v) => set("contentTypeId", v)} /></Field>
          <Field label="รูปแบบ (Format)"><GroupSelect group="format" value={form.formatId} onChange={(v) => set("formatId", v)} /></Field>
          <Field label="เป้าหมายการตลาด"><GroupSelect group="marketingGoal" value={form.marketingGoalId} onChange={(v) => set("marketingGoalId", v)} /></Field>
          <Field label="เสาหลัก (Pillar)"><GroupSelect group="contentPillar" value={form.contentPillarId} onChange={(v) => set("contentPillarId", v)} /></Field>
          <Field label="Funnel Stage"><GroupSelect group="funnelStage" value={form.funnelStageId} onChange={(v) => set("funnelStageId", v)} /></Field>
          <Field label="Stage ลูกค้า"><GroupSelect group="customerStage" value={form.customerStageId} onChange={(v) => set("customerStageId", v)} /></Field>
          <Field label="บริการที่เกี่ยวข้อง"><GroupSelect group="service" value={form.serviceId} onChange={(v) => set("serviceId", v)} /></Field>
          <Field label="แคมเปญ"><GroupSelect group="campaign" value={form.campaignId} onChange={(v) => set("campaignId", v)} /></Field>
          <Field label="โทน (Tone)"><GroupSelect group="tone" value={form.toneId} onChange={(v) => set("toneId", v)} /></Field>
          <Field label="ความสำคัญ"><GroupSelect group="priority" value={form.priorityId} onChange={(v) => set("priorityId", v)} /></Field>
        </FormSection>

        <FormSection title="กำหนดการ" cols={3}>
          <Field label="วันที่ต้องเริ่มทำ"><input type="date" className={inputCls} value={form.startDate} onChange={(e) => set("startDate", e.target.value)} /></Field>
          <Field label="Deadline"><input type="date" className={inputCls} value={form.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="วันที่ลง" required hint={errors.publishDate}><input type="date" className={cx(inputCls, errCls("publishDate"))} value={form.publishDate} onChange={(e) => set("publishDate", e.target.value)} /></Field>
            <Field label="เวลาโพสต์"><input type="time" className={inputCls} value={form.publishTime} onChange={(e) => set("publishTime", e.target.value)} /></Field>
          </div>
        </FormSection>

        <FormSection title="สถานะ & ผู้รับผิดชอบ" cols={2}>
          <Field label="สถานะ" required hint={errors.statusId}><GroupSelect group="status" value={form.statusId} onChange={(v) => set("statusId", v)} /></Field>
          <Field label="ผู้รับผิดชอบหลัก" required hint={errors.ownerId}><UserSelect value={form.ownerId} onChange={(v) => set("ownerId", v)} /></Field>
          <Field label="ผู้ช่วย (Co-owner)" className="sm:col-span-2">
            <UserMultiPicker value={form.coOwnerIds} onChange={(ids) => set("coOwnerIds", ids)} exclude={form.ownerId} />
          </Field>
        </FormSection>

        <FormSection title="SEO & รายละเอียด" cols={2}>
          <Field label="Target Audience"><input className={inputCls} value={form.targetAudience} onChange={(e) => set("targetAudience", e.target.value)} /></Field>
          <Field label="Keyword / SEO"><input className={inputCls} value={form.keyword} onChange={(e) => set("keyword", e.target.value)} /></Field>
          <Field label="Hashtag"><input className={inputCls} value={form.hashtag} onChange={(e) => set("hashtag", e.target.value)} placeholder="#นำเข้าจีน #shipping" /></Field>
          <Field label="CTA"><input className={inputCls} value={form.cta} onChange={(e) => set("cta", e.target.value)} placeholder="ทักแชทรับเรทพิเศษ" /></Field>
          <Field label="หมายเหตุ" className="sm:col-span-2"><textarea className={cx(inputCls, "min-h-[56px] resize-y")} value={form.note} onChange={(e) => set("note", e.target.value)} /></Field>
        </FormSection>

        {/* Content Craft (ปอน MKT §3 — องค์ประกอบในคอนเทนต์) */}
        <div className="space-y-2.5">
          <button type="button" onClick={() => setCraftOpen((o) => !o)} className="flex w-full items-center justify-between text-left">
            <span className="text-[12px] font-bold uppercase tracking-wide text-primary-600">องค์ประกอบคอนเทนต์ (Content Craft)</span>
            <span className="text-[11px] text-muted">{craftCount}/13 · {craftOpen ? "▲ ย่อ" : "▼ ขยาย"}</span>
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
              <p className="text-[11px] text-muted sm:col-span-2">* CTA + SEO Keyword อยู่ในหัวข้อ “SEO &amp; รายละเอียด” ด้านบน (นับรวมใน {craftCount}/13)</p>
            </div>
          )}
        </div>

        {/* Distribution channels (ปอน MKT §4 — ระบบขยายผล) */}
        <Field label="ช่องทางขยายผล (Distribution / Amplification)">
          <div className="flex flex-wrap gap-1.5">
            {channels.length === 0 && <span className="text-[11px] text-muted">ยังไม่มีช่องทางใน Settings</span>}
            {channels.map((ch) => {
              const on = form.channelIds.includes(ch.id);
              return (
                <button key={ch.id} type="button" onClick={() => toggleChannel(ch.id)}
                  className={cx("rounded-full border px-2.5 py-1 text-[12px] transition", on ? "border-primary-300 bg-primary-50 font-medium text-primary-700" : "border-border text-muted hover:border-primary-200")}>
                  {ch.name}
                </button>
              );
            })}
          </div>
        </Field>

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
