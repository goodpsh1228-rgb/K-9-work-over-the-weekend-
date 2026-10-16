"use client";
// ─────────────────────────────────────────────────────────────
// 기간 고르기 (달력 하나에서 시작일·종료일을 차례로 누름)
//   - 달력에서 처음 누른 날 = 시작일. 그날 하나만 쓰려면 더 누르지 않으면 됩니다(종료일 = 시작일).
//   - 이어서 다른 날을 누르면 그날이 종료일 (시작일보다 앞 날짜를 누르면 두 날짜를 자동으로 바꿔 줍니다).
//   - single 이면 하루만 고르는 모드 (외출·면회 등): 한 번 누르면 끝.
//   - 폼에는 start_date / end_date (single 이면 start_date 만) 숨은 칸으로 전달됩니다.
// 아이폰에서 날짜 입력칸이 옆으로 삐져나가던 문제도 이 달력으로 대체하면서 없어집니다.
// ─────────────────────────────────────────────────────────────
import { useState } from "react";
import { HOLIDAYS } from "@/lib/holidays";
import { formatShort, weekday } from "@/lib/kst";
import { monthGrid, shiftMonth } from "@/lib/leave";

// 한국 날짜 오늘 (브라우저 시계 기준, UTC+9)
const todayKSTClient = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function DateRangePicker({ defaultDate, single = false }: { defaultDate?: string; single?: boolean }) {
  const today = todayKSTClient();
  const first = defaultDate ?? today;
  const [start, setStart] = useState(first);
  const [end, setEnd] = useState(first);
  const [picking, setPicking] = useState(false); // 시작일을 눌러서 종료일을 기다리는 중
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(first.slice(0, 7));
  const grid = monthGrid(month);
  const [y, m] = month.split("-").map(Number);

  function onDay(d: string) {
    if (single) {
      setStart(d);
      setEnd(d);
      setOpen(false);
    } else if (!picking) {
      // 첫 번째 누름 = 시작일 (종료일도 같은 날로 둠 → 하루만이면 그대로 저장)
      setStart(d);
      setEnd(d);
      setPicking(true);
    } else {
      // 두 번째 누름 = 종료일 (앞 날짜를 눌렀으면 순서를 바꿈)
      if (d < start) {
        setEnd(start);
        setStart(d);
      } else setEnd(d);
      setPicking(false);
      setOpen(false);
    }
  }

  const days = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86400000) + 1;
  const label = single || start === end ? `${formatShort(start)}` : `${formatShort(start)} ~ ${formatShort(end)} · ${days}일`;

  return (
    <div data-range-picker className="min-w-0">
      <input type="hidden" name="start_date" value={start} />
      {!single && <input type="hidden" name="end_date" value={end} />}

      {/* 선택한 날짜(기간) — 누르면 달력이 펼쳐짐 */}
      <button
        type="button"
        data-range-toggle
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex h-12 w-full min-w-0 items-center justify-between rounded-full border border-hairline bg-input px-4 text-left text-base"
      >
        <span className="truncate">
          <span className="mr-2 text-xs text-muted">{single ? "날짜" : "기간"}</span>
          <b>{label}</b>
        </span>
        <span className="text-muted">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div data-calendar data-month={month} className="mt-2 rounded-[18px] border border-hairline bg-card p-3">
          <p className="mb-2 text-center text-xs text-muted">
            {single ? "날짜를 누르세요" : picking ? "종료일을 누르세요 (하루만이면 같은 날을 다시 누르세요)" : "시작일을 누르세요"}
          </p>
          <div className="mb-1 flex items-center justify-between">
            <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-1 text-xl text-link" aria-label="이전 달">
              ‹
            </button>
            <p className="font-semibold">
              {y}년 {m}월
            </p>
            <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-1 text-xl text-link" aria-label="다음 달">
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
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7">
              {week.map((d, di) => {
                if (d === null) return <span key={di} />;
                const isEdge = d === start || d === end;
                const inRange = d >= start && d <= end;
                const off = weekday(d) === 0 || Boolean(HOLIDAYS[d]);
                return (
                  <button
                    key={d}
                    type="button"
                    data-date={d}
                    onClick={() => onDay(d)}
                    className={`mx-auto my-0.5 flex size-10 items-center justify-center rounded-full text-sm tabular-nums ${
                      isEdge
                        ? "bg-blue-600 font-bold text-white"
                        : inRange
                          ? "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-100"
                          : off
                            ? "text-red-500"
                            : weekday(d) === 6
                              ? "text-link"
                              : ""
                    } ${d === today && !isEdge ? "ring-1 ring-blue-500" : ""}`}
                  >
                    {Number(d.slice(8))}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="mt-1 flex justify-between text-xs">
            <button type="button" onClick={() => { setMonth(today.slice(0, 7)); }} className="text-link underline">
              이번 달
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-muted underline">
              닫기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
