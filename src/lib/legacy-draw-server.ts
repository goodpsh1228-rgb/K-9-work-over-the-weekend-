// ─────────────────────────────────────────────────────────────
// 예전 방식(랜덤) 차출 — 이번 달(11월)까지만 사용 (서버 전용)
//   순번제 전환(2026-11-23) 전에 주간 투표로 운영된 날(이번 달 근무일)을 위해 남겨 둔 기능입니다.
//   다음 달부터는 순번제 [한 달 차출](monthly-draw-server.ts)을 씁니다.
//   · 마감이 지난 날만, 한 번만 실행 (record_draw 함수가 중복을 막음)
//   · 서버의 암호학적 난수로 추첨, 추첨과 함께 선탑도 자동 지정
// ─────────────────────────────────────────────────────────────
import "server-only";
import { randomInt } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { computeDutyDays } from "@/lib/duty-days";
import { getOverrides, getVoteInfo } from "@/lib/duty-days-server";
import { isValidDate, todayKST } from "@/lib/kst";
import { writeAudit } from "@/lib/audit";
import { getDriverIds, getDriveWants, getDriverIdsOn } from "@/lib/drivers";
import { autoAssignEscort, type EscortResult } from "@/lib/escort-server";
import { runDraw, type DrawInput, type DrawResult } from "@/lib/draw";
import { getDraw, type Trigger } from "@/lib/draw-server";

// 예전 방식을 쓸 수 있는 날: 이번 달 이전(이번 달 포함) 근무일
export function isLegacyDrawDate(date: string): boolean {
  return date.slice(0, 7) <= todayKST().slice(0, 7);
}

// 추첨 입력 모으기 (실제 추첨과 관리자 미리보기가 같이 씀)
export async function buildDrawInput(date: string): Promise<DrawInput> {
  const db = getSupabaseAdmin();
  const [allPosts, excluded, drivers, driveWants, designatedNow, { data: members }, { data: responses }] = await Promise.all([
    getPostsForDate(date),
    getExcludedIds(date), // 휴가·부상 등 + 그날 운전이 지정된 운전병
    getDriverIds(),
    getDriveWants(date),
    getDriverIdsOn(date), // 운전 지정(/drive)
    // 반(squad) 칸(SQL 0015)이 있으면 같이 읽음 — 없으면 진료반 여부만
    db.from("members").select("id, is_clinic, squad").eq("is_active", true).then(async (r) => (r.error ? await db.from("members").select("id, is_clinic").eq("is_active", true) : r)),
    db.from("responses").select("member_id, choice, post_id").eq("duty_date", date),
  ]);
  // 0007 SQL 전이면(운전 희망 표 없음) 운전 자리는 빼고 추첨 (동+운전 중복 저장이 안 되므로)
  // 선탑(escort)은 추첨하지 않음 (추첨 후 관리자가 지정)
  const drawable = allPosts.filter((p): p is typeof p & { pool: "clinic" | "general" | "driver" } => p.pool !== "escort");
  const posts = driveWants.ok ? drawable : drawable.filter((p) => p.pool !== "driver");
  const activeIds = new Set((members ?? []).map((m) => m.id as number));
  return {
    driveWants: driveWants.ids,
    designated: [...designatedNow.ids].filter((id) => drivers.has(id) && activeIds.has(id)), // 지정된 활성 운전병은 "주말 운전" 자리를 먼저 채움
    posts: posts.map((p) => ({ id: p.id, pool: p.pool, required: p.required })),
    members: (members ?? [])
      .filter((m) => !excluded.has(m.id)) // 제외자(휴가·부상, 운전 지정자)는 동·진료실 풀에 넣지 않음
      // 진료반(진료반 여부 또는 반이 "진료반")은 진료실 풀에만 → 투표를 안 해도 다른 동으로는 절대 차출되지 않음
      .map((m) => ({ id: m.id as number, pool: m.is_clinic || (m as { squad?: string | null }).squad === "진료반" ? "clinic" : "general", driver: drivers.has(m.id) })),
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
  | { status: "done"; result: DrawResult; escort: EscortResult } // escort = 추첨과 함께 자동으로 정해진 선탑 결과
  | { status: "already" } // 이미 추첨됨 (다른 곳에서 먼저 실행)
  | { status: "not-ready"; reason: string }; // 근무일이 아니거나 아직 마감 전

// 추첨 실행: 마감이 지난 근무일만, 한 번만.
export async function executeDraw(date: string, trigger: Trigger, actorId: number | null): Promise<ExecuteResult> {
  if (!isValidDate(date)) return { status: "not-ready", reason: "잘못된 날짜" };
  if (!isLegacyDrawDate(date)) return { status: "not-ready", reason: "다음 달부터는 순번제입니다. 관리자 메뉴의 [한 달 차출]을 이용해 주세요." };
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

  // 선탑: 운전병보다 기수가 같거나 높은 출근자 중 랜덤 1명 (못 정해도 추첨 결과는 그대로, 관리자가 나중에 다시 뽑을 수 있음)
  const escort: EscortResult = await autoAssignEscort(date, actorId, "draw").catch((e) => {
    console.error("선탑 자동 지정 실패:", e);
    return { ok: false as const, message: "선탑 자동 지정 중 오류가 났습니다. 관리자 화면에서 다시 뽑아 주세요." };
  });

  await writeAudit({
    actorId,
    action: "draw.run",
    dutyDate: date,
    details: { trigger, shortage: result.shortage, assigned: result.assignments.length, rested: result.rested },
  });
  return { status: "done", result, escort };
}

