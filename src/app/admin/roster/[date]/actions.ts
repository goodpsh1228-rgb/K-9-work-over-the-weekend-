"use server";
// ─────────────────────────────────────────────────────────────
// 확정 명단 수정 서버 액션 (관리자 전용) — 추첨이 끝난 날만
//   - 삭제: 명단에서 한 사람 빼기
//   - 추가: 사람 + 자리를 골라 넣기 (꼬리표 "관리자 수정")
//   - 교체: 한 사람을 다른 사람으로 바꾸기 (같은 자리, 꼬리표 "관리자 수정")
//   - 이 사람만 다시 뽑기: 한 사람을 빼고 그 자리를 랜덤으로 다시 채움 (나머지 명단은 그대로)
//   - 선탑 추첨: 그날 출근자 중 관리자가 고른 대상자 안에서 랜덤 1명 (다시 누르면 다시 뽑음)
//   ※ 한 사람은 하루에 동(진료실 포함) 한 곳 + 주말 운전 + 선탑까지 가질 수 있습니다(종류별 한 번).
//   휴가·부상 중인 사람도 넣을 수 있습니다(화면에서 경고만). 변경 이력에 "제외 기간 중" 표시를 남깁니다.
//   변경 후에는 인원 부족 수를 다시 계산해 저장합니다.
// ─────────────────────────────────────────────────────────────
import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";
import { isValidDate } from "@/lib/kst";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { getDraw } from "@/lib/draw-server";
import { autoAssignEscort } from "@/lib/escort-server";

// to = 돌아갈 화면 (기본: 명단 수정, "day" = 근무일 화면)
function back(date: string, kind: "msg" | "error", text: string, to: "roster" | "day" = "roster"): never {
  revalidatePath(`/admin/roster/${date}`);
  revalidatePath(`/day/${date}`);
  revalidatePath("/home");
  const path = to === "day" ? `/day/${date}` : `/admin/roster/${date}`;
  redirect(`${path}?${kind}=${encodeURIComponent(text)}`);
}

async function common(formData: FormData) {
  const me = await requireAdmin();
  const date = String(formData.get("date") ?? "");
  if (!isValidDate(date)) redirect("/home");
  if (!(await getDraw(date))) back(date, "error", "아직 추첨하지 않은 날입니다.");
  return { me, date, db: getSupabaseAdmin() };
}

// 이 사람을 이 자리에 넣어도 되는지: 동(진료실 포함)은 하루 한 곳, 운전은 따로 한 번
//   이미 들어갈 수 없으면 안내 문구를, 괜찮으면 null 을 돌려줍니다.
async function conflictMessage(date: string, memberId: number, name: string, postId: number, ignoreRowId?: number) {
  const posts = await getPostsForDate(date);
  // 종류: 운전 / 선탑 / 그 외(동·진료실)
  const kind = (pid: number) => {
    const pool = posts.find((p) => p.id === pid)?.pool;
    return pool === "driver" || pool === "escort" ? pool : "post";
  };
  const { data } = await getSupabaseAdmin().from("assignments").select("id, post_id").eq("duty_date", date).eq("member_id", memberId);
  const clash = (data ?? []).some((r) => r.id !== ignoreRowId && kind(r.post_id) === kind(postId));
  if (!clash) return null;
  const what = { driver: "운전", escort: "선탑", post: "다른 동" }[kind(postId)];
  return `${name} 은(는) 이미 ${what} 명단에 있습니다.`;
}

async function memberName(id: number) {
  const { data } = await getSupabaseAdmin().from("members").select("name, is_active").eq("id", id).maybeSingle();
  return data as { name: string; is_active: boolean } | null;
}

