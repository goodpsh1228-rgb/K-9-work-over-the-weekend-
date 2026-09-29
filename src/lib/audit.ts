// ─────────────────────────────────────────────────────────────
// 변경 이력(audit_logs) 기록 도구
// "누가(actorId) · 무엇을(action) · 누구에게(targetMemberId) · 어떻게(details)" 를 남깁니다.
// 언제(created_at)는 데이터베이스가 자동으로 채웁니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function writeAudit(entry: {
  actorId: number | null; // null = 시스템 / 비상 복구
  action: string; // 예: "member.import", "auth.password_change"
  targetMemberId?: number | null;
  dutyDate?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await getSupabaseAdmin().from("audit_logs").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_member_id: entry.targetMemberId ?? null,
    duty_date: entry.dutyDate ?? null,
    details: entry.details ?? {},
  });
  // 이력 저장 실패가 본 작업을 막지는 않도록, 서버 기록(로그)에만 남깁니다.
  if (error) console.error("변경 이력 저장 실패:", error.message);
}
