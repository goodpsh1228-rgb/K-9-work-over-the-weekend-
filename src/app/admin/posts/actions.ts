"use server";
// ─────────────────────────────────────────────────────────────
// 동(자리) 설정 서버 액션 (관리자 전용)
//   - 이름·기본 인원 한 번에 저장
//   - 새 동 추가 (일반 추첨 자리)
//   - 동 사용 중지 / 다시 사용 (과거 명단 보존을 위해 지우지 않음)
//   기본 인원은 아직 추첨하지 않은 날부터 적용됩니다. (날짜별로 따로 정한 인원이 있으면 그 값이 우선)
// ─────────────────────────────────────────────────────────────
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { writeAudit } from "@/lib/audit";

const PAGE = "/admin/posts";
function back(kind: "msg" | "error", text: string): never {
  revalidatePath(PAGE);
  revalidatePath("/home");
  redirect(`${PAGE}?${kind}=${encodeURIComponent(text)}`);
}

type Post = { id: number; name: string; pool: string; default_count: number; is_active: boolean; sort_order: number };
async function loadPosts(): Promise<Post[]> {
  const { data } = await getSupabaseAdmin().from("posts").select("id, name, pool, default_count, is_active, sort_order").order("sort_order");
  return (data ?? []) as Post[];
}

// 이름·기본 인원 저장 (바뀐 것만)
export async function savePostsAction(formData: FormData) {
  const me = await requireAdmin();
  const db = getSupabaseAdmin();
  const changes: Record<string, string> = {};
  const names = new Set<string>();
  const posts = await loadPosts();
  for (const p of posts) {
    if (!formData.has(`name_${p.id}`)) continue; // 화면에 없던 자리(사용 중지)는 건너뜀
    const name = String(formData.get(`name_${p.id}`) ?? "").trim();
    const count = Number(formData.get(`count_${p.id}`));
    if (!name || name.length > 30) back("error", "동 이름은 1~30자로 입력해 주세요.");
    if (!Number.isInteger(count) || count < 0 || count > 50) back("error", `${name}: 인원은 0~50 사이 숫자로 입력해 주세요.`);
    if (names.has(name)) back("error", `"${name}" 이름이 겹칩니다.`);
    names.add(name);
    if (name !== p.name || count !== p.default_count) {
      const { error } = await db.from("posts").update({ name, default_count: count }).eq("id", p.id);
      if (error) back("error", error.code === "23505" ? `"${name}" 은(는) 이미 있는 이름입니다.` : "저장 중 오류: " + error.message);
      changes[p.name] = `${p.name !== name ? `${p.name}→${name} ` : ""}${p.default_count}→${count}명`;
    }
  }
  if (Object.keys(changes).length === 0) back("msg", "바뀐 내용이 없습니다.");
  await writeAudit({ actorId: me.id, action: "post.update", details: { changes } });
  back("msg", `저장했습니다: ${Object.values(changes).join(", ")}`);
}

// 새 동 추가 (일반 추첨 자리, 목록 맨 끝)
export async function addPostAction(formData: FormData) {
  const me = await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const count = Number(formData.get("count"));
  if (!name || name.length > 30) back("error", "동 이름은 1~30자로 입력해 주세요.");
  if (!Number.isInteger(count) || count < 0 || count > 50) back("error", "인원은 0~50 사이 숫자로 입력해 주세요.");
  const posts = await loadPosts();
  const sort = Math.max(0, ...posts.map((p) => p.sort_order)) + 10;
  const { error } = await getSupabaseAdmin().from("posts").insert({ name, pool: "general", default_count: count, sort_order: sort });
  if (error) back("error", error.code === "23505" ? `"${name}" 은(는) 이미 있는 이름입니다. (사용 중지된 동이면 "다시 사용"을 누르세요)` : "저장 중 오류: " + error.message);
  await writeAudit({ actorId: me.id, action: "post.add", details: { name, count } });
  back("msg", `${name}(${count}명)을(를) 추가했습니다.`);
}

// 사용 중지 / 다시 사용 (일반 동만)
export async function togglePostAction(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("id"));
  const p = (await loadPosts()).find((x) => x.id === id);
  if (!p) back("error", "동을 찾을 수 없습니다.");
  if (p.pool !== "general") back("error", "진료실·주말 운전·선탑은 사용 중지할 수 없습니다. 인원을 0명으로 하세요.");
  await getSupabaseAdmin().from("posts").update({ is_active: !p.is_active }).eq("id", id);
  await writeAudit({ actorId: me.id, action: p.is_active ? "post.deactivate" : "post.activate", details: { name: p.name } });
  back("msg", p.is_active ? `${p.name}을(를) 사용 중지했습니다. (과거 명단은 그대로)` : `${p.name}을(를) 다시 사용합니다.`);
}
