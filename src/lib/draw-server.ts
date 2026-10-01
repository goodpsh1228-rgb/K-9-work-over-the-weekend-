// ─────────────────────────────────────────────────────────────
// 추첨 실행 · 결과 조회 (서버 전용)
//   - 추첨 입력 모으기: 그날 자리·정원, 대상 인원(활성 + 제외 아님), 응답
//   - 서버의 암호학적 난수(crypto.randomInt)로 추첨
//   - record_draw 함수로 "한 번에, 딱 한 번만" 저장 (여러 번 불러도 결과는 하나 = 멱등성)
// ─────────────────────────────────────────────────────────────
import "server-only";
import { randomInt } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { computeDutyDays } from "@/lib/duty-days";
import { getFridayChecker, getOverrides, getVoteInfo } from "@/lib/duty-days-server";
import { votingStatus } from "@/lib/voting";
import { addDays, isValidDate, todayKST } from "@/lib/kst";
import { writeAudit } from "@/lib/audit";
import { getDriverIds, getDriveWants } from "@/lib/drivers";
import { syncServiceStatusSafely } from "@/lib/service-sync";
import { runDraw, type DrawInput, type DrawResult } from "@/lib/draw";

export type Trigger = "cron" | "visit" | "manual";

// 추첨 입력 모으기 (실제 추첨과 관리자 미리보기가 같이 씀)
export async function buildDrawInput(date: string): Promise<DrawInput> {
  const db = getSupabaseAdmin();
  const [allPosts, excluded, drivers, driveWants, { data: members }, { data: responses }] = await Promise.all([
    getPostsForDate(date),
    getExcludedIds(date),
    getDriverIds(),
    getDriveWants(date),
    db.from("members").select("id, is_clinic").eq("is_active", true),
    db.from("responses").select("member_id, choice, post_id").eq("duty_date", date),
  ]);
  // 0007 SQL 전이면(운전 희망 표 없음) 운전 자리는 빼고 추첨 (동+운전 중복 저장이 안 되므로)
  // 선탑(escort)은 추첨하지 않음 (추첨 후 관리자가 지정)
  const drawable = allPosts.filter((p): p is typeof p & { pool: "clinic" | "general" | "driver" } => p.pool !== "escort");
  const posts = driveWants.ok ? drawable : drawable.filter((p) => p.pool !== "driver");
  return {
    driveWants: driveWants.ids,
    posts: posts.map((p) => ({ id: p.id, pool: p.pool, required: p.required })),
    members: (members ?? [])
      .filter((m) => !excluded.has(m.id)) // 제외자(휴가·부상)는 어떤 풀에도 넣지 않음
      .map((m) => ({ id: m.id as number, pool: m.is_clinic ? "clinic" : "general", driver: drivers.has(m.id) })),
    responses: new Map(
      (responses ?? []).map((r) => [r.member_id as number, { choice: r.choice, postId: r.post_id as number | null }]),
    ),
  };
}

// 서버 난수: 0 이상 n 미만의 정수 (예측 불가능한 암호학적 난수)
const secureRng = (n: number) => randomInt(n);

export function simulateDraw(input: DrawInput): DrawResult {
  return runDraw(input, secureRng);
}

export type ExecuteResult =
  | { status: "done"; result: DrawResult }
  | { status: "already" } // 이미 추첨됨 (다른 곳에서 먼저 실행)
  | { status: "not-ready"; reason: string }; // 근무일이 아니거나 아직 마감 전

// 추첨 실행: 마감이 지난 근무일만, 한 번만.
export async function executeDraw(date: string, trigger: Trigger, actorId: number | null): Promise<ExecuteResult> {
  if (!isValidDate(date)) return { status: "not-ready", reason: "잘못된 날짜" };
  if (computeDutyDays(date, date, await getOverrides(date, date)).length === 0) {
    return { status: "not-ready", reason: "근무일이 아닙니다." };
  }
  if ((await getVoteInfo(date)).overall !== "closed") return { status: "not-ready", reason: "아직 투표 마감 전입니다." };
  if (await getDraw(date)) return { status: "already" };

  const result = simulateDraw(await buildDrawInput(date));
  const { data: saved, error } = await getSupabaseAdmin().rpc("record_draw", {
    p_duty_date: date,
    p_triggered_by: trigger,
    p_executed_by: actorId,
    p_clinic_shortage: result.shortage.clinic,
    p_general_shortage: result.shortage.general + result.shortage.driver, // 운전 부족은 "일반" 부족에 합쳐 저장
    p_assignments: result.assignments.map((a) => ({ member_id: a.memberId, post_id: a.postId, source: a.source })),
  });
  if (error) throw new Error("추첨 저장 실패: " + error.message);
  if (saved !== true) return { status: "already" }; // 동시에 두 곳에서 실행 → 먼저 저장한 쪽만 인정

  await writeAudit({
    actorId,
    action: "draw.run",
    dutyDate: date,
    details: { trigger, shortage: result.shortage, assigned: result.assignments.length, rested: result.rested },
  });
  return { status: "done", result };
}

