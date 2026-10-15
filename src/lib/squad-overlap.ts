// ─────────────────────────────────────────────────────────────
// 같은 반 사람들의 휴가와 내 휴가 계획이 겹치는지 찾기 (서버 전용)
//   - 같은 반 = 반이 같은 활성 인원 (반이 비어 있으면 진료반 여부로 판단)
//   - 겹침 대상: 같은 반 다른 사람의 휴가(확정) + 휴가 계획 (오늘 이후)
//   - 반이 없는 사람은 비교 대상이 없음
// ─────────────────────────────────────────────────────────────
import { getSupabaseAdmin } from "./supabase-server";
import { LEAVE_KINDS } from "./leave";
import { effectiveSquad, spansOverlap, type Squad } from "./squads";
import { todayKST } from "./kst";

export type MateLeave = { id: number; name: string; rank: string | null; start: string; end: string; planned: boolean };

export async function getSquadmateLeaves(meId: number): Promise<{ squad: Squad | null; leaves: MateLeave[]; supported: boolean }> {
  const db = getSupabaseAdmin();
  const mem = await db.from("members").select("id, name, rank, squad, is_clinic").eq("is_active", true);
  if (mem.error) return { squad: null, leaves: [], supported: false }; // SQL 0015 전
  const all = (mem.data ?? []) as { id: number; name: string; rank: string | null; squad: string | null; is_clinic: boolean }[];
  const mine = all.find((m) => m.id === meId);
  const squad = mine ? effectiveSquad(mine.squad, mine.is_clinic) : null;
  if (!squad) return { squad: null, leaves: [], supported: true };
  const mates = new Map(all.filter((m) => m.id !== meId && effectiveSquad(m.squad, m.is_clinic) === squad).map((m) => [m.id, m]));
  if (mates.size === 0) return { squad, leaves: [], supported: true };
  const fullKinds = LEAVE_KINDS.filter((k) => k.isLeave).map((k) => k.value);
  let lv = await db.from("leaves").select("member_id, start_date, end_date, planned").in("member_id", [...mates.keys()]).in("kind", fullKinds).gte("end_date", todayKST());
  if (lv.error) lv = (await db.from("leaves").select("member_id, start_date, end_date").in("member_id", [...mates.keys()]).in("kind", fullKinds).gte("end_date", todayKST())) as typeof lv;
  const leaves = ((lv.data ?? []) as { member_id: number; start_date: string; end_date: string; planned?: boolean }[]).map((l) => {
    const m = mates.get(l.member_id)!;
    return { id: m.id, name: m.name, rank: m.rank, start: l.start_date, end: l.end_date, planned: l.planned === true };
  });
  return { squad, leaves, supported: true };
}

// 내 기간과 겹치는 같은 반 휴가 목록
export const overlapsWith = (mine: { start: string; end: string }, leaves: MateLeave[]) => leaves.filter((l) => spansOverlap(mine, l));
