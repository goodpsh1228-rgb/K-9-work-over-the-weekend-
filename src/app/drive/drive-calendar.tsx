"use client";
// ─────────────────────────────────────────────────────────────
// 운전 달력 (/drive) — 한 달씩 보여 주고, 옆으로 밀거나 ‹ › 를 눌러 달을 넘깁니다.
//   - 날짜 칸마다 그날 운전하는 사람 이름. 사람별로 다른 연한 색(같은 사람은 항상 같은 색)
//   - 운전병들의 휴가도 같이 보여 줍니다: 회색 칸 "휴 이름" = 실제 휴가, 점선 = 휴가 계획 (운전을 서로 겹치지 않게 지정하려는 용도)
//   - 하루에 여러 명이면 두 명까지 쌓아서 보이고, 더 있으면 "+n"
//   - 필요한 달의 기록을 미리 모두 받아 두므로 넘겨도 페이지가 새로고침되지 않습니다.
//   - 스와이프: 왼쪽으로 밀면 다음 달, 오른쪽으로 밀면 이전 달 (세로 스크롤은 그대로)
// "use client": 달을 바꾸고 터치를 읽으려면 브라우저에서 동작해야 합니다.
// ─────────────────────────────────────────────────────────────
import { useRef, useState } from "react";
import { HOLIDAYS } from "@/lib/holidays";
import { weekday } from "@/lib/kst";
import { monthGrid, shiftMonth } from "@/lib/leave";

export type CalDuty = { id: number; member_id: number; start_date: string; end_date: string };
export type CalLeave = CalDuty & { planned: boolean };

// 사람별 색 (번호를 돌려 가며 배정)
const TONES = [
  "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100",
  "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  "bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-100",
  "bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100",
  "bg-cyan-100 text-cyan-900 dark:bg-cyan-950 dark:text-cyan-100",
];

export function DriveCalendar({
  duties,
  leaves,
  names,
  toneOrder,
  today,
  minMonth,
  maxMonth,
}: {
  duties: CalDuty[];
  leaves: CalLeave[]; // 운전병들의 휴가 (실제 + 계획)
  names: Record<number, string>; // 인원 번호 → 이름
  toneOrder: number[]; // 색 배정 순서(운전병 번호들)
  today: string;
  minMonth: string; // 넘겨 볼 수 있는 가장 이른 달 (YYYY-MM)
  maxMonth: string; // 가장 늦은 달
}) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const touch = useRef<{ x: number; y: number } | null>(null);
  const tone = (id: number) => TONES[Math.max(0, toneOrder.indexOf(id)) % TONES.length];
  const onDay = (d: string) => duties.filter((r) => r.start_date <= d && d <= r.end_date);
  const leaveOn = (d: string) => leaves.filter((r) => r.start_date <= d && d <= r.end_date);
  const canPrev = month > minMonth;
  const canNext = month < maxMonth;
  const go = (n: number) => setMonth((cur) => (n < 0 ? (cur > minMonth ? shiftMonth(cur, -1) : cur) : cur < maxMonth ? shiftMonth(cur, 1) : cur));
  const [y, m] = month.split("-").map(Number);

  return (
    <section
      className="rounded-[18px] border border-hairline bg-card p-3 select-none"
      style={{ touchAction: "pan-y" }}
      onTouchStart={(e) => {
        touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x;
        const dy = e.changedTouches[0].clientY - s.y;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1); // 왼쪽으로 밀기 = 다음 달
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} disabled={!canPrev} className="px-3 py-1 text-xl text-link disabled:opacity-30" aria-label="이전 달">
          ‹
        </button>
        <p className="font-semibold" data-drive-month={month}>
          {y}년 {m}월
        </p>
        <button type="button" onClick={() => go(1)} disabled={!canNext} className="px-3 py-1 text-xl text-link disabled:opacity-30" aria-label="다음 달">
          ›
        </button>
      </div>
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
            const off = leaveOn(d);
            return (
              <div key={d} data-drive-day={d} className={`min-h-14 px-0.5 py-1 ${d === today ? "rounded-md bg-blue-50 dark:bg-blue-950/60" : ""}`}>
                <p className={`text-center text-xs ${weekday(d) === 0 || HOLIDAYS[d] ? "text-red-500" : weekday(d) === 6 ? "text-link" : ""} ${d === today ? "font-semibold" : ""}`}>{Number(d.slice(8))}</p>
                {who.slice(0, 2).map((r) => (
                  <p key={r.id} className={`mt-0.5 truncate rounded px-0.5 text-center text-[10px] leading-4 font-semibold ${tone(r.member_id)}`}>
                    {names[r.member_id] ?? "?"}
                  </p>
                ))}
                {who.length > 2 && <p className="text-center text-[10px] text-muted">+{who.length - 2}</p>}
                {off.slice(0, 2).map((r) => (
                  <p
                    key={`l${r.id}`}
                    className={`mt-0.5 truncate rounded px-0.5 text-center text-[10px] leading-4 ${r.planned ? "border border-dashed border-zinc-400 text-zinc-500" : "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"}`}
                  >
                    휴 {names[r.member_id] ?? "?"}
                  </p>
                ))}
                {off.length > 2 && <p className="text-center text-[10px] text-muted">휴+{off.length - 2}</p>}
              </div>
            );
          })}
        </div>
      ))}
      <p className="mt-2 text-center text-[11px] text-muted">옆으로 밀거나 ‹ › 를 눌러 달을 넘겨 보세요</p>
      <p className="mt-1 text-center text-[11px] text-muted">색 칸 = 운전 지정 · 회색 &quot;휴&quot; = 운전병 휴가 (점선은 휴가 계획)</p>
    </section>
  );
}
