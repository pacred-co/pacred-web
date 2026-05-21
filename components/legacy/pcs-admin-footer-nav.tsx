/**
 * Legacy PCS Cargo ADMIN footer + section-conditional mobile bottom-nav —
 * 1:1 transcription of `pcs-admin/include/all-script.php` L1-107.
 *
 * The legacy footer is plain (just the copyright + sidenav-overlay /
 * drag-target divs the theme JS needs). The mobile bottom-nav appears ONLY
 * for the Driver and Warehouse sections of the admin team (not CEO / Manager
 * / etc.). RBAC-section gating is a polish item; for now we render the plain
 * footer + nothing extra.
 */
export function PcsAdminFooterNav() {
  const year = new Date().getFullYear();
  return (
    <>
      <div className="sidenav-overlay"></div>
      <div className="drag-target"></div>
      {/* Legacy `pcs-admin/include/all-script.php` had a "Copyright PCS Cargo"
          footer here. Owner directive (2026-05-21): admin back-office NEVER
          shows a footer — removed. */}
      {void year}
      {/*
        TODO(rbac-bottom-nav): the legacy `nav-footer-pcs` mobile bottom-nav
        renders different links for sectionKey='Driver' vs 'Warehouse' vs
        'Managerwarehouse' (all-script.php L11-105). All non-driver/warehouse
        sections (CEO / Manager / QA / Accounting / Marketing / Sales) get NO
        bottom-nav — only the standard footer above. Render the right one once
        the RBAC role/section is wired.
      */}
    </>
  );
}
