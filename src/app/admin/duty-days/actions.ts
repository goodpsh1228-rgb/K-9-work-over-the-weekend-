"use server";
// ─────────────────────────────────────────────────────────────
// 공휴일 추가(근무일 관리) 서버 액션 (관리자 전용)
//   - 근무일 추가 / 근무 없음(삭제) / 되돌리기
//   - 특정 날짜만 자리별 인원 다르게 설정
// 모든 변경은 변경 이력(audit_logs)에 남깁니다.
// 처리 후에는 결과 문구를 주소 뒤(?msg=… 또는 ?error=…)에 붙여 같은 화면으로 돌아갑니다.
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { autoLabel } from "@/lib/duty-days";
import { formatShort, isValidDate, todayKST } from "@/lib/kst";
import { getVoteInfo, isDrawn } from "@/lib/duty-days-server";

const LIST = "/admin/duty-days";

function back(path: string, kind: "msg" | "error", text: string): never {
  revalidatePath(LIST);
  redirect(`${path}?${kind}=${encodeURIComponent(text)}`);
}

async function currentOverride(date: string) {
  const { data } = await getSupabaseAdmin()
    .from("duty_day_overrides")
    .select("kind, note")
    .eq("duty_date", date)
    .maybeSingle();
  return data as { kind: "add" | "remove"; note: string | null } | null;
}

// ── 근무일 추가 ───────────────────────────────────────────────
export async function addDutyDayAction(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 50) || null;

  if (!isValidDate(date)) back(LIST, "error", "날짜를 올바르게 선택해 주세요.");
  if (date < todayKST()) back(LIST, "error", "지난 날짜는 추가할 수 없습니다.");

  const auto = autoLabel(date);
  const o = await currentOverride(date);
  const db = getSupabaseAdmin();

  if (o?.kind === "add" || (auto && !o)) back(LIST, "error", `${formatShort(date)} 은(는) 이미 근무일입니다.`);

  if (auto && o?.kind === "remove") {
    // 자동 근무일을 "근무 없음"으로 해 둔 경우 → 설정을 지워서 원래대로
    await db.from("duty_day_overrides").delete().eq("duty_date", date);
  } else {
    const { error } = await db
      .from("duty_day_overrides")
      .insert({ duty_date: date, kind: "add", note, created_by: me.id });
    if (error) back(LIST, "error", "저장 중 오류: " + error.message);
  }
  await writeAudit({ actorId: me.id, action: "dutyday.add", dutyDate: date, details: { note } });
  // 이 날의 투표 주가 이미 마감됐으면, 곧바로 자동 추첨(전원 차출)된다는 것을 알려 줌
  const closedAlready = (await getVoteInfo(date)).overall === "closed";
  back(
    LIST,
    "msg",
    `${formatShort(date)} 을(를) 공휴일(근무일)로 추가했습니다.` +
      (closedAlready ? " ⚠ 이 날의 투표 기간은 이미 끝나서, 곧바로 자동 추첨(전원 차출)됩니다." : ""),
  );
}

// ── 근무 없음으로 (삭제) ──────────────────────────────────────
export async function removeDutyDayAction(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) back(LIST, "error", "잘못된 날짜입니다.");
  if (await isDrawn(date)) back(LIST, "error", `${formatShort(date)} 은(는) 이미 추첨이 끝나 삭제할 수 없습니다.`);

  const auto = autoLabel(date);
  const o = await currentOverride(date);
  const db = getSupabaseAdmin();

  if (o?.kind === "add") {
    await db.from("duty_day_overrides").delete().eq("duty_date", date); // 추가했던 날 → 추가 취소
  } else if (auto && !o) {
    const { error } = await db
      .from("duty_day_overrides")
      .insert({ duty_date: date, kind: "remove", created_by: me.id });
    if (error) back(LIST, "error", "저장 중 오류: " + error.message);
  } else {
    back(LIST, "error", `${formatShort(date)} 은(는) 근무일이 아닙니다.`);
  }
  await writeAudit({ actorId: me.id, action: "dutyday.remove", dutyDate: date });
  back(LIST, "msg", `${formatShort(date)} 을(를) 근무 없음으로 바꿨습니다.`);
}

// ── 되돌리기 (삭제했던 자동 근무일을 다시 근무일로) ───────────
export async function restoreDutyDayAction(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) back(LIST, "error", "잘못된 날짜입니다.");
  await getSupabaseAdmin().from("duty_day_overrides").delete().eq("duty_date", date).eq("kind", "remove");
  await writeAudit({ actorId: me.id, action: "dutyday.restore", dutyDate: date });
  back(LIST, "msg", `${formatShort(date)} 을(를) 다시 근무일로 되돌렸습니다.`);
}

// ── 특정 날짜만 자리별 인원 다르게 ────────────────────────────
// 폼에서 count_<자리번호> 이름으로 인원 수가 옵니다. 기본 인원과 같으면 날짜별 설정을 지웁니다.
export async function savePostCountsAction(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  const page = `${LIST}/${date}`;
  if (!isValidDate(date)) back(LIST, "error", "잘못된 날짜입니다.");
  if (await isDrawn(date)) back(page, "error", "이미 추첨이 끝난 날은 인원을 바꿀 수 없습니다.");

  const db = getSupabaseAdmin();
  const { data: posts } = await db.from("posts").select("id, name, default_count").eq("is_active", true);
  const changes: Record<string, { from: number; to: number }> = {};

  for (const post of posts ?? []) {
    const raw = String(formData.get(`count_${post.id}`) ?? "").trim();
    const value = Number(raw);
    if (raw === "" || !Number.isInteger(value) || value < 0 || value > 50) {
      back(page, "error", `${post.name} 인원은 0~50 사이의 숫자로 입력해 주세요.`);
    }
    if (value === post.default_count) {
      await db.from("duty_day_post_counts").delete().eq("duty_date", date).eq("post_id", post.id);
    } else {
      const { error } = await db
        .from("duty_day_post_counts")
        .upsert({ duty_date: date, post_id: post.id, required_count: value, created_by: me.id });
      if (error) back(page, "error", "저장 중 오류: " + error.message);
      changes[post.name] = { from: post.default_count, to: value };
    }
  }
  await writeAudit({ actorId: me.id, action: "dutyday.post_counts", dutyDate: date, details: { changes } });
  revalidatePath(page);
  back(page, "msg", "저장했습니다.");
}
