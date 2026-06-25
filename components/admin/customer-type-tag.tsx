/**
 * <CustomerTypeTag> — the at-a-glance customer pills: บุคคล/นิติ + เงินสด/เครดิต.
 *
 * owner 2026-06-25 (CUSTTAG): the customer-360 header showed these (legacy-view.tsx);
 * this extracts them as ONE reusable pure component so the SAME tag rolls out to every
 * รายการ (lists) — staff + customer see type + payment terms at a glance (§0g
 * self-explaining). No client hooks → safe in server OR client components.
 *
 * Pure presentational. Pass the raw tb_users fields:
 *   - isJuristic  = userCompany === '1'
 *   - creditLimit = userCreditValue (THB)  → >0 ⇒ credit customer, else เงินสด
 *   - creditDays  = userCreditDate (term days)
 *   - creditUsed  = tb_credit.creditvalue (optional · shows used + remaining)
 */

export function CustomerTypeTag({
  isJuristic,
  creditLimit = 0,
  creditDays = 0,
  creditUsed,
  compact = false,
}: {
  isJuristic: boolean;
  creditLimit?: number;
  creditDays?: number;
  creditUsed?: number | null;
  compact?: boolean;
}) {
  const px = compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-xs";
  const isCredit = creditLimit > 0;
  const remaining = creditUsed != null ? Math.max(0, creditLimit - creditUsed) : null;

  return (
    <span className="inline-flex flex-wrap items-center gap-1 align-middle">
      <span
        className={`rounded-full border font-medium ${px} ${
          isJuristic
            ? "bg-indigo-50 text-indigo-700 border-indigo-200"
            : "bg-slate-100 text-slate-600 border-slate-200"
        }`}
      >
        {isJuristic ? "นิติบุคคล" : "บุคคล"}
      </span>
      {isCredit ? (
        <span
          className={`rounded-full border border-amber-300 bg-amber-50 font-medium text-amber-800 ${px}`}
          title={
            `ลูกค้าเครดิต · เทอม ${creditDays} วัน · วงเงิน ฿${creditLimit.toLocaleString("th-TH", { minimumFractionDigits: 2 })}` +
            (creditUsed != null
              ? ` · ใช้ไป ฿${creditUsed.toLocaleString("th-TH", { minimumFractionDigits: 2 })} · คงเหลือ ฿${(remaining ?? 0).toLocaleString("th-TH", { minimumFractionDigits: 2 })}`
              : "") +
            ` · ถ้ายอดเกินวงเงินต้องโอนเพิ่ม/ติดต่อ CS-Sale ขอเพิ่มวงหรือจ่ายส่วนเกิน`
          }
        >
          💳 เครดิต {creditDays}ว · ฿{creditLimit.toLocaleString("th-TH", { maximumFractionDigits: 0 })}
          {remaining != null ? ` (เหลือ ฿${remaining.toLocaleString("th-TH", { maximumFractionDigits: 0 })})` : ""}
        </span>
      ) : (
        <span
          className={`rounded-full border border-emerald-200 bg-emerald-50 font-medium text-emerald-700 ${px}`}
        >
          💵 เงินสด
        </span>
      )}
    </span>
  );
}
