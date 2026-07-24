/**
 * /wht-certs — ประวัติ "ใบหัก ณ ที่จ่าย (50 ทวิ)" ฝั่งลูกค้า (ฝั่งผู้หัก).
 *
 * owner 2026-07-24: "หน้าประวัติ ของฝั่งลูกค้า … มี tab ประวัติ แล้วก็มีช่องให้ลูกค้า
 * สามารถกรอกเลขที่เอกสารได้เอง"
 *
 * ลูกค้านิติ = ผู้หัก 1% → ต้องออกใบ 50 ทวิ ให้ Pacred ทุกใบเสร็จที่มีการหัก.
 * หน้านี้รวมทุกใบไว้ที่เดียว: ยอด · ภาษีที่หัก · สถานะใบหัก · เลขที่เอกสาร (กรอกเอง) ·
 * ปุ่มพิมพ์ฟอร์ม (กรอกให้ครบแล้ว เหลือเซ็น/ตรา — ตั้งลายเซ็นใน profile = แปะให้เลย) ·
 * ปุ่มแนบไฟล์ (ที่หน้าใบเสร็จ). PURE READ + เลขที่เอกสาร write เดียว (ownership-checked).
 *
 * WHT ต่อใบ = totalbeforewithholding − ramount (ค่า FROZEN ตอนออกใบ — ไม่คำนวณสด
 * ตามกติกาใบเสร็จ) · แถวที่เข้าข่าย = หักจริง > 0 หรือเคยมีความเคลื่อนไหวใบหัก.
 */

import { redirect } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { getCurrentUserWithProfile } from "@/lib/auth/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { signReceiptToken } from "@/lib/receipt/receipt-token";
import { WhtCertNoEditor } from "./wht-cert-no-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "ใบหัก ณ ที่จ่าย (50 ทวิ)" };

const baht = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function thDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
}

const CERT_PILL: Record<string, { label: string; cls: string }> = {
  none:     { label: "🔔 รอออกใบหัก",   cls: "bg-rose-100 text-rose-800" },
  pending:  { label: "⏳ รอบัญชีตรวจ",  cls: "bg-amber-100 text-amber-800" },
  approved: { label: "✅ ตรวจแล้ว",     cls: "bg-emerald-100 text-emerald-800" },
  waived:   { label: "➖ ได้รับยกเว้น",  cls: "bg-slate-100 text-slate-600" },
};

