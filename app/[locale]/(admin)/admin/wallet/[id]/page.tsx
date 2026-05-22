/**
 * /admin/wallet/[id] — read-only wallet transaction detail (Wave 7 fix).
 *
 * The /admin dashboard's "ดู/แก้ไข" links on the topup/withdraw tabs
 * pointed at `/admin/wallet/${row.id}` but no route existed → 404. This
 * page resolves the row id against `tb_wallet_hs` + `tb_users` and
 * renders the basics + the slip image (if any).
 *
 * Wave 8 backlog: add approve/reject buttons that mutate
 * tb_wallet_hs.status (currently '1'=รอ → '2'=อนุมัติ or '3'=ปฏิเสธ)
 * and credit/debit the customer's tb_wallet.wallettotal. For now, the
 * page is read-only; ops handles approval via the legacy PHP admin if
 * urgent.
 */

import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ",
  "2": "อนุมัติแล้ว",
  "3": "ปฏิเสธ",
};
const STATUS_CLS: Record<string, string> = {
  "1": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "2": "bg-green-100 text-green-700 border-green-200",
  "3": "bg-red-100 text-red-700 border-red-200",
};

// Verified prod schema 2026-05-21 via REST: tb_wallet_hs has columns
// {id, date, dateslip, amount, status, type, typenew, typeservice,
// paydeposit, admincreate, imagesslip, depositnamebank, nameuserbank,
// nouserbank, note, adminid, adminidupdate, lockdate, session, reforder,
// reforder2, whno, wusercreate, ...}. Custcode for customer is `wusercreate`.
type WalletHsRow = {
  id: number;
  date: string | null;
  dateslip: string | null;
  amount: number;
  status: string | null;
  type: string | null;
  imagesslip: string | null;
  userid: string;               // ← customer userid (e.g. "PR10691")
  note: string | null;
  nouserbank: string | null;
  nameuserbank: string | null;
  depositnamebank: string | null;
};

type UserRow = {
  userid: string;
  username: string | null;
  userlastname: string | null;
  usertel: string | null;
  useremail: string | null;
};

export default async function AdminWalletDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(["ops", "accounting", "super"]);
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const admin = createAdminClient();
  const { data: rowRaw } = await admin
    .from("tb_wallet_hs")
    .select("id,date,dateslip,amount,status,type,imagesslip,userid,note,nouserbank,nameuserbank,depositnamebank")
    .eq("id", id)
    .maybeSingle();
  if (!rowRaw) notFound();
  const row = rowRaw as unknown as WalletHsRow;

  const { data: userRaw } = await admin
    .from("tb_users")
    .select("userid,username,userlastname,usertel,useremail")
    .eq("userid", row.userid)
    .maybeSingle();
  const user = userRaw as unknown as UserRow | null;

  const amount = Number(row.amount ?? 0);
  const isWithdraw = amount < 0;

  // Wave 13 — `imagesslip` stores a bare legacy filename. Resolve to a
  // 1-hour signed Supabase URL on the server so the <img> below renders
  // a real image rather than a 404. Bucket = `slips`, prefix = `legacy/`
  // for pre-Pacred uploads; `admin/...` or `<userid>/...` paths pass
  // through (Wave 12 + customer-side uploads).
  const slipResolved = await resolveLegacyUrl(row.imagesslip, "slip");
  const customerName = `${user?.username ?? ""} ${user?.userlastname ?? ""}`.trim() || "—";
  const status = row.status ?? "1";
  const userid = row.userid;

  return (
    <main className="p-6 lg:p-8 max-w-3xl mx-auto space-y-5">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-500">
            ADMIN · WALLET {isWithdraw ? "WITHDRAW" : "TOPUP"}
          </p>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <h1 className="text-2xl font-bold font-mono">#{row.id}</h1>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${STATUS_CLS[status] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
              {STATUS_LABEL[status] ?? `status ${status}`}
            </span>
            <span className={`rounded-full border px-3 py-1 text-xs font-medium ${
              isWithdraw ? "bg-red-50 text-red-700 border-red-200" : "bg-green-50 text-green-700 border-green-200"
            }`}>
              {isWithdraw ? "ถอนเงิน" : "เติมเงิน"}
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Wave 7 read-only · ปุ่ม approve/reject + wallet ledger adjust → Wave 8
          </p>
        </div>
        <Link href="/admin" className="text-xs text-primary-600 hover:underline">
          ← Dashboard
        </Link>
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5 space-y-3 text-sm">
        <KV label="ลูกค้า" value={`${customerName} (${userid})`} />
        <KV label="โทร · อีเมล" value={`${user?.usertel ?? "-"} · ${user?.useremail ?? "-"}`} />
        <KV label="จำนวนเงิน (THB)" value={`฿${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}`} mono />
        <KV label="วันที่สร้าง" value={row.date ? new Date(row.date).toLocaleString("th-TH") : "-"} />
        <KV label="วันที่บนสลิป" value={row.dateslip ? new Date(row.dateslip).toLocaleString("th-TH") : "-"} />
        {row.depositnamebank && <KV label="ธนาคาร" value={row.depositnamebank} />}
        {row.nameuserbank && <KV label="ชื่อบัญชี" value={row.nameuserbank} />}
        {row.nouserbank && <KV label="เลขที่บัญชี" value={row.nouserbank} mono />}
        {row.note && <KV label="หมายเหตุ" value={row.note} />}
      </div>

      {slipResolved && (
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-5">
          <p className="text-xs font-semibold text-muted mb-2">สลิป</p>
          <a
            href={slipResolved}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-md border border-border overflow-hidden hover:border-primary-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={slipResolved} alt="สลิป" className="max-w-full max-h-[600px]" />
          </a>
          <p className="text-[10px] text-muted mt-2 break-all font-mono">{row.imagesslip}</p>
        </div>
      )}
      {row.imagesslip && !slipResolved && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-xs font-semibold text-amber-900 mb-1">⚠ ไม่สามารถสร้างลิงก์สลิปได้</p>
          <p className="text-[10px] text-amber-800 break-all font-mono">filename = {row.imagesslip}</p>
          <p className="text-[10px] text-amber-700 mt-1">(legacy filename อาจไม่อยู่บน Supabase Storage หรือ bucket ไม่มีไฟล์นี้)</p>
        </div>
      )}

      <div className="flex gap-2 flex-wrap pt-2">
        <Link href="/admin" className="rounded-md border border-border bg-white px-3 py-2 text-xs hover:bg-surface-alt">
          ← Dashboard
        </Link>
        <Link href={`/admin/wallet?userid=${encodeURIComponent(userid)}`} className="rounded-md border border-primary-500 bg-primary-500 px-3 py-2 text-xs text-white hover:bg-primary-600">
          ดูประวัติ wallet ของลูกค้านี้ →
        </Link>
      </div>
    </main>
  );
}

function KV({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-b border-border/40 py-1.5">
      <span className="text-muted">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}
