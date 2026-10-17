// ─────────────────────────────────────────────────────────────
// 라인업 불참 입력 마감 — 그날 라인업은 "전날 21:15(한국 시간)"에 마감됩니다.
//   라인업은 종이에 손으로 옮겨 적기 때문에, 마감 뒤에 불참 기록이 바뀌면 종이와 사이트가 달라집니다.
//   그래서 마감된 날짜가 걸린 "라인업 불참 종류"(휴가·교육·당직오프·근무오프·외진·기타 불참)는
//   일반 인원이 입력·삭제할 수 없습니다. (부상·외출·면회는 라인업에 영향이 없어서 마감 없음)
//   관리자는 급한 정정을 위해 마감 뒤에도 입력할 수 있습니다.
//
// 예) 10/17(토) 20:00 → 오늘(10/17)까지 마감 / 10/18 라인업은 오늘 21:15까지 입력 가능
//     10/17(토) 21:20 → 10/18까지 마감 / 10/19부터 입력 가능
// 순수 계산만 하므로 화면(브라우저)과 서버가 같이 씁니다.
// ─────────────────────────────────────────────────────────────
import { addDays, formatShort, kstMoment, todayKST } from "./kst";
import { isLineupAbsent } from "./absence-kinds";

export const CUTOFF_HOUR = 21;
export const CUTOFF_MINUTE = 15;
export const CUTOFF_TEXT = "전날 21:15";

// 이 날짜까지(포함)는 라인업이 이미 마감됨. 오늘 라인업은 어제 21:15에 마감됐고, 내일 라인업은 오늘 21:15에 마감.
export function lockedThrough(now: Date = new Date()): string {
  const today = todayKST(now);
  return now.getTime() >= kstMoment(today, CUTOFF_HOUR, CUTOFF_MINUTE).getTime() ? addDays(today, 1) : today;
}

// 이 기간이 "마감된 날짜(오늘~마감일)"와 겹치는가. 이미 지나간 날짜만 걸친 기록은 마감과 상관없음.
export function touchesLocked(start: string, end: string, now: Date = new Date()): boolean {
  return start <= lockedThrough(now) && end >= todayKST(now);
}

// 일반 인원이 이 입력·삭제를 할 수 없는가 (관리자는 항상 가능)
export function lineupLocked(kind: string, start: string, end: string, isAdmin: boolean, now: Date = new Date()): boolean {
  return !isAdmin && isLineupAbsent(kind) && touchesLocked(start, end, now);
}

// 안내 문구
export function lockText(verb: "입력" | "삭제" | "보내기", now: Date = new Date()): string {
  const locked = lockedThrough(now);
  const free = addDays(locked, 1);
  const hint = verb === "삭제" ? "관리자에게 요청해 주세요." : `${formatShort(free)} 이후 날짜로 해 주세요.`;
  return `라인업 불참은 ${CUTOFF_TEXT}에 마감됩니다. ${formatShort(locked)}까지는 마감되어 ${verb}할 수 없습니다. ${hint}`;
}

// 입력 화면 위에 보여 줄 한 줄 안내
export function deadlineNotice(now: Date = new Date()): string {
  const locked = lockedThrough(now);
  return `라인업 불참(휴가·교육·당직오프·근무오프·외진·기타)은 전날 21:15에 마감됩니다. 지금은 ${formatShort(locked)}까지 마감, ${formatShort(addDays(locked, 1))}부터 입력할 수 있습니다.`;
}