// 명단이 바뀐 뒤 인원 부족 수 다시 계산 → draws 에 저장 (홈 배지·알림에 반영)
async function recomputeShortage(date: string) {
  const db = getSupabaseAdmin();
  const [posts, { data: rows }] = await Promise.all([
    getPostsForDate(date),
    db.from("assignments").select("post_id").eq("duty_date", date),
  ]);
  const count = new Map<number, number>();
  for (const r of rows ?? []) count.set(r.post_id, (count.get(r.post_id) ?? 0) + 1);
  const short = { clinic: 0, general: 0, driver: 0 };
  for (const p of posts) {
    if (p.pool === "escort") continue; // 선탑은 인원 부족으로 세지 않음
    short[p.pool] += Math.max(0, p.required - (count.get(p.id) ?? 0));
  }
  // 운전 부족은 "일반(동·운전)" 부족에 합쳐 저장
  await db.from("draws").update({ clinic_shortage: short.clinic, general_shortage: short.general + short.driver }).eq("duty_date", date);
}

export async function removeAssignmentAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const memberId = Number(formData.get("member_id"));
  const postId = Number(formData.get("post_id")); // 운전병은 동 + 운전 두 줄일 수 있어 자리까지 지정
  const { data: row } = await db
    .from("assignments")
    .select("id, post_id, source")
    .eq("duty_date", date)
    .eq("member_id", memberId)
    .eq("post_id", postId)
    .maybeSingle();
  if (!row) back(date, "error", "명단에 없는 사람입니다.");
  await db.from("assignments").delete().eq("id", row.id);
  await recomputeShortage(date);
  const name = (await memberName(memberId))?.name ?? "?";
  const post = (await getPostsForDate(date)).find((p) => p.id === row.post_id)?.name;
  await writeAudit({ actorId: me.id, action: "roster.remove", targetMemberId: memberId, dutyDate: date, details: { name, post, source: row.source } });
  back(date, "msg", `${name} 을(를) 명단에서 뺐습니다.`);
}

export async function addAssignmentAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const memberId = Number(formData.get("member_id"));
  const postId = Number(formData.get("post_id"));
  const m = await memberName(memberId);
  if (!m || !m.is_active) back(date, "error", "인원을 선택해 주세요.");
  const post = (await getPostsForDate(date)).find((p) => p.id === postId);
  if (!post) back(date, "error", "자리를 선택해 주세요.");
  const clash = await conflictMessage(date, memberId, m.name, postId);
  if (clash) back(date, "error", clash);

  const { error } = await db.from("assignments").insert({ duty_date: date, member_id: memberId, post_id: postId, source: "admin" });
  if (error) back(date, "error", error.code === "23505" ? `${m.name} 은(는) 이미 명단에 있습니다.` : "저장 중 오류: " + error.message);
  await recomputeShortage(date);
  const excluded = (await getExcludedIds(date)).has(memberId);
  await writeAudit({ actorId: me.id, action: "roster.add", targetMemberId: memberId, dutyDate: date, details: { name: m.name, post: post.name, excluded } });
  back(date, "msg", `${m.name} 을(를) ${post.name}에 넣었습니다.${excluded ? " (휴가·부상 기간 중인 사람)" : ""}`);
}

export async function replaceAssignmentAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const oldId = Number(formData.get("old_member_id"));
  const newId = Number(formData.get("member_id"));
  const postId = Number(formData.get("post_id"));
  const { data: row } = await db
    .from("assignments")
    .select("id, post_id, source")
    .eq("duty_date", date)
    .eq("member_id", oldId)
    .eq("post_id", postId)
    .maybeSingle();
  if (!row) back(date, "error", "명단에 없는 사람입니다.");
  const newM = await memberName(newId);
  if (!newM || !newM.is_active) back(date, "error", "바꿀 사람을 선택해 주세요.");
  const clash = await conflictMessage(date, newId, newM.name, row.post_id);
  if (clash) back(date, "error", clash);

  // 새 사람을 넣고(같은 자리), 성공하면 예전 사람을 뺍니다.
  const { error } = await db.from("assignments").insert({ duty_date: date, member_id: newId, post_id: row.post_id, source: "admin" });
  if (error) back(date, "error", error.code === "23505" ? `${newM.name} 은(는) 이미 명단에 있습니다.` : "저장 중 오류: " + error.message);
  await db.from("assignments").delete().eq("id", row.id);
  await recomputeShortage(date);

  const oldName = (await memberName(oldId))?.name ?? "?";
  const post = (await getPostsForDate(date)).find((p) => p.id === row.post_id)?.name;
  const excluded = (await getExcludedIds(date)).has(newId);
  await writeAudit({
    actorId: me.id,
    action: "roster.replace",
    targetMemberId: newId,
    dutyDate: date,
    details: { from: oldName, to: newM.name, post, excluded },
  });
  back(date, "msg", `${post}: ${oldName} → ${newM.name} 으로 바꿨습니다.${excluded ? " (휴가·부상 기간 중인 사람)" : ""}`);
}

