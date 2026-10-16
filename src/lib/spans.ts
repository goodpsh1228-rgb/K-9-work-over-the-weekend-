// ─────────────────────────────────────────────────────────────
// 날짜 기간 계산 (브라우저·서버 모두에서 쓰는 순수 함수)
// ─────────────────────────────────────────────────────────────
export type LeaveSpan = { start: string; end: string };
// 두 기간이 하루라도 겹치는지 (시작일·종료일 포함)
export const spansOverlap = (a: LeaveSpan, b: LeaveSpan) => a.start <= b.end && b.start <= a.end;

// 날짜 표시 "8.12" (월.일)
export const dots = (date: string) => `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
export const dotsRange = (s: string, e: string) => (s === e ? dots(s) : `${dots(s)}~${dots(e)}`);
