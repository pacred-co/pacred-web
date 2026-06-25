"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { MessageCircle, Send, LogIn, User as UserIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { postCaseComment, type CaseComment } from "@/actions/case-comments";

export type CommentsUi = {
  title: string;
  placeholder: string;
  submit: string;
  posting: string;
  loginPrompt: string;
  loginCta: string;
  empty: string;
  tooShort: string;
  asYou: string;
};

function Avatar({ src, name, size }: { src: string | null; name: string; size: number }) {
  if (src) {
    return (
      <span className="relative flex-none overflow-hidden rounded-full bg-gray-100 dark:bg-surface-alt" style={{ width: size, height: size }}>
        <Image src={src} alt={name} fill sizes={`${size}px`} className="object-cover" />
      </span>
    );
  }
  return (
    <span className="grid flex-none place-items-center rounded-full bg-primary-50 text-primary-600 dark:bg-primary-900/30" style={{ width: size, height: size }}>
      <UserIcon className="h-1/2 w-1/2" strokeWidth={2.2} />
    </span>
  );
}

function fmtDate(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleDateString(locale === "en" ? "en-US" : "th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

/**
 * Login-gated case-study comment section (ปอน 2026-06-25). Signed-in customers
 * get a compose box; guests get a familiar "log in to comment" bar (avatar +
 * faux-input + button) instead of an empty dashed panel. New comments prepend
 * optimistically; an empty thread shows a tidy centered placeholder.
 */
export function CaseComments({
  caseSlug,
  initialComments,
  isLoggedIn,
  currentUserName,
  currentUserAvatar,
  locale,
  ui,
}: {
  caseSlug: string;
  initialComments: CaseComment[];
  isLoggedIn: boolean;
  currentUserName: string | null;
  currentUserAvatar: string | null;
  locale: string;
  ui: CommentsUi;
}) {
  const [comments, setComments] = useState<CaseComment[]>(initialComments);
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    const text = body.trim();
    if (text.length < 2) {
      setErr(ui.tooShort);
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await postCaseComment({ caseSlug, body: text });
      if (res.ok) {
        setComments((c) => [res.comment, ...c]);
        setBody("");
      } else {
        setErr(res.error);
      }
    });
  };

  return (
    <section className="w-full">
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-5 w-5 text-primary-600" strokeWidth={2.4} />
        <h2 className="text-[18px] font-black tracking-[-0.03em] text-[#111827] dark:text-white md:text-[22px]">
          {ui.title}
          {comments.length > 0 ? <span className="text-muted"> ({comments.length})</span> : null}
        </h2>
      </div>

      {/* Compose (signed-in) OR a familiar gated comment bar (guest) */}
      {isLoggedIn ? (
        <div className="rounded-2xl border border-border bg-white p-4 dark:bg-surface">
          <div className="flex items-start gap-3">
            <Avatar src={currentUserAvatar} name={currentUserName || ui.asYou} size={38} />
            <div className="flex-1">
              <p className="mb-1.5 text-[12.5px] font-black text-[#111827] dark:text-white">
                {currentUserName || ui.asYou}
              </p>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={ui.placeholder}
                className="w-full resize-none rounded-xl border border-border bg-transparent p-3 text-[13.5px] leading-relaxed text-foreground outline-none transition focus:border-primary-300 dark:bg-surface"
              />
              {err ? <p className="mt-1.5 text-[12px] font-bold text-primary-600">{err}</p> : null}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || body.trim().length < 2}
                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary-600 px-4 text-[13.5px] font-black text-white transition-all duration-300 hover:bg-primary-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send className="h-4 w-4" strokeWidth={2.4} />
                  {pending ? ui.posting : ui.submit}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2.5 rounded-2xl border border-border bg-white p-2.5 dark:bg-surface">
          <Avatar src={null} name="" size={36} />
          <Link
            href="/login"
            className="flex-1 truncate rounded-full bg-gray-100 px-4 py-2.5 text-[13px] text-muted transition hover:bg-gray-200 dark:bg-surface-alt dark:hover:bg-surface"
          >
            {ui.loginPrompt}
          </Link>
          <Link
            href="/login"
            className="inline-flex h-10 flex-none items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 text-[13px] font-black text-white transition-all duration-300 hover:bg-primary-700 active:scale-95"
          >
            <LogIn className="h-4 w-4" strokeWidth={2.4} />
            {ui.loginCta}
          </Link>
        </div>
      )}

      {/* Thread */}
      {comments.length === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-2 py-6 text-center">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-gray-100 text-gray-400 dark:bg-surface-alt dark:text-muted">
            <MessageCircle className="h-5 w-5" strokeWidth={2} />
          </span>
          <p className="text-[13px] text-muted">{ui.empty}</p>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-3 border-b border-border pb-4 last:border-b-0">
              <Avatar src={c.authorAvatar} name={c.authorName} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[13.5px] font-black text-[#111827] dark:text-white">{c.authorName}</span>
                  <span className="text-[11.5px] text-muted">{fmtDate(c.createdAt, locale)}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">
                  {c.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
