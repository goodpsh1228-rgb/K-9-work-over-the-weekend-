// ─────────────────────────────────────────────────────────────
// 제외(추첨에서 빠지는) 종류 목록 — 화면과 서버가 같이 씀
//   휴가 / 부상 / 외출·면회 / 전역 1개월 전 면제
// 전역 1개월 전 면제는 "전역일"만 입력하면, 전역일 한 달 전부터 전역일까지를 제외 기간으로 계산합니다.
// ─────────────────────────────────────────────────────────────
import { addMonths } from "./kst";

export const ABSENCE_KINDS = [
  { value: "leave", label: "휴가" },
  { value: "injury", label: "부상" },
  { value: "outing", label: "외출·면회" },
  { value: "discharge", label: "전역 1개월 전 면제" },
] as const;

export type AbsenceKind = (typeof ABSENCE_KINDS)[number]["value"];

export const KIND_LABEL: Record<string, string> = Object.fromEntries(ABSENCE_KINDS.map((k) => [k.value, k.label]));

export function isAbsenceKind(v: string): v is AbsenceKind {
  return ABSENCE_KINDS.some((k) => k.value === v);
}

// 전역일 → 제외 기간 (전역일 한 달 전 ~ 전역일). 예: 11/15 전역 → 10/15 ~ 11/15
export function dischargeRange(dischargeDate: string) {
  return { start: addMonths(dischargeDate, -1), end: dischargeDate };
}
