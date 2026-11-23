// ─────────────────────────────────────────────────────────────
// 간부 계정 (서버 전용)
//   간부 = 관리자 기능을 쓸 수 있는 계정이지만, 본인은 주말출근·순번·기수·전역일·휴가 계산기의 대상이 아닙니다.
//   그래서 투표·추첨·순번·라인업 인원·통계·반별 휴가 TO 같은 "인원 목록"에서는 간부를 빼야 합니다.
//   SQL 0023(is_officer 칸)을 실행하기 전에는 오류가 나므로, 그때는 "간부 없음"으로 봅니다.
// ─────────────────────────────────────────────────────────────
import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const getOfficerIds = cache(async (): Promise<Set<number>> => {
  const { data, error } = await getSupabaseAdmin().from("members").select("id").eq("is_officer", true);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => r.id as number));
});

// 목록에서 간부를 뺌 (id 칸 이름이 다른 목록은 key 로 지정)
export async function withoutOfficers<T extends Record<string, unknown>>(rows: T[] | null | undefined, key: keyof T = "id" as keyof T): Promise<T[]> {
  const officers = await getOfficerIds();
  if (officers.size === 0) return rows ?? [];
  return (rows ?? []).filter((r) => !officers.has(r[key] as number));
}
