import type { CalcResult } from "@/types/booking";

interface ResultBoxProps {
  result: CalcResult;
}

export function ResultBox({ result }: ResultBoxProps) {
  const hasAmount = result.amount > 0;

  return (
    <div className="mt-6 rounded-xl border border-gray-200 overflow-hidden animate-[pfIn_0.2s_ease]">
      <div className="px-5 py-5 bg-gray-50 border-b border-gray-200">
        <div className="flex items-baseline gap-2 mb-1">
          {hasAmount && (
            <>
              <span className="text-[36px] font-black text-red-600 tracking-tight leading-none">
                {result.amount.toLocaleString('th-TH')}
              </span>
              <span className="text-base font-bold text-gray-800">{result.currency}</span>
            </>
          )}
        </div>
        <p className="text-[13px] font-semibold text-gray-500">{result.label}</p>
      </div>

      {(result.rows.length > 0 || result.note) && (
        <div className="px-5 py-5 bg-white">
          {result.rows.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              {result.rows.map((row, i) => (
                <div key={i}>
                  <span className="block text-[12px] font-semibold text-gray-400 mb-1">{row.label}</span>
                  <strong className="block text-sm font-bold text-gray-800">{row.value}</strong>
                </div>
              ))}
            </div>
          )}
          {result.note && (
            <p className="text-[13px] text-gray-500 leading-relaxed border-t border-dashed border-gray-200 pt-4">
              {result.note}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
