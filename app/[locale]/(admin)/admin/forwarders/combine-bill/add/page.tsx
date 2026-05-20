import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { CombineBillAddForm } from "./add-form";

/**
 * Admin > "เพิ่มรายการรวมบิล" — a FAITHFUL 1:1 TRANSCRIPTION of the
 * legacy `forwarder-bill.php?page=add` branch (L393-541), per D1 /
 * ADR-0017 + the faithful-port transcription runbook §8.
 *
 * The legacy `?page=add` sub-route renders ONE simple form: a single
 * text input accepting a comma-separated list of `tb_forwarder.id`
 * values + a submit button. POSTing the form to the same URL with the
 * `add` button name fires the L6-45 INSERT handler (now ported as
 * `adminCreateCombineBill` in actions/admin/combine-bill.ts).
 *
 * Source structure transcribed:
 *   - Title bar       forwarder-bill.php L395
 *   - Breadcrumb      forwarder-bill.php L455-465
 *   - Content body    forwarder-bill.php L466-495 (single full-height
 *                     card with the centered form)
 *
 * Auth — the legacy gate is implicit through the `forwarder-bill/add`
 * link visibility: only `CEO / Manager / QAAndQC / Accounting / ITDT`
 * see the "สร้างบิลรวม" CTA that lands here. Pacred V3 uses the same
 * role union the list page uses for `canMutate`. requireAdmin redirects
 * non-admins to /login + 404s non-mutating admins.
 *
 * The interactive form (controlled input + submit handler) lives in
 * `add-form.tsx`; this Server Component supplies the page chrome.
 */

export const dynamic = "force-dynamic";

export default async function CombineBillAddPage() {
  // Legacy mutation gate — mirrors `canMutate` on the list page +
  // the legacy departmentKey gate at forwarder-bill.php L94.
  await requireAdmin(["super", "ops", "warehouse", "accounting"]);

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/combine-bill.css" />

      {/* BEGIN: Content — forwarder-bill.php L449 */}
      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          {/* Breadcrumb — forwarder-bill.php L453-464 */}
          <div className="content-header row">
            <div className="content-header-left col-12 mb-2">
              <div className="row breadcrumbs-top">
                <div className="breadcrumb-wrapper col-12">
                  <ol className="breadcrumb">
                    <li className="breadcrumb-item">
                      <Link href="/admin">หน้าแรก</Link>
                    </li>
                    <li className="breadcrumb-item">
                      <Link href="/admin/forwarders/combine-bill">
                        รายการขนส่งสินค้า
                      </Link>
                    </li>
                    <li className="breadcrumb-item active">เพิ่มรายการ</li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Content body — forwarder-bill.php L466-495 */}
          <div className="content-body">
            <div className="row" style={{ flexWrap: "wrap" }}>
              <div className="col-12">
                <div className="card">
                  <div className="card-body" style={{ height: "75vh" }}>
                    <div className="row">
                      <div className="col-md-6 offset-md-3 pl-2 pr-2">
                        {/* Interactive form (controlled input +
                            adminCreateCombineBill call). */}
                        <CombineBillAddForm />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* END: Content — forwarder-bill.php L496 */}
      <div id="list-forwarder-data"></div>
    </div>
  );
}
