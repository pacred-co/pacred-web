"use client";

/**
 * สั่งงาน + กระดานรับงาน (Job board · ปอน 2026-07-01) — LINE-style.
 * Anyone orders (text + pasted/attached images) → appears on the board → a user
 * claims it (then it leaves others' "รอรับ") → assignee submits "เสร็จแล้ว" →
 * the orderer either rejects with a fix brief (back to in-progress) or approves
 * (done). Each job is a chat thread. localStorage prototype (single-browser).
 */
import { useMemo, useRef, useState } from "react";
import { Check, Image as ImageIcon, Inbox, Paperclip, RotateCcw, Send, X } from "lucide-react";
import type { JobMessage, JobOrder, JobStatus } from "@/lib/marketing-planner/types";
import { usePlanner } from "@/lib/marketing-planner/store";
import { fmtThaiDateTime } from "@/lib/marketing-planner/util";
import { btnGhost, btnPrimary, cx, Modal, Tag } from "./ui";

const STATUS_META: Record<JobStatus, { label: string; color: string }> = {
  open: { label: "รอรับงาน", color: "#f59e0b" },
  in_progress: { label: "กำลังทำ", color: "#3b82f6" },
  submitted: { label: "รอตรวจ", color: "#8b5cf6" },
  done: { label: "เสร็จสิ้น", color: "#22c55e" },
};
const KIND_LABEL: Record<JobMessage["kind"], string> = { brief: "บรีฟงาน", note: "", submit: "ส่งงาน ✓", reject: "ตีกลับ — แก้" };

async function compressImage(file: File, max = 1280, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new window.Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(reader.result as string); return; }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/** Text + image composer (LINE-style). Calls onSend(text, images). */
function Composer({ placeholder, sendLabel, onSend, compact }: { placeholder: string; sendLabel?: string; onSend: (text: string, images: string[]) => void; compact?: boolean }) {
  const [text, setText] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addFiles = async (files: FileList | File[]) => {
    const imgs = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setBusy(true);
    try {
      const out = await Promise.all(imgs.map((f) => compressImage(f)));
      setImages((p) => [...p, ...out]);
    } catch {
      /* ignore unreadable image */
    } finally {
      setBusy(false);
    }
  };
  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.items ?? []).map((i) => i.getAsFile()).filter((f): f is File => !!f && f.type.startsWith("image/"));
    if (files.length) { e.preventDefault(); void addFiles(files); }
  };
  const send = () => {
    if (!text.trim() && images.length === 0) return;
    onSend(text.trim(), images);
    setText("");
    setImages([]);
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-white p-2.5 dark:bg-surface">
      <textarea
        className="w-full resize-y rounded-lg border border-border bg-transparent px-3 py-2 text-sm text-foreground outline-none focus:border-primary-400"
        rows={compact ? 2 : 3}
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={onPaste}
      />
      {images.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {images.map((src, i) => (
            <div key={i} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="h-16 w-16 rounded-lg border border-border object-cover" />
              <button type="button" onClick={() => setImages((p) => p.filter((_, idx) => idx !== i))} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white">
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <button type="button" className={cx(btnGhost, "py-1.5")} onClick={() => fileRef.current?.click()}>
          <Paperclip className="h-4 w-4" /> แนบรูป
        </button>
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" className={btnPrimary} onClick={send} disabled={busy || (!text.trim() && images.length === 0)}>
          <Send className="h-4 w-4" /> {sendLabel ?? "ส่ง"}
        </button>
      </div>
      <p className="text-[11px] text-muted">วางรูป (Ctrl+V) หรือกดแนบรูปได้ · พิมพ์ข้อความเหมือนแชต</p>
    </div>
  );
}

function ImageGrid({ images }: { images: string[] }) {
  const [zoom, setZoom] = useState<string | null>(null);
  if (images.length === 0) return null;
  return (
    <>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={src} alt="" className="h-24 w-24 cursor-zoom-in rounded-lg border border-border object-cover" onClick={() => setZoom(src)} />
        ))}
      </div>
      {zoom && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/70 p-4" onClick={() => setZoom(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>
      )}
    </>
  );
}

