# Single source of truth via a DB trigger — not app-level dual-write (2026-08-05)

**Context.** Staff data lived across **3 tables that drifted**: `profiles` (login/auth
spine + identity), `tb_admin` (legacy HR + the fields the customer-facing sales-rep
card reads), and `admin_contact_extras` (dept/section/employee_type, read by the old
`/admin/admins` page). Editing an employee touched some but not all → the same person
showed different name/phone/department depending on the screen. Owner: *"ไม่งั้นตอนมี
คนใหม่/ลูกค้าใหม่/พาร์ทเนอร์ กระทบหมด ถ้าไม่ได้ดึงจากที่ที่เดียว."*

## The failed first instinct: app-level dual-write
The edit form wrote `profiles` AND `tb_admin` with the same values in one action. This
**drifted the moment a write half-failed**: I hit a real bug where `tb_admin`'s UNIQUE
`adminTel` collision aborted the second write after `profiles` was already changed →
form showed "หมู" while tb_admin still said "moo". Two writes in app code = two ways to
be inconsistent (partial failure, ordering, a caller that forgets one).

## The fix: ONE authoritative table + a DB trigger mirror
- Pick the table the **most consumers already read** as authoritative (here `tb_admin`
  — 89 files + the customer-facing sales card already read it). Making it the source
  aligned everything to what customers already saw; the other table was the outlier.
- A table you **can't drop** (here `profiles` — Supabase Auth/RLS require it) becomes a
  **shadow kept in sync by an `AFTER INSERT OR UPDATE OF <cols>` trigger** on the source
  (`mig 0292 sync_tb_admin_identity_to_profiles`, `security definer`). Write the source
  once → the mirror follows atomically. **Drift becomes structurally impossible** (it's
  one DB transaction, not two app calls).
- Every writer targets the source only; readers may read either (they're equal).

## Rules that generalize
1. **Never app-dual-write two tables to "keep them equal."** If they must agree, make
   one authoritative and mirror the other with a trigger (or a view). Two writes = drift.
2. **Write the fragile/uniquely-constrained table FIRST** if you must do app writes —
   so a constraint failure aborts before you've changed anything else. (The interim fix
   before the trigger.)
3. **Authoritative = whoever the most/most-important consumers already read**, not
   whichever is "newer." Aligning to the existing majority read shrinks the blast radius.
4. **One-time reconcile ≠ overwrite.** When seeding the source, only copy INTO it from
   the shadow for rows where the source is genuinely emptier (here: only 2 profiles-first
   rows moo/sunta); never bulk-copy a sparse shadow over a rich source (would wipe the 18
   established staff's real phones).
5. A trigger mirror also lets you **retire a page gradually**: point new UI at the source,
   redirect the old page, leave the shadow's extra columns as supplementary — no big-bang
   reader sweep (we redirected `/admin/admins` → `/admin/hr/staff` this way).

Cross-link: [[fix-root-prevent-whole-class]] (fix the write boundary, not each symptom).
See memory `hr-org-build-2026-08-03`.
EOF
