/**
 * /admin/api-forwarder-yiwu — อี้อู (Yiwu) ใบส่งของ → box-split arrival rows (แผนก CS).
 *
 * อี้อู warehouse has NO API. When goods land at the China warehouse it sends a
 * ใบส่งของ (delivery-note) IMAGE. CS uploads it here → keys the review grid → commit →
 * box-split tb_forwarder rows at "ถึงโกดังจีน" (fstatus 2, fwarehousechina 2 = อี้อู rate).
 *
 * The packing-list upload (→ container + "กำลังส่งมาไทย") lives on the TTW page
 * (แผนก DOC · /admin/api-forwarder-ttw) — owner ภูม 2026-07-25 split by department.
 * Below the key-in form: a read-only ประวัติ of what CS keyed (fwarehousechina='2').
 */

import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { WarehouseWorkspaceNav } from "@/components/admin/warehouse-workspace-nav";
import { YiwuDeliveryClient } from "./yiwu-client";
import { fstatusBadge } from "@/lib/admin/forwarder-status";

export const dynamic = "force-dynamic";

type HistRow = {
  id: number;
  ftrackingchn: string | null;
  userid: string | null;
  famount: number | null;
  fweight: number | string | null;
  fvolume: number | string | null;
  fstatus: string | null;
  fdatestatus2: string | null;
  fcabinetnumber: string | null;
  adminidcreator: string | null;
};

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric" });
}
const num = (v: number | string | null, dp = 0) =>
  v == null ? "—" : Number(v).toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });

