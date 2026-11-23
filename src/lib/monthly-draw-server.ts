// ─────────────────────────────────────────────────────────────
// 한 달 차출 실행 · 조회 (서버 전용) — 순번제
//   - 관리자가 [한 달 차출하기]를 누르면, 그 달 모든 근무일의 공석을 순번으로 채웁니다.
//   - 계산은 monthly-draw.ts(순수 계산), 저장은 record_monthly_draw 함수(한 번에, 딱 한 번만)
//   - 일반(동) 공석은 동이 비어 있는 채로 저장되고, 관리자가 [명단 수정]에서 동을 배정합니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { randomInt } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { computeDutyDays } from "@/lib/duty-days";
import { getOverrides } from "@/lib/duty-days-server";
import { getDriverIds, getDriveWants, getDriverIdsOn } from "@/lib/drivers";
import { votingStatus } from "@/lib/voting";
import { addDays, todayKST } from "@/lib/kst";
import { writeAudit } from "@/lib/audit";
import { planMonth, type MDayInput, type MMember, type PoolState, type RotPool } from "@/lib/monthly-draw";
import { rotationBoard, type RotLogRow } from "@/lib/rotation";
import { KIND_LABEL } from "@/lib/absence-kinds";

const POOLS: RotPool[] = ["general", "clinic", "driver"];

export function isValidMonth(m: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
}

// 'YYYY-MM' → 그 달 첫날·마지막날
export function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

// 그 달 근무일 + 투표 마감 여부 + 이미 추첨된 날
export async function getMonthStatus(month: string, now: Date = new Date()) {
  const { from, to } = monthBounds(month);
  const days = computeDutyDays(from, to, await getOverrides(from, to)).map((d) => d.date);
  const db = getSupabaseAdmin();
  const [{ data: drawn }, { data: done }] = await Promise.all([
    db.from("draws").select("duty_date").gte("duty_date", from).lte("duty_date", to),
    db.from("monthly_draws").select("month, executed_at").eq("month", month).maybeSingle(),
  ]);
  const drawnSet = new Set((drawn ?? []).map((r) => r.duty_date as string));
  const open = days.filter((d) => votingStatus(d, false, now) !== "closed"); // 아직 투표 중이거나 열리기 전
  return {
    month,
    days,
    drawn: days.filter((d) => drawnSet.has(d)),
    undrawn: days.filter((d) => !drawnSet.has(d)),
    stillVoting: open,
    executedAt: (done?.executed_at as string | undefined) ?? null,
  };
}

async function loadRotationState(): Promise<Record<RotPool, PoolState>> {
  const db = getSupabaseAdmin();
  const [{ data: st, error: e1 }, { data: logs, error: e2 }] = await Promise.all([
    db.from("rotation_state").select("pool, cycle"),
    db.from("rotation_log").select("pool, member_id, duty_date, cycle, kind, reason, repaid_at"),
  ]);
  if (e1 || e2) throw new Error("순번 표를 읽지 못했습니다. 0019·0020 SQL을 먼저 실행해 주세요: " + (e1 ?? e2)!.message);
  const out = {} as Record<RotPool, PoolState>;
  for (const pool of POOLS) {
    out[pool] = {
      cycle: (st ?? []).find((s) => s.pool === pool)?.cycle ?? 1,
      log: (logs ?? [])
        .filter((l) => l.pool === pool)
        .map((l): RotLogRow => ({
          memberId: l.member_id as number,
          dutyDate: l.duty_date as string,
          cycle: l.cycle as number,
          kind: l.kind as RotLogRow["kind"],
          reason: l.reason as string | null,
          repaid: l.repaid_at !== null,
        })),
    };
  }
  return out;
}

