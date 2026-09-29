"use server";
// ─────────────────────────────────────────────────────────────
// 투표 서버 액션 — 희망(동 선택) / 미희망 / 취소
// 서버에서 다시 한 번 모든 규칙을 확인합니다. (화면 버튼을 몰래 눌러도 규칙을 어길 수 없게)
//   - 근무일이 맞는지, 투표 기간(30일 전 00:00 ~ 2일 전 21:00)인지
//   - 휴가·부상으로 제외된 날이 아닌지
//   - 고른 자리가 내 추첨 풀에 맞는지 (진료반 → 진료실, 그 외 → 일반 동)
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isValidDate } from "@/lib/kst";
import { votingStatus } from "@/lib/voting";
import { computeDutyDays } from "@/lib/duty-days";
import { getOverrides } from "@/lib/duty-days-server";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";

function back(date: string, kind: "msg" | "error", text: string): never {
  revalidatePath(`/day/${date}`);
  revalidatePath("/home");
  redirect(`/day/${date}?${kind}=${encodeURIComponent(text)}`);
}

// 공통 확인: 근무일 + 투표 중 + 제외 아님
async function checkCanVote(date: string, memberId: number) {
  if (!isValidDate(date)) redirect("/home");
  const isDuty = computeDutyDays(date, date, await getOverrides(date, date)).length > 0;
  if (!isDuty) back(date, "error", "근무일이 아닙니다.");
  const status = votingStatus(date);
  if (status === "before") back(date, "error", "아직 투표가 열리지 않았습니다.");
  if (status === "closed") back(date, "error", "투표가 마감되었습니다.");
  if ((await getExcludedIds(date)).has(memberId)) {
    back(date, "error", "휴가·부상 기간이라 이 날은 제외 상태입니다.");
  }
}

// 희망 (자리 선택 포함)
export async function wantAction(formData: FormData) {
  const me = await requireMember();
  const date = String(formData.get("date") ?? "");
  const postId = Number(formData.get("post_id"));
  await checkCanVote(date, me.id);

  const post = (await getPostsForDate(date)).find((p) => p.id === postId);
  const myPool = me.is_clinic ? "clinic" : "general";
  if (!post) back(date, "error", "자리를 다시 선택해 주세요.");
  if (post.pool !== myPool) {
    back(date, "error", me.is_clinic ? "진료반은 진료실만 희망할 수 있습니다." : "진료실은 진료반만 희망할 수 있습니다.");
  }
  if (post.required === 0) back(date, "error", `${post.name} 은(는) 이 날 인원이 0명입니다.`);

  const { error } = await getSupabaseAdmin()
    .from("responses")
    .upsert({ member_id: me.id, duty_date: date, choice: "want", post_id: post.id });
  if (error) back(date, "error", "저장 중 오류: " + error.message);
  back(date, "msg", `${post.name} 희망으로 저장했습니다.`);
}

// 미희망 ("이날은 어려워요")
export async function declineAction(formData: FormData) {
  const me = await requireMember();
  const date = String(formData.get("date") ?? "");
  await checkCanVote(date, me.id);
  const { error } = await getSupabaseAdmin()
    .from("responses")
    .upsert({ member_id: me.id, duty_date: date, choice: "decline", post_id: null });
  if (error) back(date, "error", "저장 중 오류: " + error.message);
  back(date, "msg", "미희망으로 저장했습니다.");
}

// 응답 취소 → 미응답 상태로
export async function cancelVoteAction(formData: FormData) {
  const me = await requireMember();
  const date = String(formData.get("date") ?? "");
  await checkCanVote(date, me.id);
  await getSupabaseAdmin().from("responses").delete().eq("member_id", me.id).eq("duty_date", date);
  back(date, "msg", "응답을 취소했습니다. (미응답 상태)");
}
