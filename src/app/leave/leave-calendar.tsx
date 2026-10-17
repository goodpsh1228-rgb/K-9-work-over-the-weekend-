"use client";
// ─────────────────────────────────────────────────────────────
// 휴가 달력 (달 이동이 페이지 새로고침 없이 바로 바뀌도록 브라우저에서 동작)
//   - 휴가 종류별 색 칩 (실제 휴가=채움, 계획=같은 색 점선), 외출·면회 포함
//   - 모든 기록을 한 번에 받아 두고 달만 바꿔 그립니다 → ‹ › 를 눌러도 스크롤·펼침 상태가 그대로
// ─────────────────────────────────────────────────────────────
import { HOLIDAYS } from "@/lib/holidays";
import { weekday } from "@/lib/kst";
import { LEAVE_COLOR, LEAVE_KINDS, LEAVE_LABEL, LEAVE_PLAN_COLOR, monthGrid, shiftMonth } from "@/lib/leave";

export type CalLeave = { id: number; kind: string; start_date: string; end_date: string; planned: boolean };

export function LeaveCalendar({ leaves, month, setMonth, today, planSupported }: { leaves: CalLeave[]; month: string; setMonth: (m: string) => void; today: string; planSupported: boolean }) {
  const grid = monthGrid(month);
  const [y, m] = month.split("-").map(Number);
  const onDay = (d: string) => leaves.filter((l) => l.start_date <= d && d <= l.end_date);

  return (
    <section className="mt-4 rounded-[18px] border border-hairline bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-1 text-xl text-link" aria-label="이전 달">
          ‹
        </button>
        <p className="font-semibold" data-cal-month={month}>
          {y}년 {m}월
        </p>
        <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-1 text-xl text-link" aria-label="다음 달">
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-zinc-500">
        {"일월화수목금토".split("").map((w, i) => (
          <span key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-link" : ""}>
            {w}
          </span>
        ))}
      </div>
      {grid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-t border-hairline">
          {week.map((d, di) =>
            d === null ? (
              <span key={di} />
            ) : (
              <div key={d} className={`min-h-14 px-0.5 py-1 ${d === today ? "rounded-md bg-blue-50 dark:bg-blue-950" : ""}`}>
                <p className={`text-center text-xs ${weekday(d) === 0 || HOLIDAYS[d] ? "text-red-500" : weekday(d) === 6 ? "text-link" : ""} ${d === today ? "font-semibold" : ""}`}>
                  {Number(d.slice(8))}
                </p>
                {onDay(d)
                  .slice(0, 2)
                  .map((l) => (
                    <p
                      key={l.id}
                      className={`mt-0.5 truncate rounded px-0.5 text-center text-[10px] leading-4 ${
                        l.planned ? `border border-dashed ${LEAVE_PLAN_COLOR[l.kind]}` : `text-white ${LEAVE_COLOR[l.kind]}`
                      }`}
                    >
                      {LEAVE_LABEL[l.kind]}
                    </p>
                  ))}
              </div>
            ),
          )}
        </div>
      ))}
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-zinc-500">
        {LEAVE_KINDS.map((k) => (
          <span key={k.value} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${k.color}`} />
            {k.label}
          </span>
        ))}
        {planSupported && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2.5 w-3 rounded-sm border border-dashed border-foreground/60" />
            계획(점선)
          </span>
        )}
      </div>
    </section>
  );
}
