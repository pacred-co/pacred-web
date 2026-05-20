import { Link } from "@/i18n/navigation";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import AdminAddCartForm from "./add-form";

/**
 * Admin > เพิ่มสินค้าในรถเข็น — faithful 1:1 of the legacy custom-add
 * branch of pcs-admin/search.php (?product=custom · L311-430) plus a
 * "เจ้าของรถเข็น" PR<n> input so CS staff can add items into a specific
 * customer's cart in one step.
 *
 * Legacy entry point: from the cart page (cart.php L396-401) the
 * "+ สั่งสินค้าเพิ่ม" button links to `admin/cart/add/`. The legacy
 * `admin/cart/add/` is just the same cart.php with a JS focus-trigger
 * pointing at the URL paste box — there's no dedicated form file. The
 * actual "custom-add" form lives inside search.php (the path the URL paste
 * resolves to). We collapse those two steps into a single dedicated
 * /admin/service-orders/cart/add page since the URL-scrape pipeline isn't
 * ported yet (deferred — TAMIT-cloud scraper API is a separate workstream).
 *
 * Per D1 / ADR-0017: same Bootstrap 4 markup, same labels, same column
 * layout, same `.pcs-legacy` scope. Loads the shared admin chrome CSS
 * verbatim so the form looks identical to the legacy view at rest.
 *
 * Auth gate: same RBAC union the cart page uses (super + ops + sales_admin)
 * — the daily CS purchasing + sales staff who run this surface.
 *
 * Behaviour on success:
 *   - Server Action inserts the tb_cart row + audit-logs the mutation
 *   - Client form shows a green "เพิ่มสินค้าลงในรถเข็นแล้ว" alert
 *   - 1.5s later redirects to the cart page (with ?userID=<customer>
 *     if a customer was specified) so the staff sees the row landed
 */

export const dynamic = "force-dynamic";

type SP = { userid?: string; userID?: string };

export default async function AdminCartAddPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const { user } = await requireAdmin(["super", "ops", "sales_admin"]);
  const sp = await searchParams;

  // Resolve current admin's legacy adminid for the form's fallback
  // (matches the cart page behaviour).
  const admin = createAdminClient();
  let myAdminId = "";
  if (user.email) {
    const { data } = await admin
      .from("tb_admin")
      .select("adminid")
      .eq("adminemail", user.email)
      .maybeSingle<{ adminid: string }>();
    myAdminId = data?.adminid ?? "";
  }

  // Either ?userid= (preferred, matches Pacred convention) or ?userID=
  // (matches the cart-page query-param casing) — accept both.
  const initialUserId = (sp.userid ?? sp.userID ?? "").trim();

  return (
    <div className="pcs-legacy">
      <link rel="stylesheet" href="/legacy/pcs/admin/admin-base.css" />
      <link rel="stylesheet" href="/legacy/pcs/admin/cart.css" />

      <div className="app-content content">
        <div className="content-overlay"></div>
        <div className="content-wrapper">
          <div className="content-body">
            <section>
              <div className="row">
                <div className="col-md-12 col-sm-12">
                  <div className="card border-black">
                    <div className="card-header pb-0">
                      <div className="row">
                        <div className="col-md-6">
                          <div className="text-md-left">
                            <h3>
                              <span className="font-18 mdi mdi-cart-outline"></span>{" "}
                              เพิ่มสินค้าในรถเข็น (กำหนดเอง)
                            </h3>
                          </div>
                        </div>
                        <div className="col-md-6 text-md-right">
                          <Link
                            href={
                              initialUserId
                                ? { pathname: "/admin/service-orders/cart", query: { userID: initialUserId } }
                                : "/admin/service-orders/cart"
                            }
                            className="btn btn-sm btn-outline-secondary"
                          >
                            &larr; กลับสู่รถเข็น
                          </Link>
                        </div>
                      </div>
                    </div>

                    <div className="card-content">
                      <div className="card-body">
                        <div className="row">
                          <div className="col-md-8 offset-md-2">
                            <AdminAddCartForm
                              initialUserId={initialUserId}
                              myAdminId={myAdminId}
                            />
                          </div>
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
    </div>
  );
}