export default async function AdminApiForwarderYiwuPage() {
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);
  const admin = createAdminClient();

  // ประวัติที่ CS คีย์เข้าระบบ (อี้อู · fwarehousechina='2') — read-only · newest first.
  const { data: histData, error: histErr } = await admin
    .from("tb_forwarder")
    .select("id, ftrackingchn, userid, famount, fweight, fvolume, fstatus, fdatestatus2, fcabinetnumber, adminidcreator")
    .eq("fwarehousechina", "2")
    .order("id", { ascending: false })
    .limit(60);
  if (histErr) console.error("[api-forwarder-yiwu history] load failed", { code: histErr.code, message: histErr.message });
  const hist = (histData ?? []) as HistRow[];

  // customer names for the PR badge (one query · soft-fail).
  const prs = Array.from(new Set(hist.map((r) => r.userid).filter((v): v is string => !!v)));
  const nameByPr: Record<string, string> = {};
  if (prs.length > 0) {
    const { data: us, error: usErr } = await admin.from("tb_users").select("userID, userName").in("userID", prs);
    if (usErr) console.error("[api-forwarder-yiwu name lookup] failed", { code: usErr.code, message: usErr.message });
    for (const u of (us ?? []) as { userID: string; userName: string | null }[]) nameByPr[u.userID] = u.userName ?? "";
  }

  return (
    <main className="p-4 lg:p-8 space-y-5">
      {/* owner 2026-07-26 "ใช้แพทเทินและธีมเดียวกับ MOMO แค่คนละโกดัง" — แถบนำทางร่วม
          ตัวเดียวกับหน้า MOMO: แท็บโกดัง (กวางโจว/อี้อู) + เครื่องมือของโกดังนี้ + ทางกลับ */}
      <WarehouseWorkspaceNav warehouse="yiwu" current="/admin/api-forwarder-yiwu"
        pageLabel="คีย์ใบส่งของ (CS)" />

      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · อี้อู (YIWU) · ใบส่งของ <span className="ml-1 rounded-full bg-primary-600 px-2 py-0.5 text-[11px] font-semibold text-white">แผนก CS</span>
          </p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-600 text-white shadow-sm">义</span>
            อี้อู — อ่านใบส่งของ เข้าระบบ
          </h1>
          <p className="mt-1.5 text-sm text-muted">
            อี้อูไม่มี API — <strong>คีย์จากใบส่งของ</strong> ที่โกดังจีนส่งมา →
            กด <strong className="text-emerald-700">เอาเข้าระบบ</strong> →
            สถานะ <strong>ถึงโกดังจีนแล้ว</strong> (แตกกล่องตามขนาดจริงอัตโนมัติ · ตั้งราคาให้เองตามเรทลูกค้า).
          </p>
        </div>
      </header>

      {/* How-it-works banner */}
      <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-xs leading-relaxed text-teal-900">
        <strong>ขั้นตอน:</strong>{" "}
        <span className="font-medium">1)</span> อัปรูปใบส่งของ (จ่อเมาส์=พรีวิว · คลิก=ดูเต็ม) ·{" "}
        <span className="font-medium">2)</span> คีย์ตาราง<strong> ตามใบส่งของเป๊ะ</strong> (单号 · PR · สินค้า · กล่อง · น้ำหนัก · ยาว/กว้าง/สูง · คิว) — <strong>ลากสลับหัวคอลัมน์ ยาว/กว้าง/สูง ได้</strong> ตามลำดับในใบ ·{" "}
        <span className="font-medium">3)</span> กด “เอาเข้าระบบ”. ยังไม่กด = ยังไม่เข้าระบบ.
        <br />
        <span className="text-teal-700">
          1 ใบส่งของมีได้หลาย PR (PR เป็นคอลัมน์) · เงินคิดจากขนาด/น้ำหนักที่กรอก (ระบบตั้งราคาให้เองตามเรทอี้อู) — ยังไม่วางบิล.
          <strong> เลขตู้จริง + สถานะ “กำลังส่งมาไทย” จะมาตอนแผนก DOC อัปไฟล์ packing list ที่หน้า TTW.</strong>
        </span>
      </div>

      <YiwuDeliveryClient />

      {/* ── ประวัติที่คีย์เข้าระบบ ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-2">
        <div className="h-px flex-1 bg-gray-200" />
        <span className="text-[11px] font-medium tracking-widest text-muted">ประวัติที่คีย์เข้าระบบแล้ว</span>
        <div className="h-px flex-1 bg-gray-200" />
      </div>

      <section className="rounded-2xl border border-gray-200 bg-surface p-4 shadow-sm sm:p-5">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-base">📋</span>
          <h2 className="text-base font-semibold">ประวัติที่ CS คีย์เข้าระบบ (อี้อู)</h2>
        </div>
        <p className="mb-3 text-[12px] text-muted">เช็คได้ว่าเพิ่มรายการไหนไปแล้วบ้าง · ล่าสุด {hist.length} รายการ · กด 单号 เพื่อเปิดรายการนำเข้า</p>

        {hist.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted">
            {histErr ? "โหลดประวัติไม่สำเร็จ" : "ยังไม่มีรายการที่คีย์เข้าระบบ"}
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible rounded-lg border border-gray-200">
            <table className="w-full min-w-[820px] border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-gray-100 text-left text-[11px] text-gray-600 [&>th]:border [&>th]:border-gray-200 [&>th]:px-3 [&>th]:py-2">
                  <th>วันที่ถึงจีน</th>
                  <th>单号</th>
                  <th>PR</th>
                  <th>ลูกค้า</th>
                  <th className="!text-right">กล่อง</th>
                  <th className="!text-right">น้ำหนัก</th>
                  <th className="!text-right">คิว</th>
                  <th>ตู้</th>
                  <th>สถานะ</th>
                  <th>คีย์โดย</th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border [&>tr>td]:border-gray-100 [&>tr>td]:px-3 [&>tr>td]:py-2">
                {hist.map((r) => {
                  const st = fstatusBadge((r.fstatus ?? "").trim());
                  return (
                    <tr key={r.id} className="odd:bg-white even:bg-gray-50/60">
                      <td className="whitespace-nowrap text-muted">{fmtDate(r.fdatestatus2)}</td>
                      <td className="font-mono">
                        <Link href={`/admin/forwarders/${r.id}`} className="font-semibold text-[#1e9ff2] hover:underline">{r.ftrackingchn ?? "—"}</Link>
                      </td>
                      <td className="font-medium">{r.userid ?? "—"}</td>
                      <td className="max-w-[160px] truncate" title={(r.userid && nameByPr[r.userid]) || ""}>{(r.userid && nameByPr[r.userid]) || "—"}</td>
                      <td className="text-right tabular-nums">{num(r.famount)}</td>
                      <td className="text-right tabular-nums">{num(r.fweight, 1)}</td>
                      <td className="text-right tabular-nums">{num(r.fvolume, 4)}</td>
                      <td className="whitespace-nowrap text-muted">{r.fcabinetnumber?.trim() || "—"}</td>
                      <td><span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] ${st.chip}`}>{st.label}</span></td>
                      <td className="whitespace-nowrap text-[11px] text-muted">{r.adminidcreator ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
