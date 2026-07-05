/**
 * /admin/customers/[id]/convert-to-juristic — P0-18 (adm-08 WF#14).
 *
 * Re-pointed from the rebuilt `profiles`/`corporate` (UUID) to the LEGACY
 * `tb_users`/`tb_corporate` (keyed by `userID`). `[id]` is the legacy member
 * code (e.g. PR2791) — the same id the detail page + customer list pass.
 * The prior version treated `[id]` as a profiles UUID and read the empty
 * rebuilt tables → dead for all 8,898 migrated customers.
 */
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/auth/require-admin";
import { Link } from "@/i18n/navigation";
import { ConvertToJuristicForm } from "./convert-to-juristic-form";

// requireAdmin reads auth cookies → force-dynamic (AGENTS.md §11).
export const dynamic = "force-dynamic";

export default async function ConvertToJuristicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // 2026-07-05 (owner) — +`sales` (Cargo Sales Staff) · matches JURISTIC_ROLES.
  await requireAdmin(["super", "manager", "accounting", "qa", "ops", "sales_admin", "sales"]);

  const { id } = await params;
  const userid = id.toUpperCase();
  const admin = createAdminClient();

  const { data: user, error: userErr } = await admin
    .from("tb_users")
    .select("userID, userName, userLastName, userTel, userEmail, userCompany, userRegistered, userStatus")
    .eq("userID", userid)
    .maybeSingle<{
      userID: string; userName: string | null; userLastName: string | null;
      userTel: string | null; userEmail: string | null; userCompany: string | null;
      userRegistered: string | null; userStatus: string | null;
    }>();
  if (userErr) {
    console.error(`[convert-to-juristic tb_users] failed`, { userid, code: userErr.code, message: userErr.message });
    throw new Error(`Failed to load tb_users (${userErr.code ?? "unknown"}): ${userErr.message}`);
  }
  if (!user) notFound();

  // Existing corporate row → reuse its values (prefill) or, if the customer
  // is already a verified company, bounce back to the detail page.
  const { data: corp, error: corpErr } = await admin
    .from("tb_corporate")
    .select("corporatenumber, corporatename, corporateaddress, corporatestatus")
    .eq("userid", userid)
    .maybeSingle<{ corporatenumber: string | null; corporatename: string | null; corporateaddress: string | null; corporatestatus: string | null }>();
  if (corpErr) {
    console.error(`[convert-to-juristic tb_corporate] failed`, { userid, code: corpErr.code, message: corpErr.message });
  }

  // Already a company (userCompany='1') WITH a corporate row → nothing to do.
  if (user.userCompany === "1" && corp) {
    redirect(`/admin/customers/${userid}`);
  }

  const customerName = `${user.userName ?? ""} ${user.userLastName ?? ""}`.trim() || "ลูกค้า";
  const statusActive = user.userStatus === "1" ? "ใช้งานอยู่" : user.userStatus === "0" ? "ระงับ" : (user.userStatus ?? "—");

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
            {customerName} · <span className="font-mono">{user.userID}</span>
          </p>
        </div>
        <Link
          href={`/admin/customers/${userid}`}
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
          <Field label="ประเภทปัจจุบัน"   value={user.userCompany === "1" ? "นิติบุคคล (ยังไม่มีข้อมูลบริษัท)" : "บุคคลธรรมดา"} />
          <Field label="สถานะ"            value={statusActive} />
          <Field label="ชื่อ"              value={customerName} />
          <Field label="รหัสสมาชิก"       value={user.userID} mono />
          <Field label="เบอร์"             value={user.userTel ?? "—"} />
          <Field label="อีเมล"             value={user.userEmail ?? "—"} />
          <Field label="สมัครเมื่อ"        value={user.userRegistered ? new Date(user.userRegistered).toLocaleDateString("th-TH") : "—"} />
        </dl>
      </section>

      <ConvertToJuristicForm
        userid={user.userID}
        prefilledTaxId={corp?.corporatenumber ?? ""}
        prefilledCompanyName={corp?.corporatename ?? ""}
        prefilledCompanyAddress={corp?.corporateaddress ?? ""}
        hasExistingDraft={!!corp}
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
