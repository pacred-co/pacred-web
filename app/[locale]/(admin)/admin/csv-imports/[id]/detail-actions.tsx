"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import {
  parsePreviewCsvImport,
  confirmCsvImport,
  deleteCsvImport,
} from "@/actions/admin/csv-imports";

export function CsvImportDetailActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function onPreview() {
    setErr(null);
    setInfo(null);
    startTransition(async () => {
      const res = await parsePreviewCsvImport({ id });
      if (!res.ok) setErr(res.error);
      else {
        setInfo(`Parse แล้ว ${res.data!.row_count} แถว`);
        router.refresh();
      }
    });
  }

  async function onConfirm() {
    if (!(await confirm("ยืนยันนำเข้าทั้งไฟล์? การกระทำนี้จะ insert ลง DB จริง"))) return;
    setErr(null);
    setInfo(null);
    startTransition(async () => {
      const res = await confirmCsvImport({ id });
      if (!res.ok) setErr(res.error);
      else {
        setInfo(`นำเข้าสำเร็จ ${res.data!.imported} แถว · ข้าม ${res.data!.skipped}`);
        router.refresh();
      }
    });
  }

  async function onDelete() {
    if (!(await confirm("ลบไฟล์นี้ + รายการนี้ใช่ไหม?"))) return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteCsvImport({ id });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.push("/admin/csv-imports");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 min-w-[180px]">
      {err && (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-[10px] text-red-700">
          {err}
        </div>
      )}
      {info && (
        <div className="rounded border border-green-200 bg-green-50 p-2 text-[10px] text-green-700">
          {info}
        </div>
      )}

      {status === "uploaded" && (
        <Button type="button" onClick={onPreview} disabled={pending} fullWidth>
          {pending ? "กำลัง parse..." : "พรีวิว"}
        </Button>
      )}

      {status === "previewed" && (
        <>
          <Button type="button" onClick={onConfirm} disabled={pending} fullWidth>
            {pending ? "กำลังนำเข้า..." : "✓ ยืนยันนำเข้า"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onPreview}
            disabled={pending}
            fullWidth
          >
            ↻ Parse ใหม่
          </Button>
        </>
      )}

      {status === "failed" && (
        <Button
          type="button"
          variant="outline"
          onClick={onPreview}
          disabled={pending}
          fullWidth
        >
          ↻ ลอง parse ใหม่
        </Button>
      )}

      {status !== "importing" && (
        <Button
          type="button"
          variant="outline"
          onClick={onDelete}
          disabled={pending}
          fullWidth
        >
          ลบไฟล์
        </Button>
      )}
    </div>
  );
}
