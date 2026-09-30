"use server";
// ─────────────────────────────────────────────────────────────
// 홈 화면 서버 액션 — 내 계급 변경 (본인)
//   진급했을 때 각자 바꿀 수 있게 합니다. 변경 이력에 "계급 변경(본인)"으로 남습니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { RANKS } from "@/lib/voting";

export async function updateMyRankAction(formData: FormData) {
  const me = await requireMember();
  const rank = String(formData.get("rank") ?? "");
  if (!RANKS.includes(rank as (typeof RANKS)[number])) {
    redirect(`/home?error=${encodeURIComponent("계급을 다시 선택해 주세요.")}`);
  }
  if (rank !== me.rank) {
    await getSupabaseAdmin().from("members").update({ rank }).eq("id", me.id);
    await writeAudit({ actorId: me.id, action: "member.rank_self", targetMemberId: me.id, details: { name: me.name, from: me.rank, to: rank } });
  }
  revalidatePath("/home");
  redirect(`/home?msg=${encodeURIComponent(`계급을 ${rank}(으)로 저장했습니다.`)}`);
}
