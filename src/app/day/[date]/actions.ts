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
import { getDayBoard, getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { executeDraw, getDraw } from "@/lib/draw-server";
import { writeAudit } from "@/lib/audit";

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

// ── 관리자: 투표를 깜빡한 미응답자 중 골라 이 날 추첨에서만 빼기 ──
//   제외 기간(absences, 종류 "관리자 제외")을 그날 하루로 만듭니다. 추첨 전에만 가능.
export async function excuseUnansweredAction(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) redirect("/home");
  const ids = [...new Set(formData.getAll("ids").map(Number).filter(Number.isInteger))];
  if (ids.length === 0) back(date, "error", "뺄 사람을 체크해 주세요.");
  if (computeDutyDays(date, date, await getOverrides(date, date)).length === 0) back(date, "error", "근무일이 아닙니다.");
  if (await getDraw(date)) back(date, "error", "이미 추첨이 끝난 날입니다. 명단 수정을 이용하세요.");

  // 지금 미응답인 사람만 (활성, 제외 아님, 응답 없음) — 화면을 거치지 않은 조작 방지
  const board = await getDayBoard(date);
  const unanswered = new Map(board.unanswered.map((m) => [m.id, m.name]));
  const targets = ids.filter((id) => unanswered.has(id));
  if (targets.length === 0) back(date, "error", "미응답자 중에서 골라 주세요.");

  const db = getSupabaseAdmin();
  const { error } = await db
    .from("absences")
    .insert(targets.map((id) => ({ member_id: id, kind: "excused", start_date: date, end_date: date, created_by: me.id })));
  if (error) back(date, "error", error.code === "23514" ? "관리자 제외용 SQL(0011)을 먼저 실행해 주세요." : "저장 중 오류: " + error.message);
  for (const id of targets) {
    await writeAudit({ actorId: me.id, action: "absence.add", targetMemberId: id, details: { kind: "excused", start_date: date, end_date: date, name: unanswered.get(id) } });
  }
  back(date, "msg", `${targets.map((id) => unanswered.get(id)).join(", ")} — 이 날 추첨에서 뺐습니다.`);
}

// 관리자 제외 되돌리기 (다시 미응답 → 추첨 대상)
export async function undoExcuseAction(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) redirect("/home");
  const id = Number(formData.get("absence_id"));
  const db = getSupabaseAdmin();
  const { data: row } = await db.from("absences").select("id, member_id, kind, start_date, end_date").eq("id", id).maybeSingle();
  if (!row || row.kind !== "excused") back(date, "error", "기록을 찾을 수 없습니다.");
  if (await getDraw(date)) back(date, "error", "이미 추첨이 끝난 날입니다. 명단 수정을 이용하세요.");
  await db.from("absences").delete().eq("id", id);
  await writeAudit({ actorId: me.id, action: "absence.delete", targetMemberId: row.member_id, details: row });
  back(date, "msg", "되돌렸습니다. 다시 추첨 대상입니다.");
}