function JobCard({ job, onOpen }: { job: JobOrder; onOpen: (id: string) => void }) {
  const { userName, userColor } = usePlanner();
  const first = job.messages[0];
  const sm = STATUS_META[job.status];
  return (
    <button type="button" onClick={() => onOpen(job.id)} className="w-full space-y-1.5 rounded-xl border border-border bg-white p-2.5 text-left shadow-sm transition hover:border-primary-200 hover:shadow dark:bg-surface">
      <div className="flex items-start justify-between gap-2">
        <p className="line-clamp-2 flex-1 text-[13px] font-semibold text-foreground">{job.title}</p>
        <Tag color={sm.color} label={sm.label} />
      </div>
      {first?.text && <p className="line-clamp-2 text-[12px] text-muted">{first.text}</p>}
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: userColor(job.createdBy) }} /> สั่งโดย {userName(job.createdBy)}
        </span>
        <span className="inline-flex items-center gap-2">
          {job.messages.some((m) => m.images.length) && <ImageIcon className="h-3.5 w-3.5" />}
          {job.assignedTo && <span>· รับ: {userName(job.assignedTo)}</span>}
        </span>
      </div>
    </button>
  );
}

function JobThread({ id, onClose }: { id: string; onClose: () => void }) {
  const { jobs, currentUserId, userName, userColor, claimJob, addJobMessage, submitJob, rejectJob, approveJob } = usePlanner();
  const job = jobs.find((j) => j.id === id);
  if (!job) return null;
  const isCreator = job.createdBy === currentUserId;
  const isAssignee = job.assignedTo === currentUserId;
  const sm = STATUS_META[job.status];

  return (
    <Modal open onClose={onClose} size="lg" title={<span className="inline-flex items-center gap-2">{job.title} <Tag color={sm.color} label={sm.label} /></span>}>
      <div className="space-y-3">
        {/* Thread */}
        <div className="max-h-[46vh] space-y-2.5 overflow-y-auto pr-1">
          {job.messages.map((m) => {
            const mine = m.authorId === currentUserId;
            return (
              <div key={m.id} className={cx("flex", mine ? "justify-end" : "justify-start")}>
                <div className={cx("max-w-[80%] rounded-2xl px-3 py-2", mine ? "bg-primary-50 dark:bg-primary-900/20" : "bg-muted/10")}>
                  <div className="mb-0.5 flex items-center gap-1.5">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: userColor(m.authorId) }}>{userName(m.authorId).charAt(0)}</span>
                    <span className="text-[11px] font-medium text-foreground">{userName(m.authorId)}</span>
                    {KIND_LABEL[m.kind] && <span className="rounded px-1 text-[10px] font-semibold" style={{ color: m.kind === "reject" ? "#ef4444" : m.kind === "submit" ? "#16a34a" : "#6366f1" }}>{KIND_LABEL[m.kind]}</span>}
                    <span className="text-[10px] text-muted">{fmtThaiDateTime(m.createdAt.slice(0, 10), m.createdAt.slice(11, 16))}</span>
                  </div>
                  {m.text && <p className="whitespace-pre-wrap text-[13px] text-foreground">{m.text}</p>}
                  <ImageGrid images={m.images} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Actions by role + status */}
        {job.status === "open" && (
          <div className="rounded-xl border border-dashed border-primary-200 bg-primary-50/40 p-3 text-center dark:bg-primary-900/10">
            <p className="mb-2 text-[13px] text-foreground">งานนี้ยังไม่มีคนรับ</p>
            <button type="button" className={btnPrimary} onClick={() => claimJob(job.id)}><Check className="h-4 w-4" /> กดรับงานนี้</button>
          </div>
        )}

        {job.status === "in_progress" && (isAssignee || isCreator) && (
          <div className="space-y-2">
            <Composer compact placeholder={isAssignee ? "พิมพ์อัปเดต / ถามรายละเอียด..." : "เพิ่มบรีฟ / คุยกับผู้รับงาน..."} sendLabel="ส่งข้อความ" onSend={(t, im) => addJobMessage(job.id, { text: t, images: im })} />
            {isAssignee && (
              <SubmitBar onSubmit={(t, im) => submitJob(job.id, { text: t || "เสร็จแล้วครับ", images: im })} />
            )}
          </div>
        )}

        {job.status === "submitted" && isCreator && (
          <ReviewBar onReject={(t, im) => rejectJob(job.id, { text: t || "ขอแก้เพิ่มเติม", images: im })} onApprove={() => approveJob(job.id)} />
        )}
        {job.status === "submitted" && isAssignee && !isCreator && (
          <p className="rounded-xl border border-border p-3 text-center text-[13px] text-muted">ส่งงานแล้ว — รอผู้สั่งตรวจ</p>
        )}
        {job.status === "done" && (
          <p className="rounded-xl border border-green-200 bg-green-50 p-3 text-center text-[13px] font-medium text-green-700 dark:bg-green-900/10">✅ งานนี้เสร็จสิ้นแล้ว</p>
        )}

        {!isCreator && !isAssignee && job.status !== "open" && (
          <p className="rounded-xl border border-border p-3 text-center text-[12px] text-muted">งานนี้มีผู้รับแล้ว — ดูได้อย่างเดียว</p>
        )}
      </div>
    </Modal>
  );
}

function SubmitBar({ onSubmit }: { onSubmit: (text: string, images: string[]) => void }) {
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className={cx(btnPrimary, "w-full")} onClick={() => setOpen(true)}><Check className="h-4 w-4" /> ส่งงาน (เสร็จแล้ว)</button>;
  return (
    <div className="space-y-1.5 rounded-xl border border-green-200 p-2">
      <p className="text-[12px] font-semibold text-green-700">ส่งงาน — แนบงานจริง/รูปผลงาน</p>
      <Composer compact placeholder="เช่น เสร็จแล้ว แนบลิงก์/รูปงาน..." sendLabel="ยืนยันส่งงาน" onSend={onSubmit} />
    </div>
  );
}

function ReviewBar({ onReject, onApprove }: { onReject: (text: string, images: string[]) => void; onApprove: () => void }) {
  const [rejecting, setRejecting] = useState(false);
  if (rejecting) {
    return (
      <div className="space-y-1.5 rounded-xl border border-red-200 p-2">
        <p className="text-[12px] font-semibold text-red-600">ตีกลับ — บรีฟว่าต้องแก้ตรงไหน</p>
        <Composer compact placeholder="ระบุสิ่งที่ต้องแก้..." sendLabel="ตีกลับให้แก้" onSend={(t, im) => { onReject(t, im); setRejecting(false); }} />
        <button type="button" className={cx(btnGhost, "w-full py-1.5")} onClick={() => setRejecting(false)}>ยกเลิก</button>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={cx(btnGhost, "flex-1 text-red-600")} onClick={() => setRejecting(true)}><RotateCcw className="h-4 w-4" /> ตีกลับ + บรีฟแก้</button>
      <button type="button" className={cx(btnPrimary, "flex-1")} onClick={onApprove}><Check className="h-4 w-4" /> เสร็จสิ้นคำสั่ง</button>
    </div>
  );
}

function Column({ title, color, jobs, onOpen, empty }: { title: string; color: string; jobs: JobOrder[]; onOpen: (id: string) => void; empty: string }) {
  return (
    <div className="flex w-[280px] shrink-0 flex-col rounded-2xl border border-border bg-muted/5 p-2">
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-foreground"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{title}</span>
        <span className="rounded-full bg-white px-1.5 text-[11px] font-medium text-muted dark:bg-surface">{jobs.length}</span>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {jobs.length === 0 && <p className="py-6 text-center text-[11px] text-muted/60">{empty}</p>}
        {jobs.map((j) => <JobCard key={j.id} job={j} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

export function JobBoard() {
  const { jobs, currentUserId, createJob } = usePlanner();
  const [openId, setOpenId] = useState<string | undefined>();

  const mine = (j: JobOrder) => j.createdBy === currentUserId || j.assignedTo === currentUserId;
  const cols = useMemo(() => ({
    open: jobs.filter((j) => j.status === "open"),
    in_progress: jobs.filter((j) => j.status === "in_progress" && mine(j)),
    submitted: jobs.filter((j) => j.status === "submitted" && mine(j)),
    done: jobs.filter((j) => j.status === "done" && mine(j)),
  }), [jobs, currentUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-white p-3 shadow-sm dark:bg-surface">
        <p className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-bold text-foreground"><Inbox className="h-4 w-4 text-primary-600" /> สั่งงานใหม่</p>
        <Composer placeholder="พิมพ์สั่งงาน + แคปภาพ/แนบรูปได้ (เหมือนแชต LINE) แล้วกดส่ง" sendLabel="บันทึก/สั่งงาน" onSend={(text, images) => createJob({ text, images })} />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        <Column title="รอรับงาน" color={STATUS_META.open.color} jobs={cols.open} onOpen={setOpenId} empty="ยังไม่มีงานรอรับ" />
        <Column title="กำลังทำ (ของฉัน)" color={STATUS_META.in_progress.color} jobs={cols.in_progress} onOpen={setOpenId} empty="ยังไม่มีงานที่กำลังทำ" />
        <Column title="รอตรวจ" color={STATUS_META.submitted.color} jobs={cols.submitted} onOpen={setOpenId} empty="ไม่มีงานรอตรวจ" />
        <Column title="เสร็จสิ้น" color={STATUS_META.done.color} jobs={cols.done} onOpen={setOpenId} empty="ยังไม่มีงานเสร็จ" />
      </div>

      {openId && <JobThread id={openId} onClose={() => setOpenId(undefined)} />}
    </div>
  );
}