async function loadMembers(): Promise<MMember[]> {
  const db = getSupabaseAdmin();
  const drivers = await getDriverIds();
  // 기수·반 칸(SQL 0015)이 없으면 기수 없이 읽음
  let r = await db.from("members").select("id, is_clinic, squad, cohort, enlist_date").eq("is_active", true);
  if (r.error) r = (await db.from("members").select("id, is_clinic").eq("is_active", true)) as typeof r;
  return ((r.data ?? []) as { id: number; is_clinic: boolean; squad?: string | null; cohort?: number | null; enlist_date?: string | null }[]).map((m) => ({
    id: m.id,
    cohort: m.cohort ?? null,
    enlistDate: m.enlist_date ?? null,
    clinic: Boolean(m.is_clinic) || m.squad === "진료반", // 반이 "진료반"이면 진료실 풀
    driver: drivers.has(m.id),
  }));
}

export type MonthlyResult =
  | { status: "done"; days: number; picked: number; unassignedDong: number; shortage: Record<string, number> }
  | { status: "already" }
  | { status: "not-ready"; reason: string };

export async function executeMonthlyDraw(month: string, actorId: number): Promise<MonthlyResult> {
  if (!isValidMonth(month)) return { status: "not-ready", reason: "잘못된 달입니다." };
  const st = await getMonthStatus(month);
  if (st.days.length === 0) return { status: "not-ready", reason: "그 달에는 근무일이 없습니다." };
  if (st.executedAt) return { status: "already" };
  if (st.stillVoting.length > 0) {
    return { status: "not-ready", reason: `아직 투표 중인 근무일이 있습니다. (${st.stillVoting.length}일 · 마감 후에 차출할 수 있습니다)` };
  }
  // 예전 방식으로 이미 추첨된 날과, 이미 지나간 날(오늘 이전)은 순번을 쓰지 않도록 건드리지 않음
  const targets = st.undrawn.filter((d) => d >= todayKST());
  if (targets.length === 0) return { status: "not-ready", reason: "차출할 날이 없습니다. (모두 추첨 완료되었거나 이미 지난 날입니다)" };

  const db = getSupabaseAdmin();
  const [members, state, { data: resp }] = await Promise.all([
    loadMembers(),
    loadRotationState(),
    db.from("responses").select("duty_date, member_id, choice, post_id").in("duty_date", targets),
  ]);

  // 날짜별 입력 모으기
  const inputs: MDayInput[] = [];
  for (const date of targets) {
    const [posts, excluded, driveWants, designated] = await Promise.all([
      getPostsForDate(date),
      getExcludedIds(date), // 휴가·부상·교육·관리자 제외 + 그날 운전 지정자
      getDriveWants(date),
      getDriverIdsOn(date),
    ]);
    inputs.push({
      date,
      posts: posts.filter((p): p is typeof p & { pool: RotPool } => p.pool !== "escort").map((p) => ({ id: p.id, pool: p.pool, required: p.required })),
      responses: new Map(
        (resp ?? []).filter((r) => r.duty_date === date).map((r) => [r.member_id as number, { choice: r.choice as "want" | "decline", postId: r.post_id as number | null }]),
      ),
      driveWants: driveWants.ids,
      designated: [...designated.ids],
      excluded,
    });
  }

  const plan = planMonth(inputs, members, state, (n) => randomInt(n));

  // 저장용 모양으로 변환
  const shortage: Record<string, number> = {};
  const daysPayload = plan.days.map((d) => {
    const total = d.shortage.general + d.shortage.clinic + d.shortage.driver;
    if (total > 0) shortage[d.date] = total;
    return {
      date: d.date,
      clinic_shortage: d.shortage.clinic,
      general_shortage: d.shortage.general + d.shortage.driver, // 운전 부족은 "일반" 부족에 합쳐 저장 (기존 방식과 같음)
      assignments: [
        ...d.wanted.map((w) => ({ member_id: w.memberId, post_id: w.postId, source: "wanted" })),
        // 진료실·운전은 자리까지 정해져 바로 명단에 들어감. 일반(동)은 동 배정 후에 명단에 들어감
        ...d.picks.filter((p) => p.postId !== null).map((p) => ({ member_id: p.memberId, post_id: p.postId, source: "rotation" })),
      ],
      picks: d.picks.map((p) => ({ pool: p.pool, member_id: p.memberId, post_id: p.postId })),
    };
  });
  const log = POOLS.flatMap((pool) => {
    const r = plan.rotation[pool];
    return [
      ...r.picks.map((x) => ({ pool, member_id: x.memberId, duty_date: x.date, cycle: x.cycle, kind: "served", reason: null })),
      ...r.volunteers.map((x) => ({ pool, member_id: x.memberId, duty_date: x.date, cycle: x.cycle, kind: "volunteered", reason: null })),
      ...r.skips.map((x) => ({ pool, member_id: x.memberId, duty_date: x.date, cycle: x.cycle, kind: "skipped", reason: x.reason })),
    ];
  });
  const repaid = POOLS.flatMap((pool) => plan.rotation[pool].repaidDebts.map((x) => ({ pool, member_id: x.memberId, duty_date: x.skippedDate })));
  const cycles = Object.fromEntries(POOLS.map((pool) => [pool, plan.rotation[pool].cycle]));

  const { data: saved, error } = await db.rpc("record_monthly_draw", {
    p_month: month,
    p_executed_by: actorId,
    p_shortage: shortage,
    p_days: daysPayload,
    p_log: log,
    p_repaid: repaid,
    p_cycles: cycles,
  });
  if (error) throw new Error("한 달 차출 저장 실패 (0021 SQL을 실행했는지 확인해 주세요): " + error.message);
  if (saved !== true) return { status: "already" };

  const picked = plan.days.reduce((s, d) => s + d.picks.length, 0);
  const unassignedDong = plan.days.reduce((s, d) => s + d.picks.filter((p) => p.postId === null).length, 0);
  await writeAudit({ actorId, action: "draw.monthly", details: { month, days: plan.days.length, picked, shortage } });
  return { status: "done", days: plan.days.length, picked, unassignedDong, shortage };
}

