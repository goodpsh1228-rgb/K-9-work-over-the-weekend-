// ─────────────────────────────────────────────────────────────
// 순번제 계산 (순수 계산 — 데이터베이스·시간에 의존하지 않음)
//
// 랜덤 차출을 대신해, 공석을 "순번"으로 채웁니다. 순번표는 3개(일반·진료실·운전)이고
// 이 함수는 순번표 하나에 대해 동작합니다.
//
// 규칙 (docs/PLAN.md 12장 2026-11-23)
//  1. 순서  : 높은 기수부터. 기수 숫자가 작을수록 높은 기수. 기수가 같으면 입대일이 빠른 사람, 그다음 id.
//             기수를 입력하지 않은 사람은 맨 뒤.
//  2. 바퀴  : 한 바퀴(cycle) 안에서는 이미 근무했거나 건너뛴 사람이 다시 걸리지 않음.
//             모두 한 번씩 지나가면 다음 바퀴로 넘어가고, 바퀴는 달이 바뀌어도 이어짐.
//  3. 건너뜀: 순번이 왔는데 그날 출근 불가(휴가 등)면 자동으로 건너뛰고 "빚" 기록.
//  4. 빚    : 빚이 있는 사람은 출근 가능한 날이 되면 일반 순번보다 먼저(오래된 빚부터) 배정되어 빚이 갚아짐.
//  5. 자발  : 그날 희망이 확정되어 출근하는 사람(working)은 이번 바퀴에서 근무 1회로 인정(volunteered 기록).
//             같은 바퀴에서 여러 번 자원해도 인정은 1회이고 다음 바퀴로 이월되지 않음. 빚이 있으면 함께 갚아짐.
// ─────────────────────────────────────────────────────────────

export type RotMember = {
  id: number;
  cohort: number | null; // 작을수록 높은 기수. 없으면 null
  enlistDate: string | null; // 'YYYY-MM-DD'
};

// 데이터베이스 rotation_log 한 줄에 해당
export type RotLogRow = {
  id?: number;
  memberId: number;
  dutyDate: string;
  cycle: number;
  kind: "served" | "skipped" | "volunteered";
  reason?: string | null;
  repaid: boolean; // skipped 일 때: 이미 갚았는가
};

// 근무일 하나의 입력
export type RotDay = {
  date: string;
  needed: number; // 순번으로 채울 공석 수
  working: number[]; // 희망 확정 등으로 이미 그날 출근하는 사람 (후보 아님, 이번 바퀴 근무로 인정)
  unavailable: Record<number, string>; // 출근 불가 사람 id → 사유 (휴가·부상·교육·관리자 제외 등)
  passed?: number[]; // 그날 순번에서 조용히 빠지는 사람 (빚도, 근무 인정도 없음. 예: 희망했다가 정원 초과로 떨어져 쉬는 사람)
};

export type RotPick = { date: string; memberId: number; cycle: number; viaDebt: boolean };
export type RotSkip = { date: string; memberId: number; cycle: number; reason: string };

export type RotVolunteer = { date: string; memberId: number; cycle: number };

export type RotResult = {
  picks: RotPick[]; // 새로 배정된 사람
  volunteers: RotVolunteer[]; // 자발 출근으로 이번 바퀴 근무 인정된 사람
  skips: RotSkip[]; // 새로 생긴 빚
  repaidDebts: { memberId: number; skippedDate: string }[]; // 이번에 갚은 빚
  shortage: Record<string, number>; // 날짜 → 못 채운 자리 수
  cycle: number; // 계산 후 바퀴 번호
};

// 기수 순서 비교 (높은 기수 = 작은 숫자 먼저)
export function compareMembers(a: RotMember, b: RotMember): number {
  const ca = a.cohort ?? Number.MAX_SAFE_INTEGER;
  const cb = b.cohort ?? Number.MAX_SAFE_INTEGER;
  if (ca !== cb) return ca - cb;
  const ea = a.enlistDate ?? "9999-12-31";
  const eb = b.enlistDate ?? "9999-12-31";
  if (ea !== eb) return ea < eb ? -1 : 1;
  return a.id - b.id;
}

