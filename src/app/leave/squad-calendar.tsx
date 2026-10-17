"use client";
// ─────────────────────────────────────────────────────────────
// 같은 반 휴가 달력 — 반 사람들(나 포함)의 휴가가 달력에서 어떻게 겹치는지 보여 줍니다.
//   - 날짜 칸마다 그날 휴가 인원 수: 1명=연한 파랑, 2명 이상=주황(겹침). 휴가 희망(계획)도 같이 셉니다.
//   - ‹ › 로 달을 넘기면 아래 명단도 그 달에 휴가가 걸친 사람들로 같이 바뀝니다.
//   - 날짜를 누르면 그날 휴가인 사람만 명단에 보이고, 한 번 더 누르면 달 전체로 돌아갑니다.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { HOLIDAYS } from "@/lib/holidays";
import { weekday } from "@/lib/kst";
import { monthGrid, shiftMonth } from "@/lib/leave";
import { dotsRange } from "@/lib/spans";

export type SquadLeave = { id: number; name: string; rank: string | null; start: string; end: string; planned: boolean; mine?: boolean };

export function SquadCalendar({ leaves, today }: { leaves: SquadLeave[]; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  const [picked, setPicked] = useState<string | null>(null);
  const [y, m] = month.split("-").map(Number);
  const monthStart = `${month}-01`, monthEnd = `${month}-31`;
  const inMonth = leaves.filter((l) => l.start <= monthEnd && l.end >= monthStart).sort((a, b) => a.start.localeCompare(b.start));
  const onDay = (d: string) => leaves.filter((l) => l.start <= d && d <= l.end);
  const list = picked && picked.startsWith(month) ? onDay(picked) : inMonth;
  const go = (n: number) => { setMonth(shiftMonth(month, n)); setPicked(null); };

  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} className="px-3 py-1 text-xl text-link" aria-label="이전 달">‹</button>
        <p className="font-semibold" data-squad-month={month}>{y}년 {m}월</p>
        <button type="button" onClick={() => go(1)} className="px-3 py-1 text-xl text-link" aria-label="다음 달">›</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs text-zinc-500">
        {"일월화수목금토".split("").map((w, i) => (
          <span key={w} className={i === 0 ? "text-red-500" : i === 6 ? "text-link" : ""}>{w}</span>
        ))}
      </div>
      {monthGrid(month).map((week, wi) => (
        <div key={wi} className="mt-1 grid grid-cols-7 gap-1">
          {week.map((d, di) => {
            if (d === null) return <span key={di} />;
            const n = onDay(d).length;
            const red = weekday(d) === 0 || Boolean(HOLIDAYS[d]);
            return (
              <button
                key={d}
                type="button"
                data-day={d}
                data-count={n}
                onClick={() => setPicked(picked === d ? null : d)}
                className={`flex h-11 flex-col items-center justify-center rounded-[10px] text-sm leading-tight ${
                  n >= 2 ? "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200" : n === 1 ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" : red ? "text-red-500" : ""
                } ${picked === d ? "ring-2 ring-blue-600" : d === today ? "ring-1 ring-zinc-900 dark:ring-zinc-100" : ""}`}
              >
                <span className="tabular-nums">{Number(d.slice(8))}</span>
                {n > 0 && <span className="text-[10px] font-semibold">{n}명</span>}
              </button>
            );
          })}
        </div>
      ))}
      <p className="mt-2 text-xs text-muted">
        <span className="mr-2 inline-block size-2.5 rounded-sm bg-blue-100 align-middle" />1명
        <span className="ml-3 mr-2 inline-block size-2.5 rounded-sm bg-orange-100 align-middle" />2명 이상(겹침) · 날짜를 누르면 그날 명단
      </p>
      <p className="mt-3 text-sm font-semibold">
        {picked && picked.startsWith(month) ? `${Number(picked.slice(5, 7))}/${Number(picked.slice(8))} 휴가자` : `${m}월 휴가 명단`} <span className="font-normal text-muted">{list.length}건</span>
      </p>
      {list.length === 0 ? (
        <p className="mt-1 text-sm text-muted">{picked ? "이 날 휴가인 사람이 없습니다." : "이 달에 예정된 휴가가 없습니다."}</p>
      ) : (
        <ul className="mt-1 divide-y divide-hairline text-sm">
          {list.map((l, i) => (
            <li key={i} className="flex items-center justify-between gap-2 py-2">
              <span>
                <span className="text-muted">{l.rank ?? ""}</span> <b>{l.mine ? `${l.name}(나)` : l.name}</b> <span className="tabular-nums">{dotsRange(l.start, l.end)}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${l.planned ? "border border-dashed border-blue-600 text-link" : "bg-blue-600 text-white"}`}>
                {l.planned ? "휴가 희망" : "휴가"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
