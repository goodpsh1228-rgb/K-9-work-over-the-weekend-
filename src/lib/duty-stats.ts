// ─────────────────────────────────────────────────────────────
// 출근 통계 계산 (순수 계산)
//   확정 명단(assignments)에서 사람마다
//   - 출근일 수 (하루에 동 + 운전처럼 두 자리여도 1일)
//   - 동·진료실 자리의 희망 확정 / 차출 / 관리자 수정 횟수
//   - 주말 운전 횟수, 선탑 횟수
//   - 최근 4주(오늘 기준 28일 전 ~ 오늘) 출근일 수
// ─────────────────────────────────────────────────────────────
import { addDays } from "./kst";

export type StatRow = { member_id: number; duty_date: string; source: "wanted" | "drafted" | "admin"; pool: string };
export type MemberStat = {
  days: number;
  wanted: number;
  drafted: number;
  admin: number;
  drive: number;
  escort: number;
  recent: number;
};

export function computeStats(rows: StatRow[], today: string): Map<number, MemberStat> {
  const recentFrom = addDays(today, -28);
  const out = new Map<number, MemberStat>();
  const daysSeen = new Map<number, Set<string>>();
  for (const r of rows) {
    const s = out.get(r.member_id) ?? { days: 0, wanted: 0, drafted: 0, admin: 0, drive: 0, escort: 0, recent: 0 };
    out.set(r.member_id, s);
    if (r.pool === "driver") s.drive++;
    else if (r.pool === "escort") s.escort++;
    else s[r.source]++;
    // 출근일은 날짜당 한 번만 (선탑만 있는 날은 거의 없지만, 있어도 출근으로 셈)
    const seen = daysSeen.get(r.member_id) ?? new Set<string>();
    daysSeen.set(r.member_id, seen);
    if (!seen.has(r.duty_date)) {
      seen.add(r.duty_date);
      s.days++;
      if (r.duty_date >= recentFrom && r.duty_date <= today) s.recent++;
    }
  }
  return out;
}