// 이 사람만 다시 뽑기 (동·진료실 자리만)
//   한 사람이 사정이 생겼을 때, 그 사람만 빼고 같은 자리를 추첨 규칙대로 랜덤으로 다시 채웁니다.
//   후보 순서: ① 이 자리를 희망했다가 정원 초과로 떨어진 사람 → 없으면 ② 차출 후보(미응답·미희망)
//   후보에서 빠지는 사람: 빠지는 본인, 이미 그날 다른 동·진료실 명단에 있는 사람, 휴가·부상 등 제외자, 다른 풀
//   (진료실 자리는 진료반만, 동 자리는 진료반이 아닌 사람만 차출 — 처음 추첨과 같은 규칙)
export async function redrawOneAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const oldId = Number(formData.get("member_id"));
  const postId = Number(formData.get("post_id"));
  const posts = await getPostsForDate(date);
  const post = posts.find((p) => p.id === postId);
  if (!post || (post.pool !== "clinic" && post.pool !== "general")) back(date, "error", "동·진료실 자리만 다시 뽑을 수 있습니다.");
  const { data: row } = await db.from("assignments").select("id").eq("duty_date", date).eq("member_id", oldId).eq("post_id", postId).maybeSingle();
  if (!row) back(date, "error", "명단에 없는 사람입니다.");

  const postPool = new Map(posts.map((p) => [p.id, p.pool]));
  let mem = await db.from("members").select("id, name, is_clinic, squad").eq("is_active", true);
  if (mem.error) mem = (await db.from("members").select("id, name, is_clinic").eq("is_active", true)) as typeof mem;
  const [excluded, { data: assigned }, { data: responses }] = await Promise.all([
    getExcludedIds(date),
    db.from("assignments").select("member_id, post_id").eq("duty_date", date),
    db.from("responses").select("member_id, choice, post_id").eq("duty_date", date),
  ]);
  // 이미 그날 동·진료실 명단에 있는 사람 (운전·선탑만 있는 사람은 후보 가능)
  const busy = new Set((assigned ?? []).filter((a) => { const k = postPool.get(a.post_id); return k === "clinic" || k === "general"; }).map((a) => a.member_id as number));
  const wantOf = new Map((responses ?? []).filter((r) => r.choice === "want" && r.post_id !== null).map((r) => [r.member_id as number, r.post_id as number]));
  const people = ((mem.data ?? []) as { id: number; name: string; is_clinic: boolean; squad?: string | null }[]).filter(
    (m) => m.id !== oldId && !busy.has(m.id) && !excluded.has(m.id),
  );
  const isClinic = (m: { is_clinic: boolean; squad?: string | null }) => m.is_clinic || m.squad === "진료반";
  // ① 이 자리를 희망했다가 떨어진 사람 (진료실 자리는 진료반만)
  const wanters = people.filter((m) => wantOf.get(m.id) === postId && (post.pool !== "clinic" || isClinic(m)));
  // ② 차출 후보: 같은 풀 + 어떤 자리도 희망하지 않은 사람(미응답·미희망)
  const drafts = people.filter((m) => !wantOf.has(m.id) && (post.pool === "clinic" ? isClinic(m) : !isClinic(m)));
  const fromWanters = wanters.length > 0;
  const cands = fromWanters ? wanters : drafts;
  if (cands.length === 0) back(date, "error", "다시 뽑을 후보가 없습니다. (교체 메뉴로 직접 골라 주세요)");
  const picked = cands[randomInt(cands.length)]; // 후보 모두 같은 확률

  const { error } = await db.from("assignments").insert({ duty_date: date, member_id: picked.id, post_id: postId, source: fromWanters ? "wanted" : "drafted" });
  if (error) back(date, "error", "저장 중 오류: " + error.message);
  await db.from("assignments").delete().eq("id", row.id);
  await recomputeShortage(date);
  const oldName = (await memberName(oldId))?.name ?? "?";
  await writeAudit({
    actorId: me.id,
    action: "roster.redraw",
    targetMemberId: picked.id,
    dutyDate: date,
    details: { from: oldName, to: picked.name, post: post.name, pool: fromWanters ? "떨어진 희망자" : "차출 후보", candidates: cands.length },
  });
  const to = formData.get("return_to") === "day" ? "day" : "roster";
  back(date, "msg", `${post.name}: ${oldName} → ${picked.name} (랜덤 다시 뽑기 · ${fromWanters ? "이 자리 희망자" : "차출 후보"} ${cands.length}명 중 1명)`, to);
}

