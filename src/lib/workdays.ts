// ─────────────────────────────────────────────────────────────
// 직전 평일(근무일이 아닌 날) 찾기 — 라인업 "신규 불참"·"다시 출근" 비교 기준에 씀
//   주말·공휴일은 쉬는 날이라, 월요일 라인업의 "어제"는 일요일이 아니라 금요일입니다.
//   금요일이 공휴일이면 목요일, 연휴면 연휴 전 마지막 평일이 기준이 됩니다.
//   isRestDay(날짜) = 주말·공휴일(근무일)이면 true. 순수 계산이라 서버·테스트 어디서나 씀.
// ─────────────────────────────────────────────────────────────
import { addDays } from "./kst";

export function lastWorkdayBefore(date: string, isRestDay: (d: string) => boolean, maxBack = 14): string {
  for (let k = 1; k <= maxBack; k++) {
    const d = addDays(date, -k);
    if (!isRestDay(d)) return d;
  }
  return addDays(date, -1); // 쉬는 날이 2주 넘게 이어지는 일은 없지만, 대비해서 전날로
}
