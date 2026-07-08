# PCS-admin house-style — the faithful-look color language (2026-07-08)

**Context:** owner/ภูม flagged the rebuilt `/admin/accounting/receipts` as "ไม่ใส่สีเหมือน legacy". I had read the legacy PHP (§0b) so the LAYOUT/logic/columns matched — but the PCS admin is very COLORFUL (Bootstrap badges/pills/table headers) and my clean-slate Pacred version came out gray/plain. Reading the PHP gives logic; it does **not** give the color scheme.

**Learning:** for a "หน้าตาเหมือน PCS" faithful-port page, matching the LAYOUT is not enough — you must also match the PCS **color language**. Read the PHP for logic/columns, but capture the colors from the **live PCS render** (browse the site ภูม logged into · Claude-in-Chrome) or a screenshot. The legacy PCS admin uses ONE consistent design language across every list page, so once decoded it is reusable everywhere — apply it as a house style, don't re-decode per page.

## The house style (Tailwind equivalents · established on receipts, commit era 2026-07-08)

| Element | Legacy PCS look | Pacred Tailwind |
|---|---|---|
| **Table header row** | solid orange, white text, sort arrows | `bg-orange-500 text-white` + `[&>thead>tr>th]:border-orange-400/60` |
| **Totals / "รวม" row** | cyan/turquoise band | `bg-cyan-100 text-cyan-900` + `[&>td]:border-cyan-200` |
| **Filter / status tabs** | dashed red-bordered rounded pills + count badge | pill `rounded-2xl border border-dashed px-3 py-1.5`; active `border-red-400 bg-red-50 text-red-700`; inactive `border-red-300 bg-white text-slate-600 hover:bg-red-50/50`; badge `rounded-full bg-red-600 px-1.5 text-[11px] text-white` |
| **Status cell** | colored ● dot + label | `inline-flex items-center gap-1.5 text-{c}-700` + `<span className="h-2 w-2 rounded-full bg-{c}-500"/>` — emerald=สำเร็จ/อนุมัติ · amber=รอ/pending · red=ยกเลิก/ปฏิเสธ · slate=อื่น |
| **Customer-type badge** | นิติ=pink/VIP · บุคคล=gray | นิติ `bg-rose-100 text-rose-700 border-rose-300` · บุคคล `bg-slate-100 text-slate-600 border-slate-300` (rounded-full) |
| **Row action buttons** | green primary / orange secondary rounded | primary/view `rounded-full bg-emerald-500 text-white`; secondary/reference `rounded-full bg-amber-500 text-white`; danger `bg-red-600 text-white` |
| **Table-cell links** (doc no / customer code / slip) | blue | `text-sky-700 hover:underline` |
| **Explainer / คำอธิบายระบบ card** | green header bar + white body | header `bg-emerald-500 text-white`, body `bg-white` |
| **Gridlines** | `table-bordered` (every cell) | `border-collapse [&>thead>tr>th]:border [&>tbody>tr>td]:border [&>tfoot>tr>td]:border` |

Keep the Pacred type floor (§0h · ≥ `text-[11px]`) + wide tables in `overflow-x-auto scrollbar-x-visible`. This is the LOOK layer only — status/amount **semantics** stay Pacred-native (do NOT copy legacy status codes; see the receipts rstatus trap in [[audit-discipline]]).

**Cross-links:** `docs/research/import-flow-pcs-fidelity-punchlist-2026-07-08-followups.md` · AGENTS §0a (faithful workflow, Pacred design) · §0h (type floor).
