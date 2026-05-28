import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { Link } from "@/i18n/navigation";
import { ConvertToJuristicForm } from "./convert-to-juristic-form";

export default async function ConvertToJuristicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, member_code, account_type, first_name, last_name, phone, email, created_at, status")
    .eq("id", id)
    .maybeSingle();
  if (profileErr) {
    console.error(`[profiles lookup] failed`, { code: profileErr.code, message: profileErr.message, details: profileErr.details, hint: profileErr.hint });
    throw new Error(`Failed to load profiles (${profileErr.code ?? "unknown"}): ${profileErr.message}`);
  }
  if (!profile) notFound();

  type Profile = {
    id: string; member_code: string | null; account_type: "personal" | "juristic";
    first_name: string | null; last_name: string | null; phone: string | null;
    email: string | null; created_at: string; status: string;
  };
  const p = profile as Profile;

  // If the customer is already juristic, the conversion makes no sense
  // — bounce them back to the detail page rather than render a confusing
  // form that would just error on submit.
  if (p.account_type === "juristic") {
    redirect(`/admin/customers/${id}`);
  }

  // Existing draft corporate row (rare — only if someone created it before
  // a successful conversion). Surface its values so admins can finish what
  // someone else started instead of typing the tax id twice.
  const { data: existingCorporate, error: existingCorporateErr } = await admin
    .from("corporate")
    .select("tax_id, company_name, company_address, status")
    .eq("profile_id", id)
    .maybeSingle<{ tax_id: string | null; company_name: string | null; company_address: string | null; status: string }>();
  if (existingCorporateErr) {
    console.error(`[corporate list] failed`, { code: existingCorporateErr.code, message: existingCorporateErr.message });
  }

  const customerName = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "ลูกค้า";

  return (
    <main className="p-6 lg:p-8 space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-primary-600">
            ADMIN · อัพเกรดบัญชี
          </p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">
            เปลี่ยนเป็นบัญชีนิติบุคคล
          </h1>
          <p className="text-sm text-muted mt-1">
            {customerName} · <span className="font-mono">{p.member_code ?? "—"}</span>
          </p>
        </div>
        <Link
          href={`/admin/customers/${id}`}
          className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-alt"
        >
          ← กลับโปรไฟล์ลูกค้า
        </Link>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 space-y-1">
        <p className="font-semibold">⚠ การเปลี่ยนนี้ส่งผลกระทบทั้งระบบ</p>
        <ul className="list-disc list-inside text-xs space-y-0.5">
          <li>ใบเสร็จ + ใบกำกับภาษี + ใบแจ้งหนี้ทั้งหมดที่ออกหลังจากนี้จะใช้ชื่อบริษัทแทนชื่อบุคคล</li>
          <li>Wallet balance + history + commissions ของลูกค้าคนนี้จะ <b>ติดไปกับบัญชีเดียวกัน</b> (ไม่รีเซ็ต)</li>
          <li>หากต้องการย้อนกลับเป็นบุคคล ต้องติดต่อ super admin</li>
        </ul>
      </section>

      <section className="rounded-2xl border border-border bg-white dark:bg-surface p-5 shadow-sm">
        <h2 className="font-bold text-sm mb-3">ข้อมูลลูกค้าปัจจุบัน</h2>
        <dl className="grid sm:grid-cols-2 gap-y-2 text-sm">
          <Field label="ประเภทปัจจุบัน"   value="บุคคลธรรมดา" />
          <Field label="สถานะ"            value={p.status} />
          <Field label="ชื่อ"              value={customerName} />
          <Field label="รหัสสมาชิก"       value={p.member_code ?? "—"} mono />
          <Field label="เบอร์"             value={p.phone ?? "—"} />
          <Field label="อีเมล"             value={p.email ?? "—"} />
          <Field label="สมัครเมื่อ"        value={new Date(p.created_at).toLocaleDateString("th-TH")} />
        </dl>
      </section>

      <ConvertToJuristicForm
        profileId={p.id}
        prefilledTaxId={existingCorporate?.tax_id ?? ""}
        prefilledCompanyName={existingCorporate?.company_name ?? ""}
        prefilledCompanyAddress={existingCorporate?.company_address ?? ""}
        hasExistingDraft={!!existingCorporate}
      />
    </main>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className={mono ? "font-mono font-medium" : "font-medium"}>{value}</dd>
    </>
  );
}
