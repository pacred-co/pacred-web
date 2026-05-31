import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrgChannelsClient } from "./client";

/**
 * Admin > "ช่องทางองค์กร" — combined editor for the 4 organization
 * contact-channel registries that legacy PCS kept as 4 separate pages
 * (`pcs-admin/organization-{tell,line,wechat,domainname}.php`), each a
 * twin of the already-ported `organization-email.php`.
 *
 * Per AGENTS.md §0d (reachability) + §0a (Pacred Tailwind UI, legacy
 * logic) we combine them into ONE page with a tab per channel rather
 * than 4 sidebar leaves — less nav clutter, same data + same CRUD.
 *
 * Each legacy file is a small CRUD dispatcher: list rows + add + edit
 * (dup-checked on the natural key) + delete. Data fields per legacy:
 *   tell   → tell · nameequipment · numberequipment · note
 *   line   → line · emailline · telline · passline(🔒) · note
 *   wechat → wechat · emailwechat · telwechat · passwechat(🔒) · note
 *   domain → domain · start_date · end_date · pay_date · note
 *
 * Auth — legacy "HR/ITDT/CEO add/edit/delete; everyone views" gate
 * (same as organization-email) maps onto Pacred `super`. All admins view.
 *
 * Rebrand: `PCS Cargo Admin` → `PR Admin`; legacy Thai text verbatim.
 */

export const dynamic = "force-dynamic";

// ── Row shapes (lowercase per supabase/migrations/0081) ──
type TellRow = {
  id: number; date: string | null; dateupdate: string | null;
  tell: string; nameequipment: string; numberequipment: string;
  adminidcreate: string; adminidupdate: string; note: string;
};
type LineRow = {
  id: number; date: string | null; dateupdate: string | null;
  line: string; emailline: string; telline: string; passline: string;
  adminidcreate: string; adminidupdate: string; note: string;
};
type WechatRow = {
  id: number; date: string | null; dateupdate: string | null;
  wechat: string; emailwechat: string; telwechat: string; passwechat: string;
  adminidcreate: string; adminidupdate: string; note: string;
};
type DomainRow = {
  id: number; date: string | null; dateupdate: string | null;
  domain: string; start_date: string | null; end_date: string | null;
  pay_date: string | null; adminidcreate: string; adminidupdate: string; note: string;
};

/** legacy showNotNULLDateTime — Thai datetime or "-" when empty. */
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "-";
  }
}
/** date-only fields (start_date / end_date / pay_date). */
function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleDateString("th-TH", { dateStyle: "short" });
  } catch {
    return "-";
  }
}
/** keep an ISO date as "YYYY-MM-DD" for <input type="date"> defaults. */
function toInputDate(s: string | null | undefined): string {
  if (!s) return "";
  // Postgres `date` comes back as "YYYY-MM-DD"; a timestamp as ISO.
  return s.length >= 10 ? s.slice(0, 10) : "";
}

export default async function OrgChannelsPage() {
  const { roles } = await requireAdmin();
  const canMutate = roles.includes("super"); // = HR/ITDT/CEO in legacy

  const admin = createAdminClient();

  const [tellRes, lineRes, wechatRes, domainRes] = await Promise.all([
    admin
      .from("tb_organization_tell")
      .select("id, date, dateupdate, tell, nameequipment, numberequipment, adminidcreate, adminidupdate, note")
      .order("date", { ascending: false })
      .returns<TellRow[]>(),
    admin
      .from("tb_organization_line")
      .select("id, date, dateupdate, line, emailline, telline, passline, adminidcreate, adminidupdate, note")
      .order("date", { ascending: false })
      .returns<LineRow[]>(),
    admin
      .from("tb_organization_wechat")
      .select("id, date, dateupdate, wechat, emailwechat, telwechat, passwechat, adminidcreate, adminidupdate, note")
      .order("date", { ascending: false })
      .returns<WechatRow[]>(),
    admin
      .from("tb_organization_domainname")
      .select("id, date, dateupdate, domain, start_date, end_date, pay_date, adminidcreate, adminidupdate, note")
      .order("date", { ascending: false })
      .returns<DomainRow[]>(),
  ]);

  if (tellRes.error)   console.error(`[tb_organization_tell list] failed`,   { code: tellRes.error.code, message: tellRes.error.message });
  if (lineRes.error)   console.error(`[tb_organization_line list] failed`,   { code: lineRes.error.code, message: lineRes.error.message });
  if (wechatRes.error) console.error(`[tb_organization_wechat list] failed`, { code: wechatRes.error.code, message: wechatRes.error.message });
  if (domainRes.error) console.error(`[tb_organization_domainname list] failed`, { code: domainRes.error.code, message: domainRes.error.message });

  const tellRows = (tellRes.data ?? []).map((r) => ({
    id: r.id,
    date: fmtDateTime(r.date),
    dateupdate: fmtDateTime(r.dateupdate),
    tell: r.tell,
    nameequipment: r.nameequipment,
    numberequipment: r.numberequipment,
    adminidcreate: r.adminidcreate,
    adminidupdate: r.adminidupdate,
    note: r.note,
  }));

  const lineRows = (lineRes.data ?? []).map((r) => ({
    id: r.id,
    date: fmtDateTime(r.date),
    dateupdate: fmtDateTime(r.dateupdate),
    line: r.line,
    emailline: r.emailline,
    telline: r.telline,
    passline: r.passline,
    adminidcreate: r.adminidcreate,
    adminidupdate: r.adminidupdate,
    note: r.note,
  }));

  const wechatRows = (wechatRes.data ?? []).map((r) => ({
    id: r.id,
    date: fmtDateTime(r.date),
    dateupdate: fmtDateTime(r.dateupdate),
    wechat: r.wechat,
    emailwechat: r.emailwechat,
    telwechat: r.telwechat,
    passwechat: r.passwechat,
    adminidcreate: r.adminidcreate,
    adminidupdate: r.adminidupdate,
    note: r.note,
  }));

  const domainRows = (domainRes.data ?? []).map((r) => ({
    id: r.id,
    date: fmtDateTime(r.date),
    dateupdate: fmtDateTime(r.dateupdate),
    domain: r.domain,
    start_date: fmtDate(r.start_date),
    end_date: fmtDate(r.end_date),
    pay_date: fmtDate(r.pay_date),
    start_date_input: toInputDate(r.start_date),
    end_date_input: toInputDate(r.end_date),
    adminidcreate: r.adminidcreate,
    adminidupdate: r.adminidupdate,
    note: r.note,
  }));

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />

      <title>ช่องทางองค์กร | PR Admin</title>

      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* breadcrumb */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top ">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb ">
                    <li className="breadcrumb-item">
                      <Link href="/admin">
                        <span className="menu-home">หน้าแรก</span>
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">ช่องทางองค์กร</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body body-new">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="text-center text-md-left mb-3">
                          <h2 className="text-color-main">ช่องทางองค์กร</h2>
                          <p className="text-muted" style={{ margin: 0 }}>
                            จัดการเบอร์โทร · ไลน์ · WeChat · โดเมนเนม ขององค์กร (CEO/HR/IT เพิ่ม ลบ แก้ไขได้)
                          </p>
                        </div>

                        <OrgChannelsClient
                          canMutate={canMutate}
                          tellRows={tellRows}
                          lineRows={lineRows}
                          wechatRows={wechatRows}
                          domainRows={domainRows}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
