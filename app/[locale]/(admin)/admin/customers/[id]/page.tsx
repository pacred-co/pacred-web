import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CustomerRowActions } from "@/components/admin/customer-row-actions";
import { ChevronLeft, User, Building2, Phone, Mail, MapPin, FileText, Calendar } from "lucide-react";
import { Link } from "@/i18n/navigation";

type Params = Promise<{ id: string }>;

type Doc = {
  id: string;
  doc_type: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_at: string;
};

const DOC_LABELS: Record<string, string> = {
  company_affidavit: "หนังสือรับรองบริษัท",
  vat: "ใบทะเบียนภาษีมูลค่าเพิ่ม (VAT)",
  national_id: "บัตรประชาชน",
};

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">{label}</dt>
      <dd className="text-sm text-foreground">{value || <span className="text-muted">—</span>}</dd>
    </div>
  );
}

export default async function CustomerDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!profile) notFound();

  const { data: docs } = await admin
    .from("documents")
    .select("id, doc_type, storage_path, mime_type, size_bytes, uploaded_at")
    .eq("profile_id", id)
    .order("uploaded_at", { ascending: false });

  const fullName = `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "—";
  const createdAt = new Date(profile.created_at).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const statusCfg = {
    active: { label: "ใช้งาน", className: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400" },
    incomplete: { label: "รอ Approve", className: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400" },
    suspended: { label: "ระงับ", className: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" },
  }[profile.status as string] ?? { label: profile.status, className: "bg-surface text-muted" };

  return (
    <div className="max-w-3xl">
      {/* Back */}
      <Link
        href="/admin/customers"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
        กลับรายชื่อสมาชิก
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary-50 dark:bg-primary-900/20 text-primary-600 text-xl font-bold shrink-0">
            {profile.account_type === "juristic" ? (
              <Building2 className="h-7 w-7" />
            ) : (
              <User className="h-7 w-7" />
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {profile.account_type === "juristic" ? (profile.company_name ?? fullName) : fullName}
            </h1>
            <p className="text-sm text-muted mt-0.5 font-mono">{profile.member_code ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusCfg.className}`}>
            {statusCfg.label}
          </span>
          <CustomerRowActions id={id} status={profile.status} />
        </div>
      </div>

      {/* Info cards */}
      <div className="space-y-4">
        {/* ข้อมูลติดต่อ */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Phone className="h-4 w-4 text-primary-600" />
            ข้อมูลติดต่อ
          </h2>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="เบอร์โทรศัพท์" value={profile.phone} />
            <Field label="อีเมล" value={profile.email} />
            <Field label="ประเภทบัญชี" value={profile.account_type === "juristic" ? "นิติบุคคล" : "บุคคลธรรมดา"} />
            <Field label="วิธีรู้จัก" value={profile.how_know} />
          </dl>
          {Array.isArray(profile.services) && profile.services.length > 0 && (
            <div className="mt-4">
              <dt className="text-xs font-semibold text-muted uppercase tracking-wide mb-2">บริการที่สนใจ</dt>
              <div className="flex flex-wrap gap-1.5">
                {profile.services.map((s: string) => (
                  <span key={s} className="rounded-full bg-primary-50 dark:bg-primary-900/20 px-3 py-0.5 text-xs font-medium text-primary-700 dark:text-primary-300">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ข้อมูลบริษัท (juristic only) */}
        {profile.account_type === "juristic" && (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-primary-600" />
              ข้อมูลบริษัท
            </h2>
            <dl className="grid grid-cols-2 gap-4">
              <Field label="ชื่อบริษัท" value={profile.company_name} />
              <Field label="เลขที่ผู้เสียภาษี" value={profile.tax_id} />
              {profile.address && typeof profile.address === "object" && (
                <>
                  <Field label="ที่อยู่" value={(profile.address as { line?: string }).line} />
                  <Field label="แขวง/ตำบล" value={(profile.address as { subdistrict?: string }).subdistrict} />
                  <Field label="เขต/อำเภอ" value={(profile.address as { district?: string }).district} />
                  <Field label="จังหวัด" value={(profile.address as { province?: string }).province} />
                  <Field label="รหัสไปรษณีย์" value={(profile.address as { postcode?: string }).postcode} />
                </>
              )}
            </dl>
          </div>
        )}

        {/* เอกสาร */}
        {docs && docs.length > 0 && (
          <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileText className="h-4 w-4 text-primary-600" />
              เอกสารแนบ
            </h2>
            <div className="space-y-2">
              {(docs as Doc[]).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between rounded-xl border border-border bg-[#F8F9FB] dark:bg-surface-alt px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {DOC_LABELS[doc.doc_type] ?? doc.doc_type}
                    </p>
                    <p className="text-xs text-muted mt-0.5">
                      {doc.mime_type} · {doc.size_bytes ? `${Math.round(doc.size_bytes / 1024)} KB` : "—"}
                    </p>
                  </div>
                  <span className="text-xs text-muted">
                    {new Date(doc.uploaded_at).toLocaleDateString("th-TH")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="rounded-2xl border border-border bg-white dark:bg-surface p-6 shadow-sm">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Calendar className="h-4 w-4 text-primary-600" />
            ข้อมูลระบบ
          </h2>
          <dl className="grid grid-cols-2 gap-4">
            <Field label="ID" value={id} />
            <Field label="วันที่สมัคร" value={createdAt} />
          </dl>
        </div>
      </div>
    </div>
  );
}
