// ─────────────────────────────────────────────────────────────
// 운전병 목록 (서버 전용)
//   members.is_driver 칸(0006 SQL)이 아직 없으면 오류 대신 "운전병 없음"으로 처리해서
//   SQL 실행 전에 새 코드가 배포되어도 사이트가 멈추지 않게 합니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const getDriverIds = cache(async (): Promise<Set<number>> => {
  const { data, error } = await getSupabaseAdmin().from("members").select("id").eq("is_driver", true);
  if (error) {
    console.error("운전병 목록 읽기 실패(0006 SQL 실행 전?):", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((m) => m.id as number));
});
