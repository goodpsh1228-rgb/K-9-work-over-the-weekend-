// ─────────────────────────────────────────────────────────────
// 주간 투표 일정 계산 (순수 계산)
//
// 투표는 매주 한 번 열립니다. (한국 시간 기준)
//   · 기본       : 월 00:00 ~ 수 21:00
//                  대상 근무일 = 그 주 토·일 + 다음 주 월~목의 공휴일(근무일)
//   · 그 주 금요일이 공휴일(근무일)이면
//                : 월 00:00 ~ 화 21:00
//                  대상 근무일 = 그 주 금·토·일 + 다음 주 월~목의 공휴일(근무일)
//   → 근무일 하나는 정확히 한 주의 투표에 속합니다.
//     (그 주 금요일 ~ 다음 주 목요일 = 월요일로부터 4~10일 뒤)
//
// 계급별 시작 시각
//   · 상병·병장         : 월요일 00:00부터
//   · 일병·이병(·미지정) : 화요일 00:00부터
// ─────────────────────────────────────────────────────────────
import { addDays, kstMoment, mondayOf } from "./kst";

export type Rank = "이병" | "일병" | "상병" | "병장";
export const RANKS: Rank[] = ["이병", "일병", "상병", "병장"];
export const SENIOR_RANKS: Rank[] = ["상병", "병장"];
export const CLOSE_HOUR = 21;

export type VotingStatus = "before" | "open" | "closed"; // 열리기 전 / 투표 중 / 마감

// 근무일이 속한 투표 주의 월요일: (근무일 - 4일)이 속한 주의 월요일
export function voteMonday(dutyDate: string): string {
  return mondayOf(addDays(dutyDate, -4));
}

// 그 투표 주의 금요일 (이 날이 근무일이면 마감이 하루 당겨짐)
export function voteFriday(dutyDate: string): string {
  return addDays(voteMonday(dutyDate), 4);
}

// ── 특정 근무일만 투표 기간을 따로 정하기 (관리자 요청으로 연장할 때) ──
//   근무일 → { 상병·병장 시작일, 일병·이병 시작일, 마감일 } (모두 00:00 시작 / 마감은 21:00, 한국 시간)
//   여기 적힌 근무일만 기본 주간 일정 대신 이 일정을 씁니다. 지나간 항목은 지워도 됩니다.
export const VOTING_OVERRIDES: Record<string, { seniorFrom: string; juniorFrom: string; closeDate: string }> = {
  // 2026-10-21 요청: 10/24·10/25 투표 연장 — 10/21(수) 상병·병장, 10/22(목) 일병·이병, 10/22(목) 21:00 마감
  "2026-10-24": { seniorFrom: "2026-10-21", juniorFrom: "2026-10-22", closeDate: "2026-10-22" },
  "2026-10-25": { seniorFrom: "2026-10-21", juniorFrom: "2026-10-22", closeDate: "2026-10-22" },
};

// fridayIsDuty: 그 주 금요일이 근무일(공휴일 등)인지 — 데이터베이스 설정을 봐야 해서 밖에서 넣어 줌
export function votingWindow(dutyDate: string, fridayIsDuty: boolean) {
  const monday = voteMonday(dutyDate);
  const ov = VOTING_OVERRIDES[dutyDate];
  const closeDate = ov ? ov.closeDate : addDays(monday, fridayIsDuty ? 1 : 2); // 화 또는 수 (연장 시 그 날)
  return {
    monday,
    openDate: ov ? ov.seniorFrom : monday, // 투표가 처음 열리는 날 (화면 표시용)
    juniorDate: ov ? ov.juniorFrom : addDays(monday, 1), // 일병·이병 시작일 (화면 표시용)
    seniorOpensAt: kstMoment(ov ? ov.seniorFrom : monday, 0), // 월 00:00 (상병·병장)
    juniorOpensAt: kstMoment(ov ? ov.juniorFrom : addDays(monday, 1), 0), // 화 00:00 (일병·이병)
    closesAt: kstMoment(closeDate, CLOSE_HOUR), // 화 또는 수 21:00
    closeDate,
    coverFrom: fridayIsDuty ? addDays(monday, 4) : addDays(monday, 5), // 대상 근무일 범위 (금 또는 토 ~ 다음 주 목)
    coverTo: addDays(monday, 10),
  };
}

export function isSenior(rank: string | null | undefined): boolean {
  return SENIOR_RANKS.includes(rank as Rank);
}

// 투표 상태. rank 를 주면 그 계급 기준으로, 안 주면 "투표 전체"(가장 이른 월요일 시작) 기준으로 계산.
// 마감 시각 정각(21:00:00)부터는 마감입니다.
export function votingStatus(
  dutyDate: string,
  fridayIsDuty: boolean,
  now: Date = new Date(),
  rank?: string | null,
): VotingStatus {
  const w = votingWindow(dutyDate, fridayIsDuty);
  const opensAt = rank === undefined || isSenior(rank) ? w.seniorOpensAt : w.juniorOpensAt;
  if (now < opensAt) return "before";
  if (now < w.closesAt) return "open";
  return "closed";
}

export const STATUS_LABEL: Record<VotingStatus, string> = {
  before: "투표 예정",
  open: "투표 중",
  closed: "마감",
};
