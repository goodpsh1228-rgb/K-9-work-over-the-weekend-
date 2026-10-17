// ─────────────────────────────────────────────────────────────
// 선탑 규칙 (순수 계산) — 주말 출근 선탑
//   "그날 운전병보다 기수가 같거나 높은 사람들 중에서 랜덤으로 한 명"
//   - 기수는 숫자가 작을수록 높습니다 (866기 > 877기). 같은 기수는 포함.
//   - 대상 = 그날 동·진료실 출근자 (운전하는 사람 본인은 제외), 기수를 입력한 사람만
//   - 운전병이 여러 명이면 가장 높은 기수(가장 작은 숫자) 기준으로 모두보다 같거나 높은 사람만
//   - 기준이 되는 운전병이 없거나 기수가 없으면 자동으로 뽑지 않음 (reason 에 이유)
// ─────────────────────────────────────────────────────────────
export type EscortPerson = { id: number; cohort: number | null };

export function escortPool<T extends EscortPerson>(
  drivers: EscortPerson[],
  workers: T[],
): { refCohort: number | null; pool: T[]; reason: string | null } {
  if (drivers.length === 0) return { refCohort: null, pool: [], reason: "그날 운전하는 사람이 없습니다." };
  const cohorts = drivers.map((d) => d.cohort).filter((c): c is number => c !== null);
  if (cohorts.length < drivers.length) return { refCohort: null, pool: [], reason: "운전병의 기수가 입력되어 있지 않습니다." };
  const ref = Math.min(...cohorts); // 가장 높은 기수 운전병 기준 → 모든 운전병과 같거나 높음
  const driverIds = new Set(drivers.map((d) => d.id));
  const pool = workers.filter((w) => !driverIds.has(w.id) && w.cohort !== null && w.cohort <= ref);
  return { refCohort: ref, pool, reason: pool.length ? null : `운전병(${ref}기)보다 기수가 같거나 높은 출근자가 없습니다.` };
}