// 한 근무일에서 아직 동이 정해지지 않은 순번 뽑힘 (관리자가 동을 배정해야 함)
export async function getUnassignedPicks(date: string) {
  const db = getSupabaseAdmin();
  const { data } = await db.from("rotation_picks").select("id, member_id, pool").eq("duty_date", date).is("post_id", null);
  const rows = data ?? [];
  if (rows.length === 0) return [] as { id: number; memberId: number; name: string; rank: string | null; cohort: number | null }[];
  const ids = rows.map((r) => r.member_id as number);
  let m = await db.from("members").select("id, name, rank, cohort").in("id", ids);
  if (m.error) m = (await db.from("members").select("id, name, rank").in("id", ids)) as typeof m;
  const info = new Map(((m.data ?? []) as { id: number; name: string; rank: string | null; cohort?: number | null }[]).map((x) => [x.id, x]));
  return rows
    .map((r) => ({
      id: r.id as number,
      memberId: r.member_id as number,
      name: info.get(r.member_id as number)?.name ?? "?",
      rank: info.get(r.member_id as number)?.rank ?? null,
      cohort: info.get(r.member_id as number)?.cohort ?? null,
    }))
    .sort((a, b) => (a.cohort ?? 99999) - (b.cohort ?? 99999) || a.name.localeCompare(b.name, "ko"));
}

// ─────────────────────────────────────────────────────────────
// 관리자 안내용
// ─────────────────────────────────────────────────────────────

