/**
 * <CustomsHsCheckPanel> — read-only HS-screening for the ใบขนพ่วง (#17).
 *
 * For each line's HS code, surface what it "ติด": อากรปกติ (default_duty_pct>0),
 * Form-E (form_e_duty_pct present → ต้องขอ C/O ACFTA), ของควบคุม/ license
 * (hs_note / other_forms intelligence), or ยังไม่มีพิกัด. It NEVER blocks — Docs
 * uses it as a checklist before sending the draft (mirrors the existing
 * "⚠️ ยังไม่มีพิกัด HS" panel + the Form-E badge).
 *
 * Server-fed (the page does the hs_codes lookup with the admin client). Pure
 * presentation — no mutation, no money.
 */

export type HsCheckLine = {
  position:    number;
  description: string | null;
  hsCode:      string | null;
  defaultDutyPct: number | null;
  formEDutyPct:   number | null;
  hsNote:         string | null;
  hasOtherForms:  boolean;
  inDictionary:   boolean;
};

export function CustomsHsCheckPanel({ lines }: { lines: HsCheckLine[] }) {
  const missing = lines.filter((l) => !l.hsCode?.trim());
  const flagged = lines.filter(
    (l) =>
      l.hsCode?.trim() &&
      ((l.defaultDutyPct ?? 0) > 0 || l.formEDutyPct != null || !!l.hsNote?.trim() || l.hasOtherForms || !l.inDictionary),
  );

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/40 dark:bg-surface p-5 space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="font-bold text-sm">🔎 ตรวจพิกัด HS (ติดอะไรไหม)</h2>
        <span className="text-[11px] text-muted">
          {lines.length} รายการ · {flagged.length} ต้องดู · {missing.length} ยังไม่มีพิกัด
        </span>
      </div>

      {missing.length > 0 && (
        <p className="rounded-lg border border-amber-300 bg-amber-100/70 px-3 py-2 text-[11px] text-amber-800">
          ⚠️ {missing.length} รายการยังไม่มีพิกัด HS — เติมพิกัดที่ช่อง &quot;แก้ไข&quot; ในตารางสินค้าด้านล่างก่อนยื่นใบขน
        </p>
      )}

      {flagged.length === 0 && missing.length === 0 ? (
        <p className="text-[11px] text-emerald-700">✅ ทุกรายการมีพิกัด · ไม่พบรายการที่ติดอากร / Form-E / ของควบคุม</p>
      ) : flagged.length > 0 ? (
        <div className="overflow-x-auto scrollbar-x-visible">
          <table className="w-full text-xs">
            <thead className="text-left text-[11px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-1.5">#</th>
                <th className="px-2 py-1.5">สินค้า</th>
                <th className="px-2 py-1.5">HS</th>
                <th className="px-2 py-1.5">สิ่งที่ติด</th>
              </tr>
            </thead>
            <tbody>
              {flagged.map((l) => (
                <tr key={l.position} className="border-t border-amber-200/60 align-top">
                  <td className="px-2 py-1.5 text-muted">{l.position}</td>
                  <td className="px-2 py-1.5 max-w-[14rem]">
                    <span className="line-clamp-2">{l.description || "—"}</span>
                  </td>
                  <td className="px-2 py-1.5 font-mono">{l.hsCode?.trim() || "—"}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {!l.inDictionary && (
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700">
                          ไม่อยู่ในคลัง HS (ตรวจเอง)
                        </span>
                      )}
                      {(l.defaultDutyPct ?? 0) > 0 && (
                        <span className="rounded bg-orange-200 px-1.5 py-0.5 text-[10px] font-medium text-orange-800">
                          อากร {l.defaultDutyPct}%
                        </span>
                      )}
                      {l.formEDutyPct != null && (
                        <span className="rounded bg-emerald-200 px-1.5 py-0.5 text-[10px] font-medium text-emerald-800">
                          ✨ Form-E {l.formEDutyPct}% (ต้องขอ C/O)
                        </span>
                      )}
                      {l.hasOtherForms && (
                        <span className="rounded bg-indigo-200 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800">
                          มีฟอร์ม/สิทธิ์อื่น
                        </span>
                      )}
                      {l.hsNote?.trim() && (
                        <span
                          className="rounded bg-rose-200 px-1.5 py-0.5 text-[10px] font-medium text-rose-800"
                          title={l.hsNote}
                        >
                          ⚠️ {l.hsNote.length > 40 ? l.hsNote.slice(0, 40) + "…" : l.hsNote}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <p className="text-[11px] text-muted">
        ตรวจอ้างอิงคลัง HS (อากรปกติ · Form-E · หมายเหตุ/ใบอนุญาต) — เป็นข้อมูลช่วยตรวจ ไม่บล็อกการทำงาน
      </p>
    </section>
  );
}
