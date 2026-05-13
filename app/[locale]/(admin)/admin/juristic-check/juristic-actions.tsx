"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { verifyJuristic, rejectJuristic } from "@/actions/admin/customers";

type Props = {
  profileId: string;
  status: string;
  docUrls: { label: string; url: string; mime: string }[];
};

export function JuristicActions({ profileId, status, docUrls }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [err, setErr]       = useState<string | null>(null);
  const [msg, setMsg]       = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(null);

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { setMsg("บันทึกแล้ว"); router.refresh(); }
      else setErr(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  return (
    <div className="space-y-2">
      {/* Doc preview buttons */}
      {docUrls.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {docUrls.map((d) => (
            <button
              key={d.url}
              onClick={() => setPreview(preview?.url === d.url ? null : { url: d.url, mime: d.mime })}
              className="rounded border border-border px-2 py-0.5 text-[10px] hover:bg-surface-alt"
            >
              📄 {d.label}
            </button>
          ))}
        </div>
      )}
      {docUrls.length === 0 && <p className="text-[10px] text-muted">ไม่มีเอกสาร</p>}

      {/* Inline preview */}
      {preview && (
        <div className="mt-1 rounded-lg border border-border overflow-hidden">
          {preview.mime === "application/pdf" ? (
            <iframe src={preview.url} className="w-full h-64" title="เอกสาร" />
          ) : (
            <img src={preview.url} alt="เอกสาร" className="max-h-64 w-full object-contain bg-surface-alt" />
          )}
        </div>
      )}

      {/* Approve / Reject */}
      {status === "pending" && (
        <div className="space-y-1">
          {err && <div className="text-[10px] text-red-700">{err}</div>}
          {msg && <div className="text-[10px] text-green-700">{msg}</div>}
          <div className="flex gap-1">
            <Button size="sm" onClick={() => act(() => verifyJuristic({ profile_id: profileId }))} disabled={pending}>
              ✅ ยืนยัน
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              if (!reason.trim()) { setErr("ระบุเหตุผลก่อนปฏิเสธ"); return; }
              act(() => rejectJuristic({ profile_id: profileId, reason }));
            }} disabled={pending}>
              ❌ ปฏิเสธ
            </Button>
          </div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผลปฏิเสธ (กรอกก่อนกดปฏิเสธ)"
            className="w-full text-[10px] rounded border border-border px-2 py-1"
          />
        </div>
      )}
    </div>
  );
}
