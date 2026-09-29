"use server";
// ─────────────────────────────────────────────────────────────
// 인원 일괄 등록 서버 액션 (관리자 전용)
//  1) 목록 글을 읽어 검사 (형식 오류가 하나라도 있으면 아무것도 등록하지 않음)
//  2) 이미 등록된 이름과 겹치는지 확인
//  3) 빈 비밀번호는 6자리 숫자로 자동 생성
//  4) 비밀번호는 해시로 바꿔서 한 번에 저장 (모두 첫 로그인 시 비밀번호 변경 필요)
//  5) 이름 + 초기 비밀번호 목록을 화면에 한 번만 돌려줌 (서버에는 원문을 저장하지 않음)
// ─────────────────────────────────────────────────────────────
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { generateInitialPassword, hashPassword } from "@/lib/password";
import { parseMemberTable } from "@/lib/member-import";
import { writeAudit } from "@/lib/audit";

export type ImportState = {
  errors?: string[];
  created?: { name: string; password: string; generated: boolean; isClinic: boolean; isAdmin: boolean }[];
};

export async function importMembersAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const me = await requireAdmin(); // 관리자가 아니면 여기서 막힘
  const text = String(formData.get("table") ?? "");

  // 1) 형식 검사
  const { rows, errors } = parseMemberTable(text);
  if (errors.length > 0) return { errors };

  // 2) 이미 있는 이름 확인
  const db = getSupabaseAdmin();
  const { data: existing, error: selectError } = await db
    .from("members")
    .select("name")
    .in("name", rows.map((r) => r.name));
  if (selectError) return { errors: ["서버 오류: " + selectError.message] };
  if (existing && existing.length > 0) {
    return {
      errors: existing.map(
        (e) => `"${e.name}" 은(는) 이미 등록된 이름입니다. 다른 표시 이름(예: ${e.name}B)을 쓰거나 목록에서 빼 주세요.`,
      ),
    };
  }

  // 3) 비밀번호 준비 + 4) 해시로 변환
  const prepared = rows.map((r) => {
    const generated = r.password === "";
    return { ...r, password: generated ? generateInitialPassword() : r.password, generated };
  });
  const records = await Promise.all(
    prepared.map(async (r) => ({
      name: r.name,
      password_hash: await hashPassword(r.password),
      is_clinic: r.isClinic,
      is_admin: r.isAdmin,
      must_change_password: true,
    })),
  );

  // 한 번에 저장 (하나라도 실패하면 전체가 저장되지 않음)
  const { data: inserted, error: insertError } = await db.from("members").insert(records).select("id, name");
  if (insertError) return { errors: ["저장 중 오류: " + insertError.message] };

  await writeAudit({
    actorId: me.id,
    action: "member.import",
    details: {
      count: inserted?.length ?? 0,
      members: prepared.map((r) => ({ name: r.name, is_clinic: r.isClinic, is_admin: r.isAdmin })),
    },
  });

  // 아래쪽 "현재 등록된 인원" 목록이 새로 등록한 사람까지 보이도록 화면을 새로 그리게 함
  revalidatePath("/admin/members/import");

  // 5) 화면에 결과 표시용 (이 응답 이후에는 서버 어디에도 원문 비밀번호가 남지 않음)
  return {
    created: prepared.map((r) => ({
      name: r.name,
      password: r.password,
      generated: r.generated,
      isClinic: r.isClinic,
      isAdmin: r.isAdmin,
    })),
  };
}
