// ─────────────────────────────────────────────────────────────
// 운전 달력 (/drive) — 이번 달과 다음 달, 날짜 칸마다 그날 운전하는 사람 이름을 보여 줍니다.
//   - 사람마다 다른 연한 색(같은 사람은 항상 같은 색)이라 한눈에 구분됩니다.
//   - 하루에 여러 명이면 두 명까지 쌓아서 보이고, 더 있으면 "+n".
//   - 서버에서 그려서 보내므로 브라우저 동작(use client)이 필요 없습니다.
// ─────────────────────────────────────────────────────────────
import { HOLIDAYS } from "@/lib/holidays";
import { weekday } from "@/lib/kst";
import { monthGrid } from "@/lib/leave";
import type { DriveDuty } from "@/lib/drivers";

// 사람별 색 (번호를 돌려 가며 배정)
const TONES = [
  "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-100",
];

export function DriveCalendar({ months, duties, nameOf, toneOrder, today }: { months: string[]; duties: DriveDuty[]; nameOf: (id: number) => string; toneOrder: number[]; today: string }) {
  const tone = (id: number) => TONES[Math.max(0, toneOrder.indexOf(id)) % TONES.length];
  const onDay = (d: string) => duties.filter((r) => r.start_date <= d && d <= r.end_date);
  return (
    <div className="space-y-4">
      {months.map((month) => {
        const [y, m] = month.split("-").map(Number);
        return (
          <section key={month} className="rounded-[18px] border border-hairline bg-card p-3">
            <p className="mb-2 text-center font-semibold" data-drive-month={month}>
              {y}년 {m}월
            </p>
            <div className="grid grid-cols-7 text-center text-xs text-muted">
              {"일월화수목금토".split("").map((w, i) => (
                <span key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-link" : ""}>
                  {w}
                </span>
              ))}
            </div>
            {monthGrid(month).map((week, wi) => (
              <div key={wi} className="grid grid-cols-7 border-t border-hairline">
                {week.map((d, di) => {
                  if (d === null) return <span key={di} />;
                  const who = onDay(d);
                  return (
                    <div key={d} data-drive-day={d} className={`min-h-14 px-0.5 py-1 ${d === today ? "rounded-md bg-blue-50 dark:bg-blue-950/60" : ""}`}>
                      <p className={`text-center text-xs ${weekday(d) === 0 || HOLIDAYS[d] ? "text-red-500" : weekday(d) === 6 ? "text-link" : ""} ${d === today ? "font-semibold" : ""}`}>{Number(d.slice(8))}</p>
                      {who.slice(0, 2).map((r) => (
                        <p key={r.id} className={`mt-0.5 truncate rounded px-0.5 text-center text-[10px] leading-4 font-semibold ${tone(r.member_id)}`}>
                          {nameOf(r.member_id)}
                        </p>
                      ))}
                      {who.length > 2 && <p className="text-center text-[10px] text-muted">+{who.length - 2}</p>}
                    </div>
                  );
                })}
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