export default async function CustomerWhtCertsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const me = await getCurrentUserWithProfile();
  const memberCode = me?.profile?.member_code ?? "";
  if (!memberCode) redirect("/login");

  const sp = await searchParams;
  const tab = sp.tab === "done" ? "done" : "open";

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("tb_receipt")
    .select(
      "id, rid, rdatecreate, ramount, totalbeforewithholding, wht_cert_status, wht_cert_no, wht_cert_uploaded_at",
    )
    .eq("userid", memberCode)
    .order("id", { ascending: false })
    .limit(500);
  if (error) {
    console.error("[wht-certs customer] load failed", { memberCode, message: error.message });
    throw new Error(`โหลดประวัติใบหักไม่สำเร็จ: ${error.message}`);
  }

  type Row = {
    id: number; rid: string | null; rdatecreate: string | null;
    ramount: number | string | null; totalbeforewithholding: number | string | null;
    wht_cert_status: string | null; wht_cert_no: string | null; wht_cert_uploaded_at: string | null;
  };
  const num = (v: number | string | null) => (v == null ? 0 : Number(v) || 0);

  // ใบที่เกี่ยวกับ 50 ทวิ = มีหักจริง (>1 สตางค์กัน rounding) หรือเคยมี cert activity
  const all = ((data ?? []) as Row[])
    .map((r) => {
      const before = num(r.totalbeforewithholding);
      const net = num(r.ramount);
      const wht = before > 0 ? Math.max(0, before - net) : 0;
      return { ...r, before, net, wht, status: r.wht_cert_status ?? "none" };
    })
    .filter((r) => r.wht > 0.005 || r.status !== "none");

  const open = all.filter((r) => r.status === "none" || r.status === "pending");
  const done = all.filter((r) => r.status === "approved" || r.status === "waived");
  const rows = tab === "done" ? done : open;
  const whtSum = rows.reduce((s, r) => s + r.wht, 0);

  return (
    <div className="mx-auto max-w-5xl px-3 py-4">
      <h1 className="text-2xl font-bold text-foreground">🧾 ใบหัก ณ ที่จ่าย (50 ทวิ)</h1>
      <p className="mt-1 text-sm text-muted">
        บริษัทของคุณเป็น<strong>ผู้หักภาษี 1%</strong> — ทุกใบเสร็จที่มีการหัก ต้องออก
        หนังสือรับรองฯ (50 ทวิ) ให้ Pacred · กด <strong>🖨 ฟอร์ม</strong> เพื่อพิมพ์ฟอร์มที่
        กรอกให้ครบแล้ว (ตั้ง<Link href="/profile" className="underline">ลายเซ็น/ตรายางใน
        โปรไฟล์</Link> = ระบบแปะให้อัตโนมัติ) · ออกใบหักจากระบบบัญชีของคุณเองก็ได้
        แล้วนำ<strong>เลขที่เอกสาร</strong>มากรอกในตาราง
      </p>

      {/* tabs ประวัติ */}
      <div className="mt-4 flex gap-2">
        <Link
          href="/wht-certs"
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === "open" ? "bg-primary-600 text-white" : "border border-border text-muted"}`}
        >
          ต้องดำเนินการ ({open.length})
        </Link>
        <Link
          href="/wht-certs?tab=done"
          className={`rounded-full px-4 py-1.5 text-sm font-bold ${tab === "done" ? "bg-primary-600 text-white" : "border border-border text-muted"}`}
        >
          ประวัติ · เสร็จแล้ว ({done.length})
        </Link>
      </div>

      <div className="mt-3 overflow-x-auto scrollbar-x-visible rounded-2xl border border-border bg-white dark:bg-surface">
        <table className="w-full min-w-[760px] border-collapse text-sm [&>tbody>tr>td]:border-t [&>tbody>tr>td]:border-border/60 [&>tbody>tr>td]:px-3 [&>tbody>tr>td]:py-2 [&>thead>tr>th]:px-3 [&>thead>tr>th]:py-2">
          <thead>
            <tr className="bg-surface-alt/60 text-left text-xs text-muted">
              <th>ใบเสร็จ / วันที่</th>
              <th className="text-right">ยอดก่อนหัก</th>
              <th className="text-right">หัก 1%</th>
              <th>สถานะใบหัก</th>
              <th>เลขที่เอกสาร (กรอกเอง)</th>
              <th>ดำเนินการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted">
                  {tab === "done" ? "ยังไม่มีรายการที่เสร็จแล้ว" : "🎉 ไม่มีรายการค้าง"}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const token = signReceiptToken(r.id);
                const pill = CERT_PILL[r.status] ?? CERT_PILL.none;
                const locked = r.status === "approved" || r.status === "waived";
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="font-bold text-foreground">{r.rid ?? `#${r.id}`}</p>
                      <p className="text-[11px] text-muted">{thDate(r.rdatecreate)}</p>
                    </td>
                    <td className="text-right tabular-nums">{baht(r.before)}</td>
                    <td className="text-right font-bold tabular-nums text-rose-700">{baht(r.wht)}</td>
                    <td>
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${pill.cls}`}>
                        {pill.label}
                      </span>
                      {r.wht_cert_uploaded_at ? (
                        <p className="mt-0.5 text-[10px] text-muted">แนบไฟล์ {thDate(r.wht_cert_uploaded_at)}</p>
                      ) : null}
                    </td>
                    <td>
                      <WhtCertNoEditor receiptId={r.id} initial={r.wht_cert_no ?? ""} locked={locked} />
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        <a
                          href={`/r/${token}/wht-form`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-primary-300 px-2.5 py-1 text-xs font-bold text-primary-700 hover:bg-primary-50"
                        >
                          🖨 ฟอร์ม
                        </a>
                        <a
                          href={`/r/${token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted hover:bg-surface"
                        >
                          📎 แนบไฟล์ / ดูใบเสร็จ
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length > 0 ? (
            <tfoot>
              <tr className="bg-surface-alt/40 font-bold">
                <td className="px-3 py-2">รวม {rows.length} ใบ</td>
                <td></td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-700">{baht(whtSum)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="mt-3 text-[11px] text-muted">
        💡 ใบเสร็จนามนิติจะ<strong>พิมพ์/ดาวน์โหลดได้เมื่อบัญชีตรวจรับใบหักแล้ว</strong> —
        แนบไฟล์ที่หน้าใบเสร็จ หรือส่งฉบับจริงให้ Pacred ก็ได้
      </p>
    </div>
  );
}