// 선탑 추첨: 관리자가 체크한 대상자(그날 동·진료실 출근자) 중에서 서버 난수로 1명
//   이미 선탑이 있으면 새로 뽑은 사람으로 바뀝니다.
export async function drawEscortAction(formData: FormData) {
  const { me, date, db } = await common(formData);
  const to = formData.get("return_to") === "day" ? "day" : "roster"; // 근무일 화면에서 눌렀으면 그리로 돌아감
  const ids = formData.getAll("candidate_ids").map(Number).filter(Number.isInteger);
  const posts = await getPostsForDate(date);
  const escort = posts.find((p) => p.pool === "escort");
  if (!escort) back(date, "error", "선탑 자리가 없습니다. 0008 SQL을 먼저 실행해 주세요.", to);
  if (ids.length === 0) back(date, "error", "선탑 대상자를 한 명 이상 체크해 주세요.", to);

  // 대상자는 그날 동·진료실 출근자만 (화면을 거치지 않은 조작 방지)
  const workPostIds = posts.filter((p) => p.pool === "clinic" || p.pool === "general").map((p) => p.id);
  const { data: rows } = await db.from("assignments").select("member_id").eq("duty_date", date).in("post_id", workPostIds);
  const workers = new Set((rows ?? []).map((r) => r.member_id as number));
  const pool = [...new Set(ids)].filter((id) => workers.has(id));
  if (pool.length === 0) back(date, "error", "대상자는 이 날 출근자 중에서 골라 주세요.", to);

  const picked = pool[randomInt(pool.length)]; // 대상자 모두 같은 확률
  await db.from("assignments").delete().eq("duty_date", date).eq("post_id", escort.id);
  const { error } = await db.from("assignments").insert({ duty_date: date, member_id: picked, post_id: escort.id, source: "drafted" });
  if (error) back(date, "error", "저장 중 오류: " + error.message, to);

  const { data: names } = await db.from("members").select("id, name").in("id", pool);
  const nameOf = new Map((names ?? []).map((m) => [m.id as number, m.name as string]));
  const pickedName = nameOf.get(picked) ?? "?";
  await writeAudit({
    actorId: me.id,
    action: "roster.escort_draw",
    targetMemberId: picked,
    dutyDate: date,
    details: { picked: pickedName, candidates: pool.map((id) => nameOf.get(id) ?? "?") },
  });
  back(date, "msg", `선탑 추첨: 대상자 ${pool.length}명 중 ${pickedName} 이(가) 뽑혔습니다.`, to);
}

// 선탑을 규칙대로 다시 뽑기: 그날 운전병보다 기수가 같거나 높은 출근자 중 랜덤 1명 (이미 선탑이 있으면 바뀜)
export async function autoEscortAction(formData: FormData) {
  const { me, date } = await common(formData);
  const to = formData.get("return_to") === "day" ? "day" : "roster";
  const r = await autoAssignEscort(date, me.id, "manual");
  if (!r.ok) back(date, "error", r.message, to);
  const who = r.drivers.map((d) => `${d.name}(${d.cohort}기)`).join(", ");
  back(date, "msg", `선탑: 운전병 ${who}보다 기수가 같거나 높은 ${r.poolSize}명 중 ${r.picked.name} 이(가) 뽑혔습니다.`, to);
}
