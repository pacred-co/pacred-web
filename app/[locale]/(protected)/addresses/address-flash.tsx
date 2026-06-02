"use client";

// M-1 (2026-06-02 · ปอน) — the success/error feedback banner for the address
// book. เดฟ's add/edit/delete/set-main actions all redirect back to /addresses
// with a `?saved=1` / `?error=save` / `?error=incomplete` flag (the faithful
// stand-in for the legacy SweetAlert popups), but the page rendered no feedback
// for them. This reads the flag, shows a toast-style banner, then strips the
// query param so a refresh doesn't re-show it.

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { CheckCircle2, AlertCircle, X } from "lucide-react";

const ERROR_TEXT: Record<string, string> = {
  save: "เกิดข้อผิดพลาด ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง",
  incomplete: "กรุณากรอกข้อมูลที่อยู่ให้ครบถ้วน",
};

export function AddressFlash({
  saved,
  error,
}: {
  saved?: boolean;
  error?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const isError = Boolean(error);

  // Auto-dismiss + strip the query flag so a refresh doesn't replay it.
  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(false);
      router.replace("/addresses");
    }, 4000);
    return () => clearTimeout(t);
  }, [router]);

  if (!open || (!saved && !isError)) return null;

  const text = isError
    ? (ERROR_TEXT[error as string] ?? "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง")
    : "ดำเนินการสำเร็จ";

  return (
    <div
      role="status"
      className={`mb-3 flex items-start gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-sm ${
        isError
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-green-200 bg-green-50 text-green-700"
      }`}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span className="flex-1">{text}</span>
      <button
        type="button"
        aria-label="ปิด"
        onClick={() => {
          setOpen(false);
          router.replace("/addresses");
        }}
        className="-mr-1 shrink-0 rounded-full p-0.5 hover:bg-black/5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
