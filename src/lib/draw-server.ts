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
import { getOverrides, getVoteInfo } from "@/lib/duty-days-server";
import { isValidDate } from "@/lib/kst";
import { writeAudit } from "@/lib/audit";
import { runDraw, type DrawInput, type DrawResult } from "@/lib/draw";

export type Trigger = "cron" | "visit" | "manual";

// 추첨 입력 모으기 (실제 추첨과 관리자 미리보기가 같이 씀)
export async function buildDrawInput(date: string): Promise<DrawInput> {
  const db = getSupabaseAdmin();
  const [posts, excluded, { data: members }, { data: responses }] = await Promise.all([
    getPostsForDate(date),
    getExcludedIds(date),
    db.from("members").select("id, is_clinic").eq("is_active", true),
    db.from("responses").select("member_id, choice, post_id").eq("duty_date", date),
  ]);
  return {
    posts: posts.map((p) => ({ id: p.id, pool: p.pool, required: p.required })),
    members: (members ?? [])
      .filter((m) => !excluded.has(m.id)) // 제외자(휴가·부상)는 어떤 풀에도 넣지 않음
      .map((m) => ({ id: m.id as number, pool: m.is_clinic ? "clinic" : "general" })),
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
    p_general_shortage: result.shortage.general,
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

export type RosterEntry = { memberId: number; name: string; postId: number; source: "wanted" | "drafted" | "admin" };

// 확정 명단 (이름 포함)
export async function getRoster(date: string): Promise<RosterEntry[]> {
  const db = getSupabaseAdmin();
  const [{ data: rows }, { data: members }] = await Promise.all([
    db.from("assignments").select("member_id, post_id, source").eq("duty_date", date),
    db.from("members").select("id, name"),
  ]);
  const nameOf = new Map((members ?? []).map((m) => [m.id as number, m.name as string]));
  return (rows ?? [])
    .map((r) => ({
      memberId: r.member_id as number,
      name: nameOf.get(r.member_id) ?? "?",
      postId: r.post_id as number,
      source: r.source as RosterEntry["source"],
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}
