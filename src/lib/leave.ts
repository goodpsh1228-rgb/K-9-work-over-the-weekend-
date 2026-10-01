// ─────────────────────────────────────────────────────────────
// 휴가 계산기 계산 (순수 계산 — 데이터베이스를 건드리지 않음)
//   - 복무일: 전체 / 현재 / 남은 날, 전역 D-day
//   - 실제 남은 출근일: 오늘 ~ 전역 전날 중 주말·공휴일·휴가일을 뺀 날 수
//   - 휴가 종류와 한도(포상·연가), 사용 일수
//   - 달력 한 달의 칸 배치
// 날짜는 모두 "YYYY-MM-DD" 글자(한국 날짜)로 다룹니다.
// ─────────────────────────────────────────────────────────────
import { HOLIDAYS } from "./holidays";
import { addDays, isWeekend } from "./kst";

// 휴가 종류 (color = 달력·목록 표시 색)
export const LEAVE_KINDS = [
  { value: "comfort", label: "위로", isLeave: true, color: "bg-pink-500" },
  { value: "regular", label: "정기", isLeave: true, color: "bg-blue-600" },
  { value: "reward", label: "포상", isLeave: true, color: "bg-amber-500" },
  { value: "official", label: "공가", isLeave: true, color: "bg-teal-600" },
  { value: "annual", label: "연가", isLeave: true, color: "bg-green-600" },
  { value: "outing", label: "외출", isLeave: false, color: "bg-sky-500" },
  { value: "visit", label: "면회", isLeave: false, color: "bg-violet-500" },
] as const;
export type LeaveKind = (typeof LEAVE_KINDS)[number]["value"];
export const LEAVE_LABEL: Record<string, string> = Object.fromEntries(LEAVE_KINDS.map((k) => [k.value, k.label]));
export const LEAVE_COLOR: Record<string, string> = Object.fromEntries(LEAVE_KINDS.map((k) => [k.value, k.color]));
export const isLeaveKind = (v: string): v is LeaveKind => LEAVE_KINDS.some((k) => k.value === v);
// 휴가(하루 종일 빠짐) 종류인지 — 외출·면회는 아님
export const isFullLeave = (kind: string) => LEAVE_KINDS.some((k) => k.value === kind && k.isLeave);

// 세부 종류와 한도(일)
export const SUBKINDS: Record<string, { value: string; label: string; quota: number }[]> = {
  reward: [
    { value: "mileage", label: "마일리지 포상", quota: 12 },
    { value: "merit", label: "가점 포상", quota: 6 },
  ],
  annual: [
    { value: "junior", label: "일·이병 연가", quota: 10 },
    { value: "corporal", label: "상병 연가", quota: 8 },
    { value: "sergeant", label: "병장 연가", quota: 10 },
  ],
};
export function isValidSubkind(kind: string, sub: string | null): boolean {
  const list = SUBKINDS[kind];
  if (!list) return sub === null; // 세부 종류가 없는 종류
  return sub !== null && list.some((s) => s.value === sub);
}
// 연가 기본 세부 종류: 지금 계급에 맞춰
export function annualSubkindFor(rank: string | null): string {
  return rank === "상병" ? "corporal" : rank === "병장" ? "sergeant" : "junior";
}

export type LeaveRow = { kind: string; subkind: string | null; start_date: string; end_date: string };

// 두 날짜 사이 일수 (to - from)
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// 기록 하나의 일수 (시작일·종료일 포함)
export const leaveDays = (l: { start_date: string; end_date: string }) => daysBetween(l.start_date, l.end_date) + 1;

// 평일 일과일인지: 주말도 공휴일도 아닌 날
export const isWorkday = (date: string) => !isWeekend(date) && !HOLIDAYS[date];

// 복무일 (예: 입대 2025-03-10, 전역 2026-12-09, 오늘 2026-10-01 → 전체 640, 현재 571, 남은 69)
export function serviceStats(enlist: string, discharge: string, today: string) {
  const total = daysBetween(enlist, discharge) + 1;
  const served = Math.min(total, Math.max(0, daysBetween(enlist, today) + 1));
  const remaining = Math.max(0, daysBetween(today, discharge));
  return { total, served, remaining };
}

// 실제 남은 출근일: 오늘 ~ 전역 전날 중 일과일(평일·공휴일 아님)이면서 휴가가 아닌 날
//   extraHolidays: 관리자가 추가한 공휴일(내장 목록 밖, 예: 2028년 붙여넣기)
export function remainingWorkdays(today: string, discharge: string, leaves: LeaveRow[], extraHolidays: Set<string> = new Set()): number {
  const leaveDates = new Set<string>();
  for (const l of leaves) {
    if (!isFullLeave(l.kind)) continue; // 외출·면회는 하루 일과를 빼지 않음
    for (let d = l.start_date; d <= l.end_date; d = addDays(d, 1)) leaveDates.add(d);
  }
  let n = 0;
  for (let d = today; d < discharge; d = addDays(d, 1)) if (isWorkday(d) && !extraHolidays.has(d) && !leaveDates.has(d)) n++;
  return n;
}

// 휴가 사용 현황: 세부 종류마다 사용 일수와 한도, 그 밖의 종류는 사용 일수(외출·면회는 횟수)
export function leaveSummary(leaves: LeaveRow[]) {
  const used = (kind: string, sub?: string) =>
    leaves.filter((l) => l.kind === kind && (sub === undefined || l.subkind === sub)).reduce((s, l) => s + leaveDays(l), 0);
  const count = (kind: string) => leaves.filter((l) => l.kind === kind).length;
  return {
    quotas: Object.entries(SUBKINDS).flatMap(([kind, subs]) =>
      subs.map((s) => ({ kind, label: s.label, used: used(kind, s.value), quota: s.quota })),
    ),
    others: [
      { label: "위로", value: `${used("comfort")}일` },
      { label: "정기", value: `${used("regular")}일` },
      { label: "공가", value: `${used("official")}일` },
      { label: "외출", value: `${count("outing")}회` },
      { label: "면회", value: `${count("visit")}회` },
    ],
  };
}

// 달력 한 달: 일요일부터 시작하는 주(週) 배열. 그 달이 아닌 칸은 null
export function monthGrid(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const startPad = new Date(`${first}T00:00:00Z`).getUTCDay();
  const [y, m] = month.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(startPad).fill(null)];
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// "YYYY-MM" 에 n달 더하기
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const isValidMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
