# Big audit 2026-06-01 — shared agent context

**Goal (owner):** เจาะ tb_* ทั้งหมดใน Supabase → ดูว่าเก็บอะไร/หัวข้ออะไร → เทียบ legacy หา gap (member+admin)
→ วิเคราะห์ → วางแผน upgrade ใหญ่ระยะยาว · ปลดล๊อคทุกอย่าง · ดึงศักยภาพสูงสุดของทุก tool/platform.

## Data sources
- **Supabase prod** `yzljakczhwrpbxflnmco`. Query via REST + service-role key from `.env.local`
  (`SUPABASE_SERVICE_ROLE_KEY`). Native `curl`/`fetch` only (supabase-js fails on Node 20).
  - rows: `curl -s -H "apikey: $SRK" -H "Authorization: Bearer $SRK" "$URL/rest/v1/<table>?select=*&limit=3"`
  - count: add header `-H "Prefer: count=exact" -I` → read `content-range: */<N>`
  - 263 tables total: 116 `tb_*` (legacy real data) + 147 rebuilt/new.
- **Legacy PHP source:** `/Users/dev/Desktop/pcs-realshit/REALSHITDATAPCS/pcsc/public_html/`
  - `member/pcs-admin/*.php` (180 files = ADMIN — complete, compare thoroughly)
  - `member/include/function.php` + `member/pcs-admin/include/` (helpers + business logic)
  - member CUSTOMER-side .php is PARTIAL in this extract — infer member features from
    `member/include/`, the Pacred `app/[locale]/(protected)/*` pages, and prior audits.
- **Pacred current code:** `app/[locale]/(protected)/*` (member) · `app/[locale]/(admin)/admin/*` (admin)
  · `actions/*` · `lib/*`.
- **Prior audits to BUILD ON (do NOT redo):**
  - `docs/research/legacy-resweep-2026-05-31/_MASTER-FRESH.md` (verified gap status — most "23 P0" were stale)
  - `docs/research/legacy-gap-2026-05-30/_MASTER.md` + per-lane docs (14-lane audit)

## Casing landmine
`tb_users` / `tb_admin` / `tb_co` columns are **camelCase** on prod (`userID`, `adminID`, `adminIDSale`,
`userCompany`). ALL OTHER `tb_*` = lowercase columns.

## Per-cluster deliverable (write to docs/research/big-audit-2026-06-01/<cluster>.md, ≤2000 lines)
For your assigned cluster:
1. **DATA INVENTORY** — each `tb_*` table: purpose · key columns (the "หัวข้อ" it stores) · row count (query prod).
2. **REBUILT TWIN** — the non-`tb_` equivalent (if any) · which is canonical/live vs dead-write (cross-ref prior audits).
3. **LEGACY GAPS** — features in legacy (member + admin PHP) that Pacred LACKS or only partially has. Cite the legacy file. Build on prior audits; add NEW finds.
4. **MAX-POTENTIAL UPGRADES** — concrete opportunities to leverage this data + connected tools/platforms
   for maximum value (the owner's "ดึงศักยภาพสูงสุด"). Long-term ideas welcome, tagged by effort (S/M/L) + value (P0/P1/P2).

Return to the orchestrator a SHORT (≤12 line) summary: top 3 gaps + top 3 upgrade opportunities + your doc path.
Do NOT paste the full doc back. Do NOT edit code or git-commit — analysis only.
