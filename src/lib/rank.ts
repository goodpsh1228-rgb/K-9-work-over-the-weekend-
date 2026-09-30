// ─────────────────────────────────────────────────────────────
// 계급 관련 계산 (순수 계산)
//   - 진급 안내 기간: 매월 마지막 7일 + 1일~7일 (한국 날짜 기준)
//   - 안내 대상: 이병·일병·상병 (병장은 더 진급할 계급이 없음)
// ─────────────────────────────────────────────────────────────

const PROMOTABLE = ["이병", "일병", "상병"];

// 그 날짜가 "월말 마지막 주(마지막 7일)" 또는 "월초 첫 주(1~7일)"인지
export function isPromotionReminderDay(date: string): boolean {
  const [y, m, d] = date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate(); // 그 달의 마지막 날짜
  return d <= 7 || d > lastDay - 7;
}

// 진급 안내를 보여 줄지
export function needsPromotionReminder(rank: string | null, today: string): boolean {
  return rank !== null && PROMOTABLE.includes(rank) && isPromotionReminderDay(today);
}
