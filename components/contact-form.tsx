"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitContactMessage } from "@/actions/contact";

/**
 * Drop-in contact form (P-6). Place anywhere — handles its own state +
 * submit + success/error UI. ปอน can swap this for a styled version
 * later; the action contract stays stable.
 *
 *   <ContactForm />
 */
export function ContactForm() {
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await submitContactMessage({
        name,
        contact,
        subject: subject || undefined,
        message,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(true);
      setName("");
      setContact("");
      setSubject("");
      setMessage("");
    });
  }

  if (done) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center">
        <p className="text-lg font-bold text-green-800">✅ ส่งข้อความเรียบร้อย</p>
        <p className="mt-2 text-sm text-green-700">
          ทีมงาน Pacred จะติดต่อกลับโดยเร็วที่สุด
        </p>
        <button
          type="button"
          onClick={() => setDone(false)}
          className="mt-4 text-xs font-semibold text-primary-600 hover:text-primary-700 underline"
        >
          ส่งข้อความใหม่
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="ชื่อ" required>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
            required
            maxLength={200}
          />
        </Field>
        <Field label="อีเมล / เบอร์โทร" required>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            className={inputCls}
            required
            maxLength={200}
            placeholder="you@example.com หรือ 0812345678"
          />
        </Field>
      </div>

      <Field label="หัวข้อ">
        <input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className={inputCls}
          maxLength={200}
          placeholder="เรื่องที่ต้องการสอบถาม"
        />
      </Field>

      <Field label="ข้อความ" required>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${inputCls} min-h-[140px]`}
          required
          minLength={5}
          maxLength={4000}
          placeholder="รายละเอียดที่ต้องการให้เราช่วย..."
        />
      </Field>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button type="submit" disabled={pending} fullWidth size="lg">
        {pending ? "กำลังส่ง..." : "ส่งข้อความ"}
      </Button>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/50";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="ml-0.5 text-red-600">*</span>}
      </span>
      {children}
    </label>
  );
}
