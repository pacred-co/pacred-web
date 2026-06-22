/**
 * /admin/juristic-check — juristic verification queue (P0-18 · adm-08 WF#12).
 *
 * Re-pointed from the rebuilt-empty `corporate`+`profiles` (UUID) to the
 * LEGACY `tb_corporate` (keyed by `userid`) JOIN `tb_users`, so the 8,898
 * migrated juristic customers (whose data lives in tb_corporate) finally
 * surface here and can be verified/rejected.
 *
 * Legacy source: pcs-admin/users.php?page=corporation → user-corporation.php
 *   `SELECT ... WHERE u.userCompany='1' AND corporateStatus=1` (the pending
 *   queue). statusComp() (function.php:530) maps the codes:
 *     '1'=รอตรวจสอบ(pending) · '2'=อนุมัติแล้ว(verified) · '3'=ไม่ผ่าน(rejected).
 *
 * Customer docs: legacy juristic cert (corporateFile) + ภพ20 (corporateFile20)
 * are bare filenames under the legacy `file` bucket — resolved via
 * resolveLegacyUrl("…","file").
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveLegacyUrl } from "@/lib/storage/legacy-resolver";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportJuristicCheckAll } from "@/actions/admin/export/juristic-check";
import { JuristicActions } from "./juristic-actions";
import { PageHeader } from "@/components/admin/page-header";

// requireAdmin reads auth cookies → force-dynamic (AGENTS.md §11).
export const dynamic = "force-dynamic";

// Legacy corporatestatus codes (function.php statusComp).
const STATUS_LABEL: Record<string, string> = {
  "1": "รอตรวจสอบ", "2": "อนุมัติแล้ว", "3": "ไม่ผ่าน",
};
const STATUS_BADGE: Record<string, string> = {
  "1": "bg-amber-50 text-amber-700 border-amber-200",
  "2": "bg-green-50 text-green-700 border-green-200",
  "3": "bg-red-50 text-red-700 border-red-200",
};
// UI URL ?status= → corporatestatus value (default queue = pending, like legacy).
const STATUS_PARAM: Record<string, string> = { pending: "1", verified: "2", rejected: "3" };

type CorpRow = {
  id: number;
  userid: string;
  corporatenumber: string | null;
  corporatename: string | null;
  corporateaddress: string | null;
  corporatestatus: string | null;
  corporatefile: string | null;
  corporatefile20: string | null;
  cpdatecreate: string | null;
};
type URow = {
  userID: string;
  userName: string | null;
  userLastName: string | null;
  userTel: string | null;
  userEmail: string | null;
};

export default async function AdminJuristicCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  // Legacy review roles (CEO/Manager/QA/Accounting/ITDT) → Pacred equivalents.
  await requireAdmin(["super", "manager", "accounting", "qa", "ops", "sales_admin"]);

  const sp = await searchParams;
  const admin = createAdminClient();

  // Default to the pending queue (legacy `corporateStatus=1`); chips switch it.
  const statusFilter = sp.status ? STATUS_PARAM[sp.status] : "1";

  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  let q = admin
    .from("tb_corporate")
    .select(
      "id, userid, corporatenumber, corporatename, corporateaddress, corporatestatus, corporatefile, corporatefile20, cpdatecreate",
      { count: "exact" },
    )
    .order("cpdatecreate", { ascending: false })
    .range(from, to);
  if (statusFilter) q = q.eq("corporatestatus", statusFilter);

  const { data, error, count: total } = await q;
  if (error) {
    console.error(`[juristic-check tb_corporate list] failed`, { code: error.code, message: error.message });
    throw new Error(`juristic-check: failed to load tb_corporate — ${error.code ?? "unknown"}: ${error.message}`);
  }
  const corps = (data ?? []) as unknown as CorpRow[];

  // Resolve customer identity (tb_users) for the listed corporate rows.
  const userIds = [...new Set(corps.map((c) => c.userid))];
  const userMap = new Map<string, URow>();
  if (userIds.length > 0) {
    const { data: users, error: usersErr } = await admin
      .from("tb_users")
      .select("userID, userName, userLastName, userTel, userEmail")
      .in("userID", userIds);
    if (usersErr) console.error(`[juristic-check tb_users] failed`, { code: usersErr.code, message: usersErr.message });
    for (const u of (users ?? []) as unknown as URow[]) userMap.set(u.userID, u);
  }

  // Resolve legacy doc files (cert + ภพ20) → signed URLs.
  const rows = await Promise.all(
    corps.map(async (c) => {
      const docs: { label: string; url: string; mime: string }[] = [];
      const certUrl = await resolveLegacyUrl(c.corporatefile, "file");
      const vatUrl = await resolveLegacyUrl(c.corporatefile20, "file");
      if (certUrl) docs.push({ label: "หนังสือรับรอง", url: certUrl, mime: guessMime(c.corporatefile) });
      if (vatUrl) docs.push({ label: "ภ.พ.20", url: vatUrl, mime: guessMime(c.corporatefile20) });
      return { corp: c, user: userMap.get(c.userid) ?? null, docs };
    }),
  );

  // Counts across ALL statuses for the chips (one cheap grouped read).
  // Best-effort — a failure degrades the chip counts to 0, never blocks the page.
  const { data: allStatus, error: countErr } = await admin
    .from("tb_corporate")
    .select("corporatestatus")
    .in("corporatestatus", ["1", "2", "3"]);
  if (countErr) console.error(`[juristic-check status counts] failed`, { code: countErr.code, message: countErr.message });
  const counts = ((allStatus ?? []) as { corporatestatus: string | null }[]).reduce<Record<string, number>>(
    (acc, r) => { const s = r.corporatestatus ?? ""; acc[s] = (acc[s] ?? 0) + 1; return acc; },
    {},
  );

  // CSV — columns mirror the <thead> 1:1 (the docs/actions cell is non-data UI,
  // so it is replaced by the customer contact columns the page shows in-cell).
  const csvCols: CsvCol[] = [
    { key: "userid", label: "ลูกค้า" },
    { key: "customer", label: "ชื่อลูกค้า" },
    { key: "tel", label: "เบอร์โทร" },
    { key: "email", label: "อีเมล" },
    { key: "corporatenumber", label: "เลขผู้เสียภาษี" },
    { key: "corporatename", label: "ชื่อบริษัท" },
    { key: "corporateaddress", label: "ที่อยู่บริษัท" },
    { key: "status", label: "สถานะ" },
    { key: "cpdatecreate", label: "วันที่ส่ง" },
  ];
  const csvRows: CsvRow[] = rows.map(({ corp: c, user: u }) => ({
    userid: c.userid ?? "",
    customer: u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "",
    tel: u?.userTel ?? "",
    email: u?.userEmail ?? "",
    corporatenumber: c.corporatenumber ?? "",
    corporatename: c.corporatename ?? "",
    corporateaddress: c.corporateaddress ?? "",
    status: STATUS_LABEL[c.corporatestatus ?? "1"] ?? (c.corporatestatus ?? ""),
    cpdatecreate: c.cpdatecreate ? c.cpdatecreate.slice(0, 10) : "",
  }));

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <PageHeader
        eyebrow="ADMIN · ลูกค้านิติบุคคล"
        title="🏢 ตรวจสอบลูกค้านิติบุคคล"
        subtitle="ตรวจหนังสือรับรอง + ภ.พ.20 ของลูกค้านิติบุคคล แล้วยืนยัน / ปฏิเสธสถานะ"
        actions={
          <CsvButton
            rows={csvRows}
            cols={csvCols}
            filename="juristic-check.csv"
            fetchAll={async () => {
              "use server";
              return exportJuristicCheckAll({ statusFilter });
            }}
          />
        }
      />

      <div className="flex flex-wrap gap-2">
        {([
          ["pending", "รอตรวจสอบ", "1"],
          ["verified", "อนุมัติแล้ว", "2"],
          ["rejected", "ไม่ผ่าน", "3"],
        ] as const).map(([key, label, code]) => {
          const active = (sp.status ?? "pending") === key;
          return (
            <Link
              key={key}
              href={`/admin/juristic-check?status=${key}`}
              className={`rounded-full border px-3 py-1 text-xs ${active ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border"}`}
            >
              {label} ({counts[code] ?? 0})
            </Link>
          );
        })}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีลูกค้านิติบุคคลที่ตรงตามเกณฑ์</p>
        ) : (
          <div className="overflow-x-auto scrollbar-x-visible">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-4 py-3">ลูกค้า</th>
                  <th className="px-4 py-3">เลขผู้เสียภาษี</th>
                  <th className="px-4 py-3">ชื่อบริษัท</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">วันที่ส่ง</th>
                  <th className="px-4 py-3 min-w-[220px]">เอกสาร + การจัดการ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ corp: c, user: u, docs }) => {
                  const status = c.corporatestatus ?? "1";
                  return (
                    <tr key={c.id} className="border-t border-border align-top">
                      <td className="px-4 py-3 text-xs">
                        <div className="font-mono">{c.userid}</div>
                        <div>{u ? `${u.userName ?? ""} ${u.userLastName ?? ""}`.trim() : "—"}</div>
                        <div className="text-muted">{u?.userTel ?? ""}</div>
                        <Link href={`/admin/customers/${c.userid}`} className="text-primary-500 hover:underline text-[11px]">→ ดูโปรไฟล์</Link>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{c.corporatenumber}</td>
                      <td className="px-4 py-3 text-xs">{c.corporatename}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${STATUS_BADGE[status] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}>
                          {STATUS_LABEL[status] ?? status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                        {c.cpdatecreate ? new Date(c.cpdatecreate).toLocaleDateString("th-TH") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <JuristicActions
                          userid={c.userid}
                          status={status}
                          taxId={c.corporatenumber ?? ""}
                          docUrls={docs}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={total ?? 0}
        basePath="/admin/juristic-check"
        params={{ status: sp.status }}
      />
    </main>
  );
}

function guessMime(filename: string | null): string {
  if (!filename) return "application/octet-stream";
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}
