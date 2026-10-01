// ─────────────────────────────────────────────────────────────
// 입대일·전역일에 따른 자동 처리 (서버 전용)
//   ① 계급 자동 진급: 입대일이 있는 사람은 오늘 날짜의 계급으로 맞춤 (매월 1일 진급)
//   ② 전역 자동 비활성화: 전역일이 오늘이거나 지났으면 비활성화
//      (단, 마지막 관리자는 관리자 0명이 되지 않도록 남겨 둠)
// 사이트 접속 때(안전장치)와 밤 자동 실행(크론) 때 불립니다.
// 너무 자주 돌지 않도록 서버 한 대에서 10분에 한 번만 실행합니다(force 로 즉시 실행 가능).
// ─────────────────────────────────────────────────────────────
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { todayKST } from "@/lib/kst";
import { rankOn } from "@/lib/promotion";

let lastRun = 0;

export async function syncServiceStatus(options?: { force?: boolean }) {
  if (!options?.force && Date.now() - lastRun < 10 * 60 * 1000) return;
  lastRun = Date.now();
  const db = getSupabaseAdmin();
  const today = todayKST();
  const { data: rows, error } = await db
    .from("members")
    .select("id, name, rank, enlist_date, discharge_date, is_admin, session_version")
    .eq("is_active", true)
    .or("enlist_date.not.is.null,discharge_date.not.is.null");
  if (error || !rows) return; // SQL 0009 전이면 칸이 없음 → 아무것도 안 함

  // ① 계급 자동 진급
  for (const m of rows) {
    if (!m.enlist_date) continue;
    const rank = rankOn(m.enlist_date, today);
    if (rank !== m.rank) {
      await db.from("members").update({ rank }).eq("id", m.id);
      await writeAudit({ actorId: null, action: "member.rank_auto", targetMemberId: m.id, details: { name: m.name, from: m.rank, to: rank } });
    }
  }

  // ② 전역 자동 비활성화
  const discharged = rows.filter((m) => m.discharge_date && m.discharge_date <= today);
  if (discharged.length === 0) return;
  const { count: adminCount } = await db
    .from("members")
    .select("id", { head: true, count: "exact" })
    .eq("is_admin", true)
    .eq("is_active", true);
  let admins = adminCount ?? 0;
  for (const m of discharged) {
    if (m.is_admin) {
      if (admins <= 1) continue; // 마지막 관리자는 남김 (관리자 0명 방지)
      admins--;
    }
    await db.from("members").update({ is_active: false, session_version: m.session_version + 1 }).eq("id", m.id);
    await writeAudit({ actorId: null, action: "member.deactivate", targetMemberId: m.id, details: { name: m.name, reason: "전역" } });
  }
}

// 오류가 나도 화면은 계속 뜨도록
export async function syncServiceStatusSafely(options?: { force?: boolean }) {
  try {
    await syncServiceStatus(options);
  } catch (e) {
    console.error("계급·전역 자동 처리 실패:", e);
  }
}