// 추첨 기록 (없으면 null)
export async function getDraw(date: string) {
  const { data } = await getSupabaseAdmin()
    .from("draws")
    .select("duty_date, triggered_by, executed_at, clinic_shortage, general_shortage")
    .eq("duty_date", date)
    .maybeSingle();
  return data as
    | { duty_date: string; triggered_by: Trigger; executed_at: string; clinic_shortage: number; general_shortage: number }
    | null;
}

export type RosterEntry = { memberId: number; name: string; rank: string | null; postId: number; source: "wanted" | "drafted" | "admin" };

// 확정 명단 (이름 포함)
export async function getRoster(date: string): Promise<RosterEntry[]> {
  const db = getSupabaseAdmin();
  const [{ data: rows }, { data: members }] = await Promise.all([
    db.from("assignments").select("member_id, post_id, source").eq("duty_date", date),
    db.from("members").select("id, name, rank"),
  ]);
  const nameOf = new Map((members ?? []).map((m) => [m.id as number, m.name as string]));
  const rankOf = new Map((members ?? []).map((m) => [m.id as number, (m.rank as string | null) ?? null]));
  return (rows ?? [])
    .map((r) => ({
      memberId: r.member_id as number,
      name: nameOf.get(r.member_id) ?? "?",
      rank: rankOf.get(r.member_id) ?? null,
      postId: r.post_id as number,
      source: r.source as RosterEntry["source"],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

// ─────────────────────────────────────────────────────────────
// 자동 추첨: 투표가 마감됐는데 아직 추첨하지 않은 근무일을 모두 찾아 추첨합니다.
//   - 정기 실행(크론), 접속 시 안전장치가 이 함수를 부릅니다.
//   - 오늘(한국 날짜) 이후의 근무일만 대상 (이미 지나간 날은 추첨하지 않음)
//   - 여러 곳에서 동시에 불려도 executeDraw 가 날짜마다 한 번만 저장하므로 안전합니다.
// ─────────────────────────────────────────────────────────────
const LOOKAHEAD_DAYS = 14; // 투표 주의 대상은 최대 월요일+10일이므로 넉넉히 2주

export async function runPendingDraws(trigger: Trigger) {
  const from = todayKST();
  const to = addDays(from, LOOKAHEAD_DAYS);
  const days = computeDutyDays(from, to, await getOverrides(from, to));
  const fridayIsDuty = await getFridayChecker(from, to);
  const now = new Date();
  const closed = days.map((d) => d.date).filter((d) => votingStatus(d, fridayIsDuty(d), now) === "closed");
  if (closed.length === 0) return { checked: 0, drawn: [] as string[] };

  // 이미 추첨된 날은 한 번에 조회해서 건너뜀
  const { data: done } = await getSupabaseAdmin().from("draws").select("duty_date").in("duty_date", closed);
  const doneSet = new Set((done ?? []).map((r) => r.duty_date as string));
  const drawn: string[] = [];
  for (const date of closed.filter((d) => !doneSet.has(d))) {
    const r = await executeDraw(date, trigger, null);
    if (r.status === "done") drawn.push(date);
  }
  return { checked: closed.length, drawn };
}

// 화면을 열 때 쓰는 안전장치: 실패해도 화면은 정상적으로 보이도록 오류를 삼킵니다.
export async function runPendingDrawsSafely() {
  await syncServiceStatusSafely(); // 계급 자동 진급·전역 자동 비활성화 (추첨 전에 먼저)
  try {
    await runPendingDraws("visit");
  } catch (e) {
    console.error("접속 시 자동 추첨 실패:", e);
  }
}
