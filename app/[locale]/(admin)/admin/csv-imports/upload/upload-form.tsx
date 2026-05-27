"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { uploadCsv } from "@/actions/admin/csv-imports";

export function UploadCsvForm({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState("forwarders");

  function onSubmit(formData: FormData) {
    setError(null);
    // Client-side 5 MB guard — matches the server cap (MAX_SIZE in
    // actions/admin/csv-imports.ts:31) + label promise below. Catches it
    // BEFORE upload so the user doesn't wait the full upload time only to
    // hit a server "file_too_large" reject. CSV bulk-loads for tb_forwarder
    // routinely sit at 1-3 MB so 5 MB is comfortable headroom; bump both
    // sides if real workflows need bigger files.
    const file = formData.get("file");
    if (file instanceof File && file.size > 5 * 1024 * 1024) {
      setError(`ไฟล์ใหญ่เกิน 5 MB — ขนาดปัจจุบัน ${(file.size / 1024 / 1024).toFixed(1)} MB`);
      return;
    }
    formData.set("target_table", target);
    startTransition(async () => {
      const res = await uploadCsv(formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/admin/csv-imports/${res.data!.id}`);
      router.refresh();
    });
  }

  return (
    <form
      action={onSubmit}
      className={`rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm space-y-4 ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <label className="block space-y-1">
        <span className="text-sm font-medium text-foreground">
          ตารางเป้าหมาย<span className="ml-0.5 text-red-600">*</span>
        </span>
        <select
          name="target_table"
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={disabled}
          className="w-full rounded-lg border border-border bg-white dark:bg-surface px-3 py-2 text-sm"
        >
          <option value="forwarders">forwarders — สร้างรายการใหม่</option>
          <option value="forwarders_update_by_tracking">
            forwarders_update_by_tracking — ปรับรายการอัตโนมัติ (legacy)
          </option>
        </select>
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-foreground">
          ไฟล์ CSV<span className="ml-0.5 text-red-600">*</span>
        </span>
        <input
          name="file"
          type="file"
          accept=".csv,text/csv,application/vnd.ms-excel"
          required
          disabled={disabled}
          className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary-500 file:px-4 file:py-2 file:text-white hover:file:bg-primary-600"
        />
        <span className="block text-xs text-muted">
          ขนาดสูงสุด 5 MB. UTF-8 encoding แนะนำสำหรับภาษาไทย
        </span>
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Button type="submit" disabled={pending || disabled} fullWidth>
        {pending ? "กำลังอัปโหลด..." : "อัปโหลด → ดูพรีวิว"}
      </Button>
    </form>
  );
}
