// ─────────────────────────────────────────────────────────────
// 투표 기간 계산 (순수 계산)
//   열림: 근무일 30일 전 00:00 (한국 시간)
//   마감: 근무일 2일 전 21:00 (한국 시간)
//   예) 10/12(일) 근무 → 9/12 00:00 열림, 10/10(금) 21:00 마감
// 서버가 따로 돌 필요 없이, "지금 시각"과 비교해서 버튼을 켜고 끕니다.
// ─────────────────────────────────────────────────────────────
import { addDays, kstMoment } from "./kst";

export const OPEN_DAYS_BEFORE = 30;
export const CLOSE_DAYS_BEFORE = 2;
export const CLOSE_HOUR = 21;

export type VotingStatus = "before" | "open" | "closed"; // 열리기 전 / 투표 중 / 마감

export function votingWindow(dutyDate: string) {
  return {
    opensAt: kstMoment(addDays(dutyDate, -OPEN_DAYS_BEFORE), 0), // 30일 전 00:00
    closesAt: kstMoment(addDays(dutyDate, -CLOSE_DAYS_BEFORE), CLOSE_HOUR), // 2일 전 21:00
    openDate: addDays(dutyDate, -OPEN_DAYS_BEFORE),
    closeDate: addDays(dutyDate, -CLOSE_DAYS_BEFORE),
  };
}

// 열림 시각 "이상", 마감 시각 "미만"이면 투표 중. 마감 시각 정각(21:00:00)부터는 마감입니다.
export function votingStatus(dutyDate: string, now: Date = new Date()): VotingStatus {
  const { opensAt, closesAt } = votingWindow(dutyDate);
  if (now < opensAt) return "before";
  if (now < closesAt) return "open";
  return "closed";
}

export const STATUS_LABEL: Record<VotingStatus, string> = {
  before: "투표 예정",
  open: "투표 중",
  closed: "마감",
};
