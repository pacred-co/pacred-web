"use client";

import { useEffect, useState, useTransition } from "react";
import { markNotifyRead } from "./actions";

/**
 * Customer login-popup modal (client).
 *
 * 2026-06-01 — Faithful behaviour of `all-script.php` L656-689:
 *   - render the announcement (image via `content` if it's an image URL,
 *     otherwise the text), with a CTA: "ดูรายละเอียด" (when `url` set) →
 *     navigates + marks read; else "รับทราบ" → marks read.
 *   - a 1-hour cookie (`set_notify<id>`) suppresses re-showing within the hour
 *     even before the customer acknowledges (matches legacy `Cookies.set`).
 *
 * Rendered with Pacred Tailwind chrome (not the legacy Bootstrap modal) per the
 * design philosophy — workflow faithful, look is ours.
 */

type Props = {
  id:      number;
  title:   string;
  content: string | null;
  url:     string | null;
};

const COOKIE_TTL_MS = 60 * 60 * 1000; // 1 hour, matches legacy

function looksLikeImage(s: string | null): boolean {
  if (!s) return false;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(s) || /^https?:\/\//i.test(s);
}

function cookieName(id: number) {
  return `set_notify${id}`;
}

function hasSuppressCookie(id: number): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie.split("; ").some((c) => c.startsWith(`${cookieName(id)}=`));
}

function setSuppressCookie(id: number) {
  const expires = new Date(Date.now() + COOKIE_TTL_MS).toUTCString();
  document.cookie = `${cookieName(id)}=1; expires=${expires}; path=/`;
}

export function NotifyPopupClient({ id, title, content, url }: Props) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Legacy: only show if the 1-hour suppress cookie isn't set. Decide on the
    // client (the cookie isn't readable during SSR) and defer the setState off
    // the synchronous effect body (react-hooks/set-state-in-effect).
    if (hasSuppressCookie(id)) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setOpen(true);
      setSuppressCookie(id);
    });
    return () => { cancelled = true; };
  }, [id]);

  function acknowledge() {
    setOpen(false);
    startTransition(async () => {
      await markNotifyRead(id);
    });
  }

  function close() {
    // Dismiss without acknowledging — the 1-hour cookie keeps it hidden for now,
    // it will re-appear after the cookie expires (legacy behaviour).
    setOpen(false);
  }

  if (!open) return null;

  const isImg = looksLikeImage(content);

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-surface">
        <button
          type="button"
          onClick={close}
          aria-label="ปิด"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-black/30 text-white hover:bg-black/50"
        >
          ✕
        </button>

        {isImg ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={content!} alt={title} className="w-full" />
            <div className="space-y-3 p-4">
              <p className="text-base font-bold">{title}</p>
              <Cta url={url} onAck={acknowledge} />
            </div>
          </>
        ) : (
          <div className="space-y-3 p-6 pt-10">
            <p className="text-lg font-bold text-primary-700">{title}</p>
            {content && <p className="whitespace-pre-line text-sm text-foreground">{content}</p>}
            <Cta url={url} onAck={acknowledge} />
          </div>
        )}
      </div>
    </div>
  );
}

function Cta({ url, onAck }: { url: string | null; onAck: () => void }) {
  if (url) {
    return (
      <a
        href={url}
        onClick={onAck}
        className="inline-flex w-full items-center justify-center rounded-full bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
      >
        ดูรายละเอียด
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onAck}
      className="inline-flex w-full items-center justify-center rounded-full bg-primary-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-primary-700"
    >
      รับทราบ
    </button>
  );
}
