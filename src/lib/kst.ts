// ─────────────────────────────────────────────────────────────
// 한국 시간(KST) 날짜 계산 도구
//
// 왜 필요한가?
//   Vercel 서버의 시계는 UTC(영국 기준 시간)로 돌아갑니다. 한국은 UTC보다 9시간 빠릅니다.
//   예) 한국 10월 1일 오전 8시 = UTC 9월 30일 오후 11시
//   그래서 "오늘이 며칠인지"를 서버 시계로 그냥 계산하면 하루가 어긋날 수 있습니다.
//   이 파일의 함수들은 항상 한국 날짜 기준으로 계산합니다. (한국은 서머타임이 없어 +9시간 고정)
//
// 날짜는 "2026-10-12" 같은 글자(YYYY-MM-DD)로 주고받습니다. 시간대 혼동을 막기 위함입니다.
// ─────────────────────────────────────────────────────────────

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// 지금 이 순간의 "한국 날짜" (예: "2026-09-29")
export function todayKST(now: Date = new Date()): string {
  return new Date(now.getTime() + KST_OFFSET_MS).toISOString().slice(0, 10);
}

// 날짜 글자 → 계산용 숫자 (그날 UTC 0시). 날짜 계산에만 쓰고 시각으로 해석하지 않습니다.
function toDayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}
function fromDayNumber(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// "YYYY-MM-DD" 형식이 맞고 실제로 있는 날짜인지 (예: 2026-02-30 은 false)
export function isValidDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  return fromDayNumber(toDayNumber(date)) === date;
}

// 날짜 더하기/빼기 (n 이 음수면 이전 날짜)
export function addDays(date: string, n: number): string {
  return fromDayNumber(toDayNumber(date) + n * DAY_MS);
}

// 요일 번호 (0=일, 1=월, … 6=토)
export function weekday(date: string): number {
  return new Date(toDayNumber(date)).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const w = weekday(date);
  return w === 0 || w === 6;
}

// 화면 표시용: "10/12(일)"
export function formatShort(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return `${m}/${d}(${WEEKDAYS[weekday(date)]})`;
}

// 화면 표시용: "2026년 10월 12일 (일)"
export function formatLong(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${y}년 ${m}월 ${d}일 (${WEEKDAYS[weekday(date)]})`;
}

// from 부터 to 까지(양 끝 포함) 날짜 목록
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// 한국 날짜 + 한국 시각 → 실제 순간(Date). 예: kstMoment("2026-10-10", 21) = 한국 10/10 21:00
export function kstMoment(date: string, hour = 0, minute = 0): Date {
  return new Date(toDayNumber(date) + (hour * 60 + minute) * 60 * 1000 - KST_OFFSET_MS);
}

// 그 날짜가 속한 주의 월요일 (주는 월~일)
export function mondayOf(date: string): string {
  const w = weekday(date); // 0=일 … 6=토
  return addDays(date, w === 0 ? -6 : 1 - w);
}

// 몇 달 더하기/빼기. 없는 날짜는 그 달 마지막 날로 맞춤 (예: 3/31 에서 1달 빼기 → 2/28 또는 2/29)
export function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1)); // 목표 달의 1일
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}
