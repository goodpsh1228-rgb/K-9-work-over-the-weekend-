// ─────────────────────────────────────────────────────────────
// 근무일 현황판 데이터 (서버 전용)
//   한 근무일에 대해 다음을 모아 줍니다.
//   - 자리(진료실·각 동)별 정원과 희망자 이름
//   - 미희망자, 제외자(휴가·부상), 미응답자
//   - 로그인한 사람 본인의 상태
// 모든 인원 목록은 "활성" 인원만 대상입니다 (비활성 = 전출·전역).
// ─────────────────────────────────────────────────────────────
import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getDriveWants } from "@/lib/drivers";

export type PostSlot = {
  id: number;
  name: string;
  pool: "clinic" | "general" | "driver";
  required: number; // 그날 필요 인원 (날짜별 설정이 있으면 그 값)
  wanters: { id: number; name: string }[]; // 이 자리를 희망한 사람
};

export type MemberLite = { id: number; name: string; is_clinic: boolean };

export type DayBoard = {
  date: string;
  posts: PostSlot[];
  declines: MemberLite[]; // 미희망
  excluded: MemberLite[]; // 제외 (휴가·부상)
  unanswered: MemberLite[]; // 미응답
};

export type MyState =
  | { kind: "excluded" }
  | { kind: "want"; postId: number; postName: string }
  | { kind: "decline" }
  | { kind: "none" };

// 그날의 자리 목록과 필요 인원 (기본값 + 날짜별 설정)
export const getPostsForDate = cache(async (date: string) => {
  const db = getSupabaseAdmin();
  const [{ data: posts }, { data: counts }] = await Promise.all([
    db.from("posts").select("id, name, pool, default_count, sort_order").eq("is_active", true).order("sort_order"),
    db.from("duty_day_post_counts").select("post_id, required_count").eq("duty_date", date),
  ]);
  const custom = new Map((counts ?? []).map((c) => [c.post_id as number, c.required_count as number]));
  return (posts ?? []).map((p) => ({
    id: p.id as number,
    name: p.name as string,
    pool: p.pool as "clinic" | "general" | "driver",
    required: custom.get(p.id) ?? (p.default_count as number),
  }));
});

// 그날 제외(휴가·부상 기간에 걸침)인 인원 번호 목록
export const getExcludedIds = cache(async (date: string): Promise<Set<number>> => {
  const { data } = await getSupabaseAdmin()
    .from("absences")
    .select("member_id")
    .lte("start_date", date)
    .gte("end_date", date);
  return new Set((data ?? []).map((a) => a.member_id as number));
});

export async function getDayBoard(date: string): Promise<DayBoard> {
  const db = getSupabaseAdmin();
  const [posts, excludedIds, driveWants, { data: members }, { data: responses }] = await Promise.all([
    getPostsForDate(date),
    getExcludedIds(date),
    getDriveWants(date),
    db.from("members").select("id, name, is_clinic").eq("is_active", true).order("name"),
    db.from("responses").select("member_id, choice, post_id").eq("duty_date", date),
  ]);

  const active = (members ?? []) as MemberLite[];
  const byId = new Map(active.map((m) => [m.id, m]));
  const responded = new Set<number>();
  const slots: PostSlot[] = posts.map((p) => ({ ...p, wanters: [] }));
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const declines: MemberLite[] = [];

  for (const r of responses ?? []) {
    const m = byId.get(r.member_id as number);
    if (!m || excludedIds.has(m.id)) continue; // 비활성 인원·제외자의 응답은 세지 않음
    responded.add(m.id);
    if (r.choice === "want") slotById.get(r.post_id as number)?.wanters.push({ id: m.id, name: m.name });
    else declines.push(m);
  }
  // 주말 운전 희망자 (동 응답과 따로 — 미응답 목록에는 영향 없음)
  for (const slot of slots.filter((s) => s.pool === "driver")) {
    for (const id of driveWants.ids) {
      const m = byId.get(id);
      if (m && !excludedIds.has(m.id)) slot.wanters.push({ id: m.id, name: m.name });
    }
  }

  return {
    date,
    posts: slots,
    declines,
    excluded: active.filter((m) => excludedIds.has(m.id)),
    unanswered: active.filter((m) => !excludedIds.has(m.id) && !responded.has(m.id)),
  };
}

// 보드에서 특정 인원의 상태 찾기
export function myStateFrom(board: DayBoard, memberId: number): MyState {
  if (board.excluded.some((m) => m.id === memberId)) return { kind: "excluded" };
  for (const p of board.posts) {
    if (p.pool === "driver") continue; // 운전 희망은 동 상태와 따로
    if (p.wanters.some((w) => w.id === memberId)) return { kind: "want", postId: p.id, postName: p.name };
  }
  if (board.declines.some((m) => m.id === memberId)) return { kind: "decline" };
  return { kind: "none" };
}

// 홈 화면용: 여러 날짜에 대한 "내 상태"를 한 번에
export async function getMyStates(memberId: number, from: string, to: string) {
  const db = getSupabaseAdmin();
  const [{ data: responses }, { data: absences }, { data: posts }] = await Promise.all([
    db.from("responses").select("duty_date, choice, post_id").eq("member_id", memberId).gte("duty_date", from).lte("duty_date", to),
    db.from("absences").select("start_date, end_date").eq("member_id", memberId).lte("start_date", to).gte("end_date", from),
    db.from("posts").select("id, name"),
  ]);
  const postName = new Map((posts ?? []).map((p) => [p.id as number, p.name as string]));
  const resp = new Map((responses ?? []).map((r) => [r.duty_date as string, r]));
  return (date: string): MyState => {
    if ((absences ?? []).some((a) => a.start_date <= date && date <= a.end_date)) return { kind: "excluded" };
    const r = resp.get(date);
    if (!r) return { kind: "none" };
    if (r.choice === "want") return { kind: "want", postId: r.post_id, postName: postName.get(r.post_id) ?? "" };
    return { kind: "decline" };
  };
}