// members: 이 순번표의 대상(활성 인원) 전체. log: 지금까지의 기록. cycle: 현재 바퀴 번호.
export function planRotation(
  members: RotMember[],
  log: RotLogRow[],
  cycle: number,
  days: RotDay[],
): RotResult {
  const order = [...members].sort(compareMembers);
  const ids = new Set(order.map((m) => m.id));

  // 현재 바퀴에서 이미 지나간 사람 (근무 또는 건너뜀)
  let done = new Set(log.filter((r) => r.cycle === cycle && ids.has(r.memberId)).map((r) => r.memberId));
  // 아직 안 갚은 빚 (오래된 순)
  const debts = log
    .filter((r) => r.kind === "skipped" && !r.repaid && ids.has(r.memberId))
    .sort((a, b) => (a.dutyDate < b.dutyDate ? -1 : a.dutyDate > b.dutyDate ? 1 : 0))
    .map((r) => ({ memberId: r.memberId, skippedDate: r.dutyDate }));

  const res: RotResult = { picks: [], volunteers: [], skips: [], repaidDebts: [], shortage: {}, cycle };
  const sortedDays = [...days].sort((a, b) => (a.date < b.date ? -1 : 1));

  for (const day of sortedDays) {
    const working = new Set(day.working);
    const passed = new Set(day.passed ?? []);
    // ⓪ 자발 출근자: 이번 바퀴 근무로 인정하고, 빚이 있으면 함께 갚음
    for (const id of working) {
      if (!ids.has(id)) continue;
      if (!done.has(id)) {
        done.add(id);
        res.volunteers.push({ date: day.date, memberId: id, cycle: res.cycle });
      }
      for (let i = debts.length - 1; i >= 0; i--) {
        if (debts[i].memberId === id) res.repaidDebts.push(...debts.splice(i, 1));
      }
    }
    const takenToday = new Set<number>(); // 오늘 이미 뽑힌 사람 (같은 날 두 자리 금지)
    const canWork = (id: number) => !working.has(id) && !passed.has(id) && !(id in day.unavailable) && !takenToday.has(id);
    let remaining = day.needed;

    // ① 빚이 있는 사람 먼저 (오늘 출근 가능하면)
    for (let i = 0; i < debts.length && remaining > 0; ) {
      const d = debts[i];
      if (canWork(d.memberId)) {
        res.picks.push({ date: day.date, memberId: d.memberId, cycle: res.cycle, viaDebt: true });
        res.repaidDebts.push(d);
        debts.splice(i, 1);
        takenToday.add(d.memberId);
        done.add(d.memberId); // 갚으며 근무했으니 이번 바퀴에서도 지나간 것으로 처리
        remaining--;
      } else i++;
    }

    // ② 일반 순번: 이번 바퀴에서 아직 안 지나간 사람을 기수순으로
    let rolled = false; // 오늘 이미 바퀴를 한 번 넘겼는지(무한 반복 방지)
    while (remaining > 0) {
      const next = order.find(
        (m) => !done.has(m.id) && !working.has(m.id) && !passed.has(m.id) && !takenToday.has(m.id) && !(m.id in day.unavailable),
      );
      // 건너뛸 사람(출근 불가)을 먼저 처리: 순서상 next 보다 앞서 있는 불가자는 빚 기록
      const skipUpTo = next ? order.indexOf(next) : order.length;
      for (let i = 0; i < skipUpTo; i++) {
        const m = order[i];
        if (done.has(m.id) || working.has(m.id) || passed.has(m.id) || takenToday.has(m.id)) continue;
        if (m.id in day.unavailable) {
          const reason = day.unavailable[m.id];
          res.skips.push({ date: day.date, memberId: m.id, cycle: res.cycle, reason });
          debts.push({ memberId: m.id, skippedDate: day.date });
          done.add(m.id);
        }
      }
      if (next) {
        res.picks.push({ date: day.date, memberId: next.id, cycle: res.cycle, viaDebt: false });
        takenToday.add(next.id);
        done.add(next.id);
        remaining--;
        continue;
      }
      // 이번 바퀴에 더 뽑을 사람이 없음 → 다음 바퀴 시도 (오늘 한 번만)
      const anyoneLeft = order.some((m) => canWork(m.id));
      if (rolled || !anyoneLeft) break;
      res.cycle++;
      done = new Set();
      rolled = true;
    }
    if (remaining > 0) res.shortage[day.date] = remaining;
  }
  return res;
}

// 기록을 데이터베이스에 저장할 모양(rotation_log 행)으로 변환 — 저장은 서버 코드가 담당
export function toLogRows(r: RotResult): RotLogRow[] {
  return [
    ...r.picks.map((p) => ({ memberId: p.memberId, dutyDate: p.date, cycle: p.cycle, kind: "served" as const, repaid: false })),
    ...r.volunteers.map((v) => ({ memberId: v.memberId, dutyDate: v.date, cycle: v.cycle, kind: "volunteered" as const, repaid: false })),
    ...r.skips.map((s) => ({ memberId: s.memberId, dutyDate: s.date, cycle: s.cycle, kind: "skipped" as const, reason: s.reason, repaid: false })),
  ];
}
