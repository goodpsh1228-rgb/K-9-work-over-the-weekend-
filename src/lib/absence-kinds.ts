// ─────────────────────────────────────────────────────────────
// 제외(추첨에서 빠지는) 종류 목록 — 화면과 서버가 같이 씀
//   휴가 / 교육 / 당직오프 / 근무오프 / 외진 / 부상 / 외출·면회 / 전역 1개월 전 면제
//   라인업(출근 인원표)에서 "불참"으로 치는 것: 휴가·교육·당직오프·근무오프·외진
//   (부상·외출·면회는 라인업에서는 출근. 전역 면제·관리자 제외는 주말출근 추첨에서만 빠짐)
// 전역 1개월 전 면제는 "전역일"만 입력하면, 전역일 한 달 전부터 전역일까지를 제외 기간으로 계산합니다.
// ─────────────────────────────────────────────────────────────
import { addMonths } from "./kst";

export const ABSENCE_KINDS = [
  { value: "leave", label: "휴가" },
  { value: "training", label: "교육" },
  { value: "duty_off", label: "당직오프" },
  { value: "work_off", label: "근무오프" },
  { value: "outpatient", label: "외진" },
  { value: "lineup", label: "라인업 불참" }, // 사유를 직접 입력 (detail 에 저장)
  { value: "injury", label: "부상" },
  { value: "outing", label: "외출·면회" },
  { value: "discharge", label: "전역 1개월 전 면제" },
] as const;

export type AbsenceKind = (typeof ABSENCE_KINDS)[number]["value"];

// 화면 표시용 이름 (입력 목록에는 없는 "관리자 제외" 포함 — 관리자가 근무일 화면에서 미응답자를 그날만 뺄 때)
export const KIND_LABEL: Record<string, string> = {
  ...Object.fromEntries(ABSENCE_KINDS.map((k) => [k.value, k.label])),
  excused: "관리자 제외",
};

// 라인업 불참으로 치는 종류 (이 순서대로 화면에 묶어 보여 줌)
export const LINEUP_ABSENT_KINDS = ["leave", "training", "duty_off", "work_off", "outpatient", "lineup"] as const;
export const isLineupAbsent = (kind: string) => (LINEUP_ABSENT_KINDS as readonly string[]).includes(kind);
// 상세 내용을 입력받는 종류 (전역 면제는 날짜만)
export const takesDetail = (kind: string) => kind !== "discharge";
// 라인업 불참 사유 배지: 디자인 통일을 위해 모든 종류가 같은 회색 알약 (구분은 글자로)
export const KIND_BADGE: Record<string, string> = Object.fromEntries(
  ["leave", "training", "duty_off", "work_off", "outpatient", "lineup"].map((k) => [k, "bg-hairline/60 text-foreground"]),
);

export function isAbsenceKind(v: string): v is AbsenceKind {
  return ABSENCE_KINDS.some((k) => k.value === v);
}

// 전역일 → 제외 기간 (전역일 한 달 전 ~ 전역일). 예: 11/15 전역 → 10/15 ~ 11/15
export function dischargeRange(dischargeDate: string) {
  return { start: addMonths(dischargeDate, -1), end: dischargeDate };
}
