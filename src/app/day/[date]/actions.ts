"use server";
// ─────────────────────────────────────────────────────────────
// 투표 서버 액션 — 희망(동 선택) / 미희망 / 취소 + 관리자 수동 추첨
// 서버에서 다시 한 번 모든 규칙을 확인합니다. (화면 버튼을 몰래 눌러도 규칙을 어길 수 없게)
//   - 근무일이 맞는지, 투표 기간(주간 일정·계급별 시작)인지
//   - 휴가·부상으로 제외된 날이 아닌지
//   - 고른 자리를 희망할 수 있는지 (진료반 → 진료실·모든 동, 그 외 → 동만)
//   - 주말 운전 희망은 운전병만, 동 희망과 따로 (driveVoteAction)
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { isValidDate } from "@/lib/kst";
import { computeDutyDays } from "@/lib/duty-days";
import { getOverrides, getVoteInfo } from "@/lib/duty-days-server";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { executeDraw } from "@/lib/draw-server";

function back(date: string, kind: "msg" | "error", text: string): never {
  revalidatePath(`/day/${date}`);
  revalidatePath("/home");
  redirect(`/day/${date}?${kind}=${encodeURIComponent(text)}`);
}

// 투표 결과: 화면에 보여 줄 문구 (페이지를 다시 불러오지 않고 바로 표시)
export type VoteResult = { ok: boolean; message: string };
export type VoteChoice = { kind: "want"; postId: number } | { kind: "decline" } | { kind: "cancel" };

// 투표 하나로 희망(동 선택) / 미희망 / 취소를 모두 처리합니다.
// 규칙 확인에 필요한 정보는 동시에(병렬로) 읽어서 기다리는 시간을 줄입니다.
export async function voteAction(date: string, choice: VoteChoice): Promise<VoteResult> {
  const me = await requireMember();
  if (!isValidDate(date)) return { ok: false, message: "잘못된 날짜입니다." };

  const [overrides, info, excluded, posts] = await Promise.all([
    getOverrides(date, date),
    getVoteInfo(date, me.rank),
    getExcludedIds(date),
    choice.kind === "want" ? getPostsForDate(date) : Promise.resolve([]),
  ]);
  if (computeDutyDays(date, date, overrides).length === 0) return { ok: false, message: "근무일이 아닙니다." };
  if (info.status === "before") {
    return {
      ok: false,
      message: info.overall === "open" ? "일병·이병은 화요일 00:00부터 투표할 수 있습니다." : "아직 투표가 열리지 않았습니다.",
    };
  }
  if (info.status === "closed") return { ok: false, message: "투표가 마감되었습니다." };
  if (excluded.has(me.id)) return { ok: false, message: "이 날은 추첨 제외 상태입니다. (휴가·부상 등 또는 관리자 지정)" };

  const db = getSupabaseAdmin();
  let message: string;
  if (choice.kind === "want") {
    const post = posts.find((p) => p.id === choice.postId);
    if (!post) return { ok: false, message: "자리를 다시 선택해 주세요." };
    // 진료반은 진료실·모든 동 가능, 일반 인원은 진료실 불가
    if (post.pool === "clinic" && !me.is_clinic) {
      return { ok: false, message: "진료실은 진료반만 희망할 수 있습니다." };
    }
    if (post.pool === "driver") return { ok: false, message: "주말 운전은 아래 '주말 운전 희망' 버튼으로 따로 신청해 주세요." };
    if (post.required === 0) return { ok: false, message: `${post.name} 은(는) 이 날 인원이 0명입니다.` };
    const { error } = await db.from("responses").upsert({ member_id: me.id, duty_date: date, choice: "want", post_id: post.id });
    if (error) return { ok: false, message: "저장 중 오류: " + error.message };
    message = `${post.name} 희망으로 저장했습니다.`;
  } else if (choice.kind === "decline") {
    const { error } = await db.from("responses").upsert({ member_id: me.id, duty_date: date, choice: "decline", post_id: null });
    if (error) return { ok: false, message: "저장 중 오류: " + error.message };
    message = "미희망으로 저장했습니다.";
  } else {
    await db.from("responses").delete().eq("member_id", me.id).eq("duty_date", date);
    message = "응답을 취소했습니다. (미응답 상태)";
  }

  // 이 화면과 홈 화면의 내용을 새로 그리게 함 → 새로고침 없이 이름 목록·배지가 바뀜
  revalidatePath(`/day/${date}`);
  revalidatePath("/home");
  return { ok: true, message };
}

// ── 주말 운전 희망 켜기/끄기 (운전병만, 동 희망과 따로) ──
//   끄면(미희망) 운전 희망자가 없을 때 운전병 중 랜덤으로 뽑힐 수 있습니다.
export async function driveVoteAction(date: string, want: boolean): Promise<VoteResult> {
  const me = await requireMember();
  if (!isValidDate(date)) return { ok: false, message: "잘못된 날짜입니다." };
  if (!me.is_driver) return { ok: false, message: "주말 운전은 운전병만 희망할 수 있습니다." };
  const [overrides, info, excluded] = await Promise.all([getOverrides(date, date), getVoteInfo(date, me.rank), getExcludedIds(date)]);
  if (computeDutyDays(date, date, overrides).length === 0) return { ok: false, message: "근무일이 아닙니다." };
  if (info.status === "before") return { ok: false, message: "아직 투표할 수 없는 시간입니다." };
  if (info.status === "closed") return { ok: false, message: "투표가 마감되었습니다." };
  if (excluded.has(me.id)) return { ok: false, message: "이 날은 추첨 제외 상태입니다. (휴가·부상 등 또는 관리자 지정)" };

  const db = getSupabaseAdmin();
  const { error } = want
    ? await db.from("drive_wants").upsert({ member_id: me.id, duty_date: date })
    : await db.from("drive_wants").delete().eq("member_id", me.id).eq("duty_date", date);
  if (error) return { ok: false, message: "저장 중 오류(관리자에게 0007 SQL 실행을 요청하세요): " + error.message };
  revalidatePath(`/day/${date}`);
  return { ok: true, message: want ? "주말 운전 희망으로 저장했습니다." : "주말 운전 희망을 취소했습니다." };
}

// ── 관리자: 지금 추첨 (마감이 지난 날, 아직 추첨 안 된 날만) ──
// 8단계에서 자동 추첨(정기 실행·접속 시 안전장치)이 붙고, 이 버튼은 예비용이 됩니다.
export async function manualDrawAction(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const r = await executeDraw(date, "manual", me.id);
  if (r.status === "not-ready") back(date, "error", r.reason);
  if (r.status === "already") back(date, "msg", "이미 추첨이 끝난 날입니다. (결과는 한 번만 만들어집니다)");
  back(date, "msg", "추첨을 완료했습니다.");
}
