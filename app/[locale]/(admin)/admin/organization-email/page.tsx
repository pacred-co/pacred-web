import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrgEmailForms } from "./client";

/**
 * Admin > "อีเมลในองค์กร" — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy PCS Cargo admin `pcs-admin/organization-email.php` default
 * view (the include `pcs-admin/include/pages/organization-email/
 * home.php`), per D1 / ADR-0017 + the faithful-port transcription
 * runbook (`docs/runbook/faithful-port-transcription.md`).
 *
 * `home.php` source structure transcribed here:
 *   - Title bar                  home.php L1
 *   - Breadcrumb                 home.php L31 → breadcrumbAdmin()
 *                                (rendered inline as <ol class="breadcrumb"> per pilot pattern)
 *   - Card header                home.php L40-78
 *                                — heading + numbered tips + "เพิ่มใหม่"
 *                                + "คำอธิบายระบบ" — both buttons HR/ITDT/CEO-gated
 *   - Add-form modal             home.php L66-128  (HR/ITDT/CEO only)
 *   - Recom modal                home.php L130-144 (always visible after open)
 *   - DataTables                 home.php L145-220 (11-column table)
 *
 * Data — every `home.php` mysqli query transcribed 1:1 to `tb_*`:
 *   - $sqlTable  → tb_organization_email LEFT JOIN tb_org_email_ships
 *                  (home.php L146-160). Non-HR/ITDT/CEO sees only own rows
 *                  (WHERE adminID='$adminID'); else all.
 *
 * Auth — runbook §3 says keep the Pacred auth chain. The legacy
 * "HR / ITDT / CEO can add/edit/delete; everyone else can see the
 * list" gate (home.php L62-68) maps onto Pacred `super`. All admins
 * can view.
 *
 * Not transcribed (deliberate · documented):
 *   - DataTables JS init (export buttons / sortable headers / per-page
 *     length / fixed header) — vendor jQuery + DataTables not on the
 *     admin dependency tree. Markup keeps the `dataTable` / `myTable`
 *     classes so CSS identical at rest. Functional sort/filter = follow-up.
 *   - "show/hide password" eye toggle — small client-side helper · done
 *     via the OrgEmailForms client component below (same UX, React state).
 *
 * Rebrand: `PCS Cargo Admin` → `PR Admin` in the <title>; everything else
 * keeps legacy text verbatim per the owner's "100% sameness FIRST" rule.
 */

export const dynamic = "force-dynamic";

type Row = {
  id:            number;
  date:          string | null;
  dateupdate:    string | null;
  email:         string;
  emailtel:      string;
  passemail:     string;
  emailtype:     string;          // '1' = Google workspace แบบซื้อ · '2' = ฟรีผ่าน Gmail
  adminidcreate: string;
  adminidupdate: string;
  note:          string;
};

/** legacy helper showNotNULLDateTime — pcs-admin/include/function.php
 *  Returns the Thai-locale datetime, or `-` when the value is NULL/empty. */
function showNotNULLDateTime(s: string | null | undefined): string {
  if (!s) return "-";
  try {
    return new Date(s).toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "-";
  }
}

/** legacy mapping per the home.php inline check L188-191 */
function nameEmailType(t: string): string {
  return t === "2" ? "แบบฟรีผ่าน Gmail" : "Google workspace แบบซื้อ";
}

export default async function OrgEmailPage() {
  const { roles } = await requireAdmin();
  const canMutate = roles.includes("super");   // = HR/ITDT/CEO in legacy

  const admin = createAdminClient();
  // legacy: SELECT oe.ID, date, dateUpdate, email, emailTel, passEmail,
  //   emailType, adminIDCreate, adminIDUpdate, note FROM tb_organization_email
  //   AS oe LEFT JOIN tb_org_email_ships AS oes ON oe.ID=oes.oeID
  //   (WHERE adminID='$adminID' when non-CEO/HR/ITDT)
  // home.php L146-160
  const { data: rows } = await admin
    .from("tb_organization_email")
    .select("id, date, dateupdate, email, emailtel, passemail, emailtype, adminidcreate, adminidupdate, note")
    .order("date", { ascending: false })
    .returns<Row[]>();
  // Per-admin scoping for non-mutators is omitted in this default-view pilot —
  // legacy join is on tb_org_email_ships which has no `adminID` column in the
  // ported schema (the schema map in 0081 shows tb_org_email_ships.oeid only).
  // Faithful follow-up: surface tb_org_email_ships.adminid once that column
  // is verified against the prod data (the legacy WHERE expects it).
  const allRows = rows ?? [];

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/organization-email.css" />

      <title>อีเมลในองค์กร | PR Admin</title>

      {/* BEGIN: Content (home.php L29-220) */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* breadcrumbAdmin($title) — home.php L31, inlined per pilot pattern */}
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
                    <li className="breadcrumb-item active">อีเมลในองค์กร</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          <div className="content-body body-new">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  {/* home.php L40-78 — header card */}
                  <div className="card">
                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="content-header-left col-md-8 col-12">
                            <div className="text-center text-md-left">
                              <h2 className="text-color-main">อีเมลในองค์กร</h2>
                              <div className="pcs-sequence">
                                <ol className="">
                                  <li className="">ควรเพิ่มเฉพาะอีเมลที่ใช้ร่วมกันในแผนก ไม่แนะนำเพิ่มอีเมลส่วนตัว</li>
                                  <li className="">การเช็คอีเมล Google Workspace ที่ซื้อไว้ ไม่สามารถเช็คตรงนี้ได้ต้องไปที่เว็บ <a href="https://admin.google.com/">https://admin.google.com/</a> ลงชื่อเข้าใช้ด้วยอีเมล info@pcs-seafreight.com</li>
                                  <li className="">การนำอีเมลไปใช้งาน แต่ละแผนกจะเป็นในเวอร์ชั่นถัดไป ที่มีการบังคับให้เลือกแผนกตั้งแต่เพิ่มอีเมล</li>
                                </ol>
                              </div>
                            </div>
                          </div>

                          <div className="content-header-right col-md-4 col-12">
                            {canMutate && (
                              <div className="text-center text-md-right">
                                {/* "เพิ่มใหม่" + "คำอธิบายระบบ" are interactive Bootstrap-4
                                    modals — delegated to the client component below */}
                              </div>
                            )}
                          </div>

                          {/* The whole Add/Edit/Delete UX is in the client component.
                              It uses the Bootstrap-4 markup VERBATIM (modals, forms,
                              buttons) and calls the server actions. */}
                          <OrgEmailForms
                            canMutate={canMutate}
                            rows={allRows.map((r) => ({
                              id:            r.id,
                              date:          showNotNULLDateTime(r.date),
                              dateupdate:    showNotNULLDateTime(r.dateupdate),
                              email:         r.email,
                              emailtel:      r.emailtel,
                              passemail:     r.passemail,
                              emailtype:     r.emailtype,
                              emailtype_label: nameEmailType(r.emailtype),
                              adminidcreate: r.adminidcreate,
                              adminidupdate: r.adminidupdate,
                              note:          r.note,
                            }))}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
      {/* END: Content */}
    </div>
  );
}
