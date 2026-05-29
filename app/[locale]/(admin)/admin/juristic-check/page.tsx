import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { JuristicActions } from "./juristic-actions";

export default async function AdminJuristicCheckPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const admin = createAdminClient();

  let q = admin.from("corporate")
    .select(`
      profile_id, tax_id, company_name, company_address, status,
      verified_at, rejection_reason, created_at,
      profile:profiles!profile_id ( member_code, first_name, last_name, phone, email )
    `)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sp.status) q = q.eq("status", sp.status);

  const { data, error } = await q;
  if (error) {
    console.error(`[corporate list] failed`, { code: error.code, message: error.message });
  }
  type ProfileShape = { member_code: string | null; first_name: string | null; last_name: string | null; phone: string | null; email: string | null };
  type RawRow = NonNullable<typeof data>[number] & { profile: ProfileShape | ProfileShape[] | null };
  const rows = ((data ?? []) as RawRow[]).map((r) => ({
    ...r,
    profile_row: Array.isArray(r.profile) ? r.profile[0] ?? null : r.profile,
  }));

  // Fetch documents for all profiles in one query
  const profileIds = rows.map((r) => r.profile_id);
  const { data: docs } = profileIds.length > 0
    ? await admin
        .from("documents")
        .select("profile_id, doc_type, storage_path, mime_type")
        .in("profile_id", profileIds)
    : { data: [] };

  // Get signed URLs for each document
  const docMap: Record<string, { label: string; url: string; mime: string }[]> = {};
  if (docs && docs.length > 0) {
    const DOC_LABELS: Record<string, string> = {
      company_affidavit: "หนังสือรับรอง",
      vat:               "ภ.พ.20",
      national_id:       "บัตรประชาชน",
    };
    for (const doc of docs) {
      const { data: signed } = await admin.storage
        .from("member-docs")
        .createSignedUrl(doc.storage_path, 3600);
      if (!signed?.signedUrl) continue;
      if (!docMap[doc.profile_id]) docMap[doc.profile_id] = [];
      docMap[doc.profile_id].push({
        label: DOC_LABELS[doc.doc_type] ?? doc.doc_type,
        url:   signed.signedUrl,
        mime:  doc.mime_type,
      });
    }
  }

  const counts = rows.reduce<Record<string, number>>((acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; }, {});

  const STATUS_LABEL: Record<string, string> = {
    pending: "รอตรวจ", verified: "ยืนยันแล้ว", rejected: "ปฏิเสธ",
  };
  const STATUS_BADGE: Record<string, string> = {
    pending:  "bg-amber-50 text-amber-700 border-amber-200",
    verified: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <main className="p-6 lg:p-8 space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · EXTENSION</p>
        <h1 className="mt-1 text-2xl font-bold">🏢 เช็คข้อมูลลูกค้านิติบุคคล</h1>
        <p className="mt-1 text-sm text-muted">ตรวจหนังสือรับรอง + ภ.พ.20 ของลูกค้านิติบุคคล แล้วยืนยันสถานะ</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/admin/juristic-check" className={`rounded-full border px-3 py-1 text-xs ${!sp.status ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border"}`}>
          ทั้งหมด ({rows.length})
        </Link>
        {Object.entries(STATUS_LABEL).map(([k, l]) => (
          <Link key={k} href={`/admin/juristic-check?status=${k}`}
            className={`rounded-full border px-3 py-1 text-xs ${sp.status === k ? "bg-primary-500 text-white border-primary-500" : "bg-white border-border"}`}>
            {l} ({counts[k] ?? 0})
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-white dark:bg-surface shadow-sm overflow-hidden">
        {rows.length === 0 ? (
          <p className="p-12 text-center text-sm text-muted">ไม่มีลูกค้านิติบุคคลที่ตรงตามเกณฑ์</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">ลูกค้า</th>
                <th className="px-4 py-3">เลขผู้เสียภาษี</th>
                <th className="px-4 py-3">ชื่อบริษัท</th>
                <th className="px-4 py-3">สถานะ</th>
                <th className="px-4 py-3">วันที่ส่ง</th>
                <th className="px-4 py-3 min-w-[200px]">เอกสาร + การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.profile_id} className="border-t border-border align-top">
                  <td className="px-4 py-3 text-xs">
                    <div className="font-mono">{r.profile_row?.member_code ?? "—"}</div>
                    <div>{r.profile_row?.first_name} {r.profile_row?.last_name}</div>
                    <div className="text-muted">{r.profile_row?.phone}</div>
                    <Link href={`/admin/customers/${r.profile_id}`} className="text-primary-500 hover:underline text-[10px]">→ ดูโปรไฟล์</Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.tax_id}</td>
                  <td className="px-4 py-3 text-xs">{r.company_name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[r.status]}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                    {r.rejection_reason && <div className="text-[10px] text-red-700 mt-1">{r.rejection_reason}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                    {new Date(r.created_at).toLocaleDateString("th-TH")}
                  </td>
                  <td className="px-4 py-3">
                    <JuristicActions
                      profileId={r.profile_id}
                      status={r.status}
                      taxId={r.tax_id ?? ""}
                      docUrls={docMap[r.profile_id] ?? []}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