// 투표가 모두 마감됐는데 아직 한 달 차출을 하지 않은 달 (다음 달 ~ 3달 뒤까지 확인)
export async function getPendingMonths(today: string, now: Date = new Date()): Promise<string[]> {
  const out: string[] = [];
  const [y, m] = today.slice(0, 7).split("-").map(Number);
  // 다음 달부터 확인: 이번 달 근무일은 예전 주간 투표로 이미 운영됐으므로 한 달 차출 대상으로 안내하지 않음
  for (let i = 1; i <= 3; i++) {
    const t = y * 12 + (m - 1) + i;
    const month = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
    const st = await getMonthStatus(month, now);
    if (!st.executedAt && st.days.length > 0 && st.stillVoting.length === 0 && st.undrawn.some((d) => d >= today)) out.push(month);
  }
  return out;
}

export type RosterConflict = { date: string; memberId: number; name: string; post: string; reason: string };

// 확정 명단 충돌: 이미 확정된 사람인데 그날 출근할 수 없게 된 경우 (확정 뒤에 휴가·교육·부상 등을 입력함)
//   자동으로 바꾸지 않고 관리자에게 알리기만 합니다. 교체는 [명단 수정]에서 수동으로 합니다.
export async function getRosterConflicts(today: string, days = 70): Promise<RosterConflict[]> {
  const to = addDays(today, days);
  const db = getSupabaseAdmin();
  const [{ data: asg }, { data: abs }, { data: posts }, { data: duties }] = await Promise.all([
    db.from("assignments").select("duty_date, member_id, post_id").gte("duty_date", today).lte("duty_date", to),
    db.from("absences").select("member_id, kind, start_date, end_date").lte("start_date", to).gte("end_date", today),
    db.from("posts").select("id, name, pool"),
    db.from("drive_duties").select("member_id, start_date, end_date").lte("start_date", to).gte("end_date", today),
  ]);
  const postInfo = new Map((posts ?? []).map((p) => [p.id as number, { name: p.name as string, pool: p.pool as string }]));
  const rows = (asg ?? []).filter((a) => {
    const pool = postInfo.get(a.post_id as number)?.pool;
    return pool === "clinic" || pool === "general"; // 운전·선탑은 제외 판정이 달라서 동·진료실만 확인
  });
  if (rows.length === 0) return [];
  const driveOn = (id: number, date: string) => (duties ?? []).some((d) => d.member_id === id && d.start_date <= date && d.end_date >= date);
  const found: RosterConflict[] = [];
  for (const a of rows) {
    const date = a.duty_date as string;
    const id = a.member_id as number;
    const hit = (abs ?? []).find((x) => x.member_id === id && x.start_date <= date && x.end_date >= date);
    const reason = hit ? (KIND_LABEL[hit.kind as string] ?? (hit.kind as string)) : driveOn(id, date) ? "운전 지정" : null;
    if (reason) found.push({ date, memberId: id, name: "", post: postInfo.get(a.post_id as number)?.name ?? "", reason });
  }
  if (found.length === 0) return [];
  const { data: names } = await db.from("members").select("id, name").in("id", [...new Set(found.map((f) => f.memberId))]);
  const nameOf = new Map((names ?? []).map((m) => [m.id as number, m.name as string]));
  return found.map((f) => ({ ...f, name: nameOf.get(f.memberId) ?? "?" })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// 순번 현황 (순번표별)
export async function getRotationBoards() {
  const [members, state] = await Promise.all([loadMembers(), loadRotationState()]);
  const db = getSupabaseAdmin();
  const { data: names } = await db.from("members").select("id, name, rank").eq("is_active", true);
  const info = new Map((names ?? []).map((m) => [m.id as number, { name: m.name as string, rank: (m.rank as string | null) ?? null }]));
  const poolMembers: Record<RotPool, MMember[]> = {
    general: members.filter((m) => !m.clinic),
    clinic: members.filter((m) => m.clinic),
    driver: members.filter((m) => m.driver),
  };
  return POOLS.map((pool) => ({ pool, board: rotationBoard(poolMembers[pool], state[pool].log, state[pool].cycle), info, cohortOf: new Map(members.map((m) => [m.id, m.cohort])) }));
}
