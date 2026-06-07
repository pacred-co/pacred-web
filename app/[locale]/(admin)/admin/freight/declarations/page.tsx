import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { parsePage, pageRange, DEFAULT_PAGE_SIZE } from "@/lib/admin/paginate";
import { Pagination } from "@/components/admin/pagination";
import { CsvButton, type CsvCol, type CsvRow } from "@/components/admin/csv-button";
import { exportFreightDeclarationsAll } from "@/actions/admin/export/freight-declarations";
import {
  CUSTOMS_DECLARATION_STATUSES,
  CUSTOMS_DECLARATION_STATUS_LABEL,
  CUSTOMS_DECLARATION_TYPE_LABEL,
  type CustomsDeclarationStatus,
  type CustomsDeclarationType,
} from "@/lib/validators/customs-declaration";

/**
 * V-E11 — /admin/freight/declarations list.
 *
 * Status filter chips + search by declaration_no / job_no / control_no.
 *
 * Roles: super + accounting.
 */

export const dynamic = "force-dynamic";

const STATUS_BADGE: Record<CustomsDeclarationStatus, string> = {
  draft:     "bg-gray-50 text-gray-600 border-gray-200",
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  accepted:  "bg-amber-50 text-amber-700 border-amber-200",
  released:  "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50 text-red-700 border-red-200",
};

type Row = {
  id:                       string;
  declaration_no:           string | null;
  status:                   CustomsDeclarationStatus;
  declaration_type:         CustomsDeclarationType;
  customs_office:           string | null;
  customs_control_no:       string | null;
  broker_name:              string | null;
  total_declared_value_thb: number | null;
  total_duty_thb:           number | null;
  total_vat_thb:            number | null;
  submitted_at:             string | null;
  created_at:               string;
  freight_shipment_id:      string;
  shipment: {
    job_no: string | null;
    profile: {
      member_code:  string | null;
      first_name:   string | null;
      last_name:    string | null;
      company_name: string | null;
    } | null;
  } | null;
};

function thb(n: number | null): string {
  if (n == null) return "—";
  return "฿" + Number(n).toLocaleString("th-TH", { minimumFractionDigits: 2 });
}

export default async function AdminCustomsDeclarationsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
}) {
  await requireAdmin(["super", "accounting"]);
  const sp = await searchParams;
  const status = (CUSTOMS_DECLARATION_STATUSES as readonly string[]).includes(sp.status ?? "")
    ? (sp.status as CustomsDeclarationStatus)
    : null;
  const q = sp.q?.trim() ?? "";
  const page = parsePage(sp.page);
  const { from, to } = pageRange(page);

  const admin = createAdminClient();
  let query = admin
    .from("customs_declarations")
    .select(`
      id, declaration_no, status, declaration_type, customs_office,
      customs_control_no, broker_name,
      total_declared_value_thb, total_duty_thb, total_vat_thb,
      submitted_at, created_at, freight_shipment_id,
      shipment:freight_shipments!freight_shipment_id (
        job_no,
        profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
      )
    `, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (status) query = query.eq("status", status);
  if (q) {
    query = query.or(
      `declaration_no.ilike.%${q}%,customs_control_no.ilike.%${q}%,broker_name.ilike.%${q}%`,
    );
  }
  const { data: raw, error: rawErr, count: total } = await query;
  if (rawErr) {
    console.error(`[customs_declarations list] failed`, { code: rawErr.code, message: rawErr.message });
  }

  type RawShipment = NonNullable<Row["shipment"]>;
  type RawProfile  = NonNullable<RawShipment["profile"]>;
  const rows: Row[] = ((raw ?? []) as unknown as Array<
    Omit<Row, "shipment"> & {
      shipment: (Omit<RawShipment, "profile"> & { profile: RawProfile | RawProfile[] | null })
        | (Omit<RawShipment, "profile"> & { profile: RawProfile | RawProfile[] | null })[]
        | null;
    }
  >).map((r) => {
    const s = Array.isArray(r.shipment) ? r.shipment[0] ?? null : r.shipment;
    if (!s) return { ...r, shipment: null };
    const profile = Array.isArray(s.profile) ? s.profile[0] ?? null : s.profile;
    return { ...r, shipment: { ...s, profile } };
  });

  // Counts per status (lightweight extra round-trip).
  const counts: Record<CustomsDeclarationStatus, number> = {} as Record<CustomsDeclarationStatus, number>;
  for (const s of CUSTOMS_DECLARATION_STATUSES) counts[s] = 0;
  const { data: countRows, error: countRowsErr } = await admin
    .from("customs_declarations")
    .select("status");
  if (countRowsErr) {
    console.error(`[customs_declarations list] failed`, { code: countRowsErr.code, message: countRowsErr.message });
  }
  for (const r of (countRows ?? []) as Array<{ status: CustomsDeclarationStatus }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  // Secondary search hit: job_no — declarations don't carry it directly, so
  // when the search term looks like a job (A2600…), also pull matching
  // shipments and surface their declarations.
  let extraJobMatches: Row[] = [];
  if (q && /^a\d/i.test(q)) {
    const { data: jobs, error: jobsErr } = await admin
      .from("freight_shipments")
      .select("id")
      .ilike("job_no", `%${q}%`)
      .limit(50);
    if (jobsErr) {
      console.error(`[freight_shipments list] failed`, { code: jobsErr.code, message: jobsErr.message });
    }
    const shipIds = (jobs ?? []).map((j: { id: string }) => j.id);
    if (shipIds.length > 0) {
      let q2 = admin
        .from("customs_declarations")
        .select(`
          id, declaration_no, status, declaration_type, customs_office,
          customs_control_no, broker_name,
          total_declared_value_thb, total_duty_thb, total_vat_thb,
          submitted_at, created_at, freight_shipment_id,
          shipment:freight_shipments!freight_shipment_id (
            job_no,
            profile:profiles!profile_id ( member_code, first_name, last_name, company_name )
          )
        `)
        .in("freight_shipment_id", shipIds)
        .order("created_at", { ascending: false });
      if (status) q2 = q2.eq("status", status);
      const { data: extra, error: extraErr } = await q2;
      if (extraErr) {
        console.error(`[customs_declarations list] failed`, { code: extraErr.code, message: extraErr.message });
      }
      // Supabase PostgREST returns FK joins as arrays even for single-row
      // relationships; cast via unknown then normalise to single object.
      type RowWithMaybeArrShipment = Omit<Row, "shipment"> & {
        shipment: NonNullable<Row["shipment"]> | NonNullable<Row["shipment"]>[] | null;
      };
      const extraNorm: Row[] = ((extra ?? []) as unknown as RowWithMaybeArrShipment[]).map((r) => {
        const s = Array.isArray(r.shipment) ? r.shipment[0] ?? null : r.shipment;
        if (!s) return { ...r, shipment: null } as Row;
        const profileSrc = s.profile as NonNullable<typeof s.profile> | NonNullable<typeof s.profile>[] | null;
        const profile = Array.isArray(profileSrc) ? profileSrc[0] ?? null : profileSrc;
        return { ...r, shipment: { ...s, profile } } as Row;
      });
      // Dedupe with primary rows.
      const seen = new Set(rows.map((r) => r.id));
      extraJobMatches = extraNorm.filter((r) => !seen.has(r.id));
    }
  }
  const allRows = [...rows, ...extraJobMatches];

  // CSV — columns mirror the <thead> 1:1 (Thai labels).
  const csvCols: CsvCol[] = [
    { key: "declaration_no", label: "เลขที่" },
    { key: "declaration_type", label: "ประเภท" },
    { key: "job_no", label: "งาน" },
    { key: "customer", label: "ลูกค้า" },
    { key: "customs_office", label: "ด่าน" },
    { key: "customs_control_no", label: "Control no ศุลฯ" },
    { key: "declared_value", label: "สำแดง" },
    { key: "duty_vat", label: "อากร + VAT" },
    { key: "status", label: "สถานะ" },
    { key: "submitted_at", label: "วันที่ยื่น" },
  ];
  const csvRows: CsvRow[] = allRows.map((r) => {
    const totalTax = Number(r.total_duty_thb ?? 0) + Number(r.total_vat_thb ?? 0);
    const customer =
      r.shipment?.profile?.company_name ??
      `${r.shipment?.profile?.first_name ?? ""} ${r.shipment?.profile?.last_name ?? ""}`.trim();
    return {
      declaration_no: r.declaration_no ?? "(ร่าง)",
      declaration_type: CUSTOMS_DECLARATION_TYPE_LABEL[r.declaration_type],
      job_no: r.shipment?.job_no ?? "—",
      customer: customer || "—",
      customs_office: r.customs_office ?? "—",
      customs_control_no: r.customs_control_no ?? "—",
      declared_value: thb(r.total_declared_value_thb),
      duty_vat: thb(totalTax),
      status: CUSTOMS_DECLARATION_STATUS_LABEL[r.status],
      submitted_at: r.submitted_at ? r.submitted_at.slice(0, 10) : "—",
    };
  });

  return (
    <main className="p-6 lg:p-8 space-y-5 max-w-6xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">ADMIN · FREIGHT</p>
          <h1 className="mt-1 text-2xl font-bold">ใบขนสินค้า (V-E11)</h1>
          <p className="text-xs text-muted mt-1">
            workflow: ร่าง → ยื่นที่ด่านศุลฯ → ตรวจรับ → ตรวจปล่อย · ภายในของ Pacred ไม่ใช่ NetBay
          </p>
        </div>
        <CsvButton
          rows={csvRows}
          cols={csvCols}
          filename="freight-declarations.csv"
          fetchAll={async () => {
            "use server";
            return exportFreightDeclarationsAll({ status, q });
          }}
        />
      </header>

      {/* Status filter chips */}
      <nav className="flex flex-wrap gap-2">
        <Link
          href="/admin/freight/declarations"
          className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
            status === null ? "bg-primary-600 text-white" : "bg-surface-alt text-foreground hover:bg-surface-alt/80"
          }`}
        >
          ทั้งหมด <span className="ml-1 text-[10px]">({Object.values(counts).reduce((s, n) => s + n, 0)})</span>
        </Link>
        {CUSTOMS_DECLARATION_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/freight/declarations?status=${s}`}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
              s === status ? STATUS_BADGE[s] : "bg-white text-foreground border-border hover:bg-surface-alt"
            }`}
          >
            {CUSTOMS_DECLARATION_STATUS_LABEL[s]} <span className="ml-1 text-[10px] opacity-75">({counts[s]})</span>
          </Link>
        ))}
      </nav>

      {/* Search */}
      <form className="flex gap-2" action="/admin/freight/declarations" method="get">
        {status && <input type="hidden" name="status" value={status} />}
        <input
          name="q"
          placeholder="ค้นหา: declaration_no, customs control no, broker, job_no"
          defaultValue={q}
          className="flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-bold text-white hover:bg-primary-700">
          ค้นหา
        </button>
      </form>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-white dark:bg-surface overflow-hidden">
        {allRows.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-4xl" aria-hidden>📋</div>
            <p className="text-sm font-medium text-foreground">
              ไม่มีใบขนสินค้า{status && ` สถานะ "${CUSTOMS_DECLARATION_STATUS_LABEL[status]}"`}{q && ` ตรงกับ "${q}"`}
            </p>
            <p className="text-xs text-muted max-w-md mx-auto">
              {status || q
                ? "ลองล้างตัวกรองด้านบนเพื่อดูใบขนสินค้าทั้งหมด"
                : "ใบขนสินค้าถูกสร้างจากหน้า shipment ที่กำลังเคลียร์ของ — กด ‘สร้างใบขน’ ในหน้า shipment ที่ตรวจปล่อยแล้ว"}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-alt/50 text-left text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">เลขที่</th>
                <th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">งาน / ลูกค้า</th>
                <th className="px-3 py-2">ด่าน</th>
                <th className="px-3 py-2">Control no ศุลฯ</th>
                <th className="px-3 py-2 text-right">สำแดง</th>
                <th className="px-3 py-2 text-right">อากร + VAT</th>
                <th className="px-3 py-2">สถานะ</th>
                <th className="px-3 py-2">วันที่ยื่น</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((r) => {
                const totalTax = Number(r.total_duty_thb ?? 0) + Number(r.total_vat_thb ?? 0);
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-surface-alt/30">
                    <td className="px-3 py-2">
                      <Link href={`/admin/freight/declarations/${r.id}`} className="font-mono text-xs text-primary-600 hover:underline">
                        {r.declaration_no ?? "(ร่าง)"}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-xs">{CUSTOMS_DECLARATION_TYPE_LABEL[r.declaration_type]}</td>
                    <td className="px-3 py-2">
                      <p className="font-mono text-[11px]">{r.shipment?.job_no ?? "—"}</p>
                      <p className="text-[11px] text-muted">
                        {r.shipment?.profile?.company_name
                          ?? `${r.shipment?.profile?.first_name ?? ""} ${r.shipment?.profile?.last_name ?? ""}`.trim()
                          ?? "—"}
                      </p>
                    </td>
                    <td className="px-3 py-2 text-[11px]">{r.customs_office ?? "—"}</td>
                    <td className="px-3 py-2 text-[11px] font-mono">{r.customs_control_no ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(r.total_declared_value_thb)}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{thb(totalTax)}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_BADGE[r.status]}`}>
                        {CUSTOMS_DECLARATION_STATUS_LABEL[r.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] text-muted">
                      {r.submitted_at
                        ? new Date(r.submitted_at).toLocaleDateString("th-TH")
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Pagination
        page={page}
        pageSize={DEFAULT_PAGE_SIZE}
        total={total ?? 0}
        basePath="/admin/freight/declarations"
        params={{ status: status ?? undefined, q: q || undefined }}
      />
    </main>
  );
}
