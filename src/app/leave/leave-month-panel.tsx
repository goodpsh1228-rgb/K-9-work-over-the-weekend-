"use client";
// ─────────────────────────────────────────────────────────────
// "○월 기록·계획" 패널 + 휴가 달력을 한 묶음으로: 달을 넘기면 둘이 같이 바뀝니다.
//   - 달 이동은 새로고침 없이 바로 (기록이 있는 달의 목록은 서버가 미리 만들어 보내 줌 → 여기선 고르기만 함)
//   - 패널 안 ‹ › 와 달력의 ‹ › 가 같은 달을 가리킴
// ─────────────────────────────────────────────────────────────
import { useState, type ReactNode } from "react";
import { shiftMonth } from "@/lib/leave";
import { LeaveCalendar, type CalLeave } from "./leave-calendar";

export function LeaveMonthPanel({
  initialMonth,
  today,
  leaves,
  planSupported,
  open,
  panels,
  empty,
}: {
  initialMonth: string;
  today: string;
  leaves: CalLeave[];
  planSupported: boolean;
  open: boolean;
  panels: Record<string, ReactNode>;
  empty: ReactNode;
}) {
  const [month, setMonth] = useState(initialMonth);
  const [y, m] = month.split("-").map(Number);
  const inMonth = leaves.filter((l) => l.start_date <= `${month}-31` && l.end_date >= `${month}-01`);
  const nLeaves = inMonth.filter((l) => !l.planned).length;
  const nPlans = inMonth.length - nLeaves;

  return (
    <>
      <details open={open} className="mt-4 rounded-[18px] border border-hairline bg-card p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between">
          <span className="font-semibold" data-records-month={month}>
            {m}월 기록·계획
          </span>
          <span className="text-sm text-muted">
            기록 {nLeaves}건{planSupported ? ` · 계획 ${nPlans}건` : ""} ▾
          </span>
        </summary>
        <div className="mt-2 flex items-center justify-between">
          <button type="button" onClick={() => setMonth(shiftMonth(month, -1))} className="px-3 py-1 text-xl text-link" aria-label="이전 달 기록">
            ‹
          </button>
          <p className="text-sm font-semibold">
            {y}년 {m}월
          </p>
          <button type="button" onClick={() => setMonth(shiftMonth(month, 1))} className="px-3 py-1 text-xl text-link" aria-label="다음 달 기록">
            ›
          </button>
        </div>
        {panels[month] ?? empty}
      </details>

      <LeaveCalendar leaves={leaves} month={month} setMonth={setMonth} today={today} planSupported={planSupported} />
    </>
  );
}
