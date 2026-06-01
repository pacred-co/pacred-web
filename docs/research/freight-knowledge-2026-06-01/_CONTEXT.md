# Freight knowledge absorb — 2026-06-01 (CEO directive: read it ALL, re-plan scope)

**Source folder:** `/Users/dev/Desktop/olddata dev/data งานเก่า/` (5.9GB · the OLD FREIGHT business knowledge).
**Why:** Pacred's CARGO side (PCS) is ported (legacy PHP + the big-audit). This folder is the FREIGHT side —
**AX / Axelra Thailand / Axelra Global / NNB / TTP / CargoThai / MOMO / JMF(ไอแต้ม)** — the int'l freight +
customs + domestic-trucking business our system does NOT yet cover. CEO: absorb it 100% first, then expand/improve.

**Relationships (from CEO):** AX (Axelra) = our old company doing ALL freight (import-export). TTP = the CargoThai
partner — used together, closed containers together, fired status APIs to each other; later split. Now Pacred
closes containers with **MOMO** (instead of TTP). **JMF = ไอแต้ม's** place; ไอแต้ม also built the web for PCS.

## Method
- TXT chats (`[LINE]…txt`, `WECHAT…txt` at folder root · ~105 files · 3.5MB · readable Thai) → read directly.
- XLSX → `python3` + `openpyxl` (read_only); dump **sheet names + header row + ~10 sample rows per sheet** — do
  NOT ingest the huge data sheets fully (PCS/PACRED ใบกำกับ are 68-205MB of records — read STRUCTURE only).
- DOCX → `textutil -convert txt -stdout <file>` (macOS, available). PDF → try `python3 -c "import pypdf…"`; if no
  extractor, note the doc's purpose from filename + skip deep-read.
- HTML / .gs (Google Apps Script) / code → read directly.

## Deliverable (write to docs/research/freight-knowledge-2026-06-01/<NN>-<topic>.md · ≤2000 lines)
Decode your cluster into: (1) the BUSINESS MODEL / WORKFLOW it reveals · (2) the DATA model (entities, fields,
statuses, codes) · (3) the SYSTEM / API relationships (AX↔TTP↔CargoThai↔MOMO↔JMF↔PCS) · (4) what Pacred LACKS
to do this (gap vs our current cargo system) · (5) max-potential / how to build it BETTER (the CEO "expand+improve").
Return to the orchestrator a ≤12-line summary: top findings + top gaps + your doc path. Analysis only — no code, no git.
