"use server";
// ─────────────────────────────────────────────────────────────
// 홈 화면 서버 액션 — 내 계급 변경 (본인)
//   입대일이 있어 자동 진급 중이어도 직접 바꿀 수 있고, 바꾼 계급은 다음 진급일(매월 1일)까지 유지됩니다.
//   진급했을 때 각자 바꿀 수 있게 합니다. 변경 이력에 "계급 변경(본인)"으로 남습니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { writeAudit } from "@/lib/audit";
import { RANKS } from "@/lib/voting";
import { setRankManually } from "@/lib/service-sync";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function updateMyRankAction(formData: FormData) {
  const me = await requireMember();
  const rank = String(formData.get("rank") ?? "");
  if (!RANKS.includes(rank as (typeof RANKS)[number])) {
    redirect(`/home?error=${encodeURIComponent("계급을 다시 선택해 주세요.")}`);
  }
  if (rank !== me.rank) {
    await setRankManually(me.id, rank);
    await writeAudit({ actorId: me.id, action: "member.rank_self", targetMemberId: me.id, details: { name: me.name, from: me.rank, to: rank } });
  }
  revalidatePath("/home");
  redirect(`/home?msg=${encodeURIComponent(`계급을 ${rank}(으)로 저장했습니다.`)}`);
}

// 내 기수 입력·수정 (본인). 숫자가 작을수록 높은 기수(866기 > 877기). 비우면 기수 삭제.
export async function updateMyCohortAction(formData: FormData) {
  const me = await requireMember();
  const raw = String(formData.get("cohort") ?? "").trim();
  const cohort = raw === "" ? null : Number(raw);
  if (cohort !== null && (!Number.isInteger(cohort) || cohort < 1 || cohort > 9999)) {
    redirect(`/home?error=${encodeURIComponent("기수는 1~9999 사이 숫자로 입력해 주세요.")}`);
  }
  const { error } = await getSupabaseAdmin().from("members").update({ cohort }).eq("id", me.id);
  if (error) redirect(`/home?error=${encodeURIComponent("기수 기능용 SQL(0015)을 관리자가 먼저 실행해야 합니다.")}`);
  await writeAudit({ actorId: me.id, action: "member.cohort_self", targetMemberId: me.id, details: { name: me.name, to: cohort } });
  revalidatePath("/home");
  revalidatePath("/lineup");
  redirect(`/home?msg=${encodeURIComponent(cohort === null ? "기수를 지웠습니다." : `기수를 ${cohort}기로 저장했습니다.`)}`);
}
