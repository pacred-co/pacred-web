"use client";

/**
 * Reusable OCR button — "อ่านข้อความจากรูป" for any image surface.
 *
 * Owner 2026-07-08: an in-house OCR tool (lib/ocr/recognize.ts · Tesseract.js ·
 * no paid API) usable across the platform. Drop it next to any uploaded image:
 * the admin clicks → the extracted lines appear as chips → click a chip to use
 * that text (onPickLine), or read the whole block (onText). Opt-in (button-run)
 * so the ~few-MB engine loads only when actually used.
 */

import { useState } from "react";
import { recognizeImage } from "@/lib/ocr/recognize";

export function OcrExtract({
  file,
  langs = "chi_sim+eng",
  label = "🔍 อ่านข้อความจากรูป (OCR)",
  hint = "อ่านตัวอักษรบนรูป (จีน/อังกฤษ) — แล้วเลือกบรรทัดที่ต้องการเติม",
  disabled = false,
  onPickLine,
  onText,
}: {
  file: File | null;
  langs?: string;
  label?: string;
  hint?: string;
  disabled?: boolean;
  onPickLine?: (line: string) => void;
  onText?: (text: string, lines: string[]) => void;
}) {
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!file || !file.type.startsWith("image/")) {
      setError("รองรับเฉพาะไฟล์รูป (JPG/PNG) — PDF อ่านไม่ได้");
      return;
    }
    setError(null);
    setRunning(true);
    setLines(null);
    try {
      const r = await recognizeImage(file, langs);
      setLines(r.lines);
      onText?.(r.text, r.lines);
      if (r.lines.length === 0) setError("อ่านไม่พบข้อความในรูป");
    } catch {
      setError("อ่านรูปไม่สำเร็จ — ลองใหม่ หรือกรอกเอง");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={disabled || running || !file}
        onClick={run}
        className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100 disabled:opacity-50"
      >
        {running ? "⏳ กำลังอ่านข้อความ… (โหลดตัวอ่านครั้งแรกอาจช้า)" : label}
      </button>
      {hint && !lines && !running && <p className="mt-1 text-[11px] text-muted">{hint}</p>}
      {error && <p className="mt-1 text-[11px] text-red-600">⚠ {error}</p>}
      {lines && lines.length > 0 && (
        <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2.5">
          <p className="mb-1.5 text-[11px] font-medium text-indigo-700">
            อ่านได้ {lines.length} บรรทัด — คลิกบรรทัดที่ต้องการเติม:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {lines.map((l, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPickLine?.(l)}
                className="max-w-full truncate rounded-md border border-indigo-300 bg-white px-2 py-1 text-[11px] text-indigo-800 hover:bg-indigo-100"
                title={l}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
