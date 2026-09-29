// ─────────────────────────────────────────────────────────────
// 근무일 계산 (순수 계산 — 데이터베이스를 건드리지 않음)
//
// 규칙
//   1) 토·일요일과 공휴일 목록(holidays.ts)의 날은 자동으로 근무일
//   2) 관리자가 "추가(add)"한 날은 근무일 (평일 출근, 발표된 임시공휴일 등)
//   3) 관리자가 "삭제(remove)"한 날은 근무일이 아님
//   → 관리자 설정(2, 3)이 자동 계산(1)보다 우선합니다.
// ─────────────────────────────────────────────────────────────
import { HOLIDAYS, HOLIDAYS_LAST_YEAR } from "./holidays";
import { dateRange, isWeekend } from "./kst";

export type Override = { duty_date: string; kind: "add" | "remove"; note: string | null };

export type DayInfo = {
  date: string;
  auto: boolean; // 자동 계산으로 근무일인지 (주말·공휴일)
  label: string; // 표시 이름: "토요일" / "추석" / "추가: 메모" 등
  override: "add" | "remove" | null; // 관리자 설정
  isDutyDay: boolean; // 최종 결과: 근무일인가
};

// 한 날짜에 대한 자동 판정 (공휴일이면 공휴일 이름, 주말이면 "주말", 아니면 null)
export function autoLabel(date: string): string | null {
  if (HOLIDAYS[date]) return HOLIDAYS[date];
  if (isWeekend(date)) return "주말";
  return null;
}

// from~to 기간의 모든 날짜 중, 자동 근무일이거나 관리자 설정이 있는 날을 계산해서 돌려줍니다.
// (관리자 화면은 삭제된 날도 보여줘야 하므로 isDutyDay=false 인 날도 포함)
export function computeDays(from: string, to: string, overrides: Override[]): DayInfo[] {
  const byDate = new Map(overrides.map((o) => [o.duty_date, o]));
  const out: DayInfo[] = [];
  for (const date of dateRange(from, to)) {
    const auto = autoLabel(date);
    const o = byDate.get(date);
    if (!auto && !o) continue; // 평범한 평일
    const isDutyDay = o ? o.kind === "add" : true;
    let label = auto ?? "평일";
    if (o?.kind === "add" && !auto) label = o.note ? o.note : "추가 공휴일";
    if (o?.kind === "remove") label = `${auto ?? "평일"} (근무 없음${o.note ? ` · ${o.note}` : ""})`;
    out.push({ date, auto: auto !== null, label, override: o?.kind ?? null, isDutyDay });
  }
  return out;
}

// 근무일만 골라내기
export function computeDutyDays(from: string, to: string, overrides: Override[]): DayInfo[] {
  return computeDays(from, to, overrides).filter((d) => d.isDutyDay);
}

// 기간의 끝이 공휴일 목록이 다루는 해를 넘어가면 true (관리자에게 갱신 알림)
export function holidayListOutdated(to: string): boolean {
  return Number(to.slice(0, 4)) > HOLIDAYS_LAST_YEAR;
}

// 화면에 보여 줄 기간: 오늘부터 약 60일 앞까지
export const VIEW_DAYS = 60;
