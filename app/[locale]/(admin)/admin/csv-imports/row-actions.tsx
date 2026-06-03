"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { confirm } from "@/components/ui/confirm";
import { Button } from "@/components/ui/button";
import { deleteCsvImport } from "@/actions/admin/csv-imports";

export function CsvImportRowActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  async function onDelete() {
    if (!(await confirm("ลบไฟล์นี้ + รายการนี้ใช่ไหม?"))) return;
    setErr(null);
    startTransition(async () => {
      const res = await deleteCsvImport({ id });
      if (res.ok) router.refresh();
      else setErr(res.error);
    });
  }

  return (
    <div className="flex flex-col gap-1 min-w-[110px]">
      {err && <div className="text-[10px] text-red-700">{err}</div>}
      <Link
        href={`/admin/csv-imports/${id}`}
        className="rounded-lg border border-border px-3 py-1 text-xs font-semibold text-center hover:bg-surface-alt"
      >
        เปิด
      </Link>
      {status !== "importing" && (
        <Button
          size="sm"
          variant="outline"
          type="button"
          onClick={onDelete}
          disabled={pending}
        >
          ลบ
        </Button>
      )}
    </div>
  );
}
