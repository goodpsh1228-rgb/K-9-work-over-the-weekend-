// ─────────────────────────────────────────────────────────────
// 정기휴가 일정 계산 — 전입일로부터 6주(42일)마다 정기휴가 2박3일, 전역할 때까지 모두 14번.
// 각 정기휴가 시작일의 2주 뒤에 위로휴가 하루가 나옵니다.
//   n번째 정기 = 전입일 + 42×n일 부터 3일(2박3일), 위로 = 그 정기 시작일 + 14일
// 순수 계산만 하므로 서버·브라우저 어디서나 씁니다.
// ─────────────────────────────────────────────────────────────
import { addDays } from "./kst";

export const REGULAR_COUNT = 14;
export const REGULAR_INTERVAL_DAYS = 42;
export const REGULAR_NIGHTS = 2;
export const COMFORT_AFTER_DAYS = 14;

export type RegularLeave = { n: number; start: string; end: string; comfort: string };

export function regularSchedule(transfer: string): RegularLeave[] {
  return Array.from({ length: REGULAR_COUNT }, (_, i) => {
    const start = addDays(transfer, REGULAR_INTERVAL_DAYS * (i + 1));
    return { n: i + 1, start, end: addDays(start, REGULAR_NIGHTS), comfort: addDays(start, COMFORT_AFTER_DAYS) };
  });
}

// 아직 끝나지 않은 첫 정기휴가 (진행 중이면 그 휴가)
export function nextRegular(transfer: string, today: string): RegularLeave | null {
  return regularSchedule(transfer).find((r) => r.end >= today) ?? null;
}
