"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PacredDialog } from "@/components/ui/pacred-dialog";
import { verifyJuristic, rejectJuristic, lookupDbdJuristic } from "@/actions/admin/customers";
import {
  computeCompareRows,
  isActiveStatus,
  type DbdLookupData,
} from "@/lib/dbd/parse-juristic";

type Props = {
  profileId: string;
  status: string;
  /** corporate.tax_id — used for the official DBD link before/without a lookup. */
  taxId: string;
  docUrls: { label: string; url: string; mime: string }[];
};

/** Official DBD DataWarehouse public company page (manual cross-check link). */
function dbdPublicUrl(taxId: string): string {
  return `https://datawarehouse.dbd.go.th/company/show/${encodeURIComponent(taxId.trim())}`;
}

export function JuristicActions({ profileId, status, taxId, docUrls }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [err, setErr]       = useState<string | null>(null);
  const [msg, setMsg]       = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; mime: string } | null>(null);

  // ── DBD compare modal (legacy check-juristic/compare.php) ──
  const dbdRef = useRef<HTMLDialogElement>(null);
  const [dbd, setDbd]           = useState<DbdLookupData | null>(null);
  const [dbdErr, setDbdErr]     = useState<string | null>(null);
  const [dbdPending, startDbd]  = useTransition();

  function act(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setErr(null); setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) { setMsg("บันทึกแล้ว"); router.refresh(); }
      else setErr(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  function openDbd() {
    setDbdErr(null);
    setDbd(null);
    dbdRef.current?.showModal();
    startDbd(async () => {
      const res = await lookupDbdJuristic({ profile_id: profileId });
      if (res.ok) setDbd(res.data ?? null);
      else setDbdErr(res.error ?? "เกิดข้อผิดพลาด");
    });
  }

  const rows =
    dbd?.dbd
      ? computeCompareRows(dbd.dbd, dbd.pacred, dbd.taxId || taxId)
      : [];
  const mismatchCount = rows.filter((r) => r.mismatch).length;

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
            // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL; admin preview only, not LCP
            <img src={preview.url} alt="เอกสาร" className="max-h-64 w-full object-contain bg-surface-alt" />
          )}
        </div>
      )}

      {/* DBD compare trigger (legacy "ตรวจสอบสถานะกับ DBD") */}
      <button
        type="button"
        onClick={openDbd}
        className="inline-flex items-center gap-1 rounded border border-primary-200 bg-primary-50 px-2 py-0.5 text-[10px] font-medium text-primary-700 hover:bg-primary-100"
      >
        🔎 ตรวจสอบกับ DBD
      </button>

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

      {/* ── DBD compare modal ── */}
      <PacredDialog dialogRef={dbdRef} title="ตรวจสอบข้อมูลนิติบุคคลกับ DBD" size="lg">
        <div className="space-y-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted">เลขทะเบียนนิติบุคคล:</span>
            <span className="font-mono font-semibold">{taxId || "—"}</span>
            <a
              href={dbdPublicUrl(taxId)}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto rounded border border-border px-2 py-1 text-xs text-primary-600 hover:bg-surface-alt"
            >
              เปิด DBD DataWarehouse ↗
            </a>
          </div>

          {dbdPending && (
            <p className="rounded-lg bg-surface-alt px-3 py-6 text-center text-muted">
              กำลังดึงข้อมูลจากกรมพัฒนาธุรกิจการค้า…
            </p>
          )}

          {!dbdPending && dbdErr && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-red-700">
              ผิดพลาด: {dbdErr}
            </p>
          )}

          {!dbdPending && dbd && (
            <>
              {/* Mode / status banners */}
              {!dbd.configured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-amber-800">
                  <p className="font-medium">DBD auto-lookup ยังไม่ได้เปิดใช้งาน (manual mode)</p>
                  <p className="mt-1 text-xs">
                    ยังไม่ได้ตั้งค่า endpoint สำหรับดึงข้อมูล DBD อัตโนมัติ — กด
                    “เปิด DBD DataWarehouse” ด้านบนเพื่อตรวจสอบด้วยตนเอง แล้วเทียบกับ
                    เอกสารหนังสือรับรอง + ภพ20 ที่ลูกค้าแนบมา ก่อนกดยืนยัน
                  </p>
                </div>
              )}
              {dbd.configured && dbd.warning && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  ดึงข้อมูลสดไม่สำเร็จ ({dbd.warning}) — แสดงผลจากแคชล่าสุดถ้ามี
                </div>
              )}

              {/* Compare table (legacy compare.php Section 1) */}
              {dbd.dbd ? (
                <>
                  {mismatchCount > 0 ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
                      ⚠️ พบ {mismatchCount} รายการที่ไม่ตรงกับ DBD (แถวสีแดง) — ตรวจสอบก่อนอนุมัติ
                    </div>
                  ) : (
                    <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700">
                      ✅ ข้อมูลหลัก (ชื่อ · เลขทะเบียน · ที่อยู่) ตรงกับ DBD
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted">
                        <tr>
                          <th className="px-3 py-2 w-1/4">รายการ</th>
                          <th className="px-3 py-2">ข้อมูลจาก DBD</th>
                          <th className="px-3 py-2">ข้อมูลจาก Pacred</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr
                            key={row.key}
                            className={`border-t border-border align-top ${row.mismatch ? "bg-red-50" : ""}`}
                          >
                            <td className="px-3 py-2 text-muted">{row.label}</td>
                            <td className="px-3 py-2">
                              {row.isStatus ? (
                                row.dbdValue ? (
                                  <span
                                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                      isActiveStatus(row.dbdValue)
                                        ? "bg-green-100 text-green-700"
                                        : "bg-red-100 text-red-700"
                                    }`}
                                  >
                                    {row.dbdValue}
                                  </span>
                                ) : (
                                  <span className="text-muted/50">—</span>
                                )
                              ) : (
                                row.dbdValue || <span className="text-muted/50">—</span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {row.pacredValue ? (
                                <span className={row.mismatch ? "font-medium text-red-700" : ""}>
                                  {row.pacredValue}
                                </span>
                              ) : (
                                <span className="text-muted/40">{row.pacredValue === null ? "(ไม่ได้เก็บ)" : "—"}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {dbd.fetchedAt && (
                    <p className="text-[11px] text-muted">
                      ข้อมูล DBD ณ {new Date(dbd.fetchedAt).toLocaleString("th-TH")}
                      {dbd.cached && " (จากแคช)"}
                    </p>
                  )}
                </>
              ) : (
                dbd.configured && (
                  <p className="rounded-lg border border-border bg-surface-alt px-3 py-4 text-center text-muted">
                    ไม่พบข้อมูลนิติบุคคลนี้ใน DBD — ตรวจสอบเลขทะเบียน หรือตรวจด้วยตนเองที่ลิงก์ด้านบน
                  </p>
                )
              )}

              {/* Doc cross-check reminder (legacy compare.php Sections 2 + 3) */}
              <p className="text-[11px] text-muted">
                อย่าลืมเทียบ <strong>หนังสือรับรองบริษัท</strong> + <strong>ภพ20</strong> ที่ลูกค้าแนบมา
                (ปุ่ม 📄 ในตาราง) ก่อนกดยืนยันสถานะ
              </p>
            </>
          )}
        </div>
      </PacredDialog>
    </div>
  );
}
