// ─────────────────────────────────────────────────────────────
// 확정 명단 수정 화면 (/admin/roster/2026-10-03) — 관리자 전용
//   자리별로 확정된 사람과 꼬리표를 보여 주고,
//   각 사람마다 [교체] [삭제], 자리마다 빈자리가 있으면 [추가]를 할 수 있습니다.
//   후보 목록에서 휴가·부상 중인 사람은 "⚠ 휴가·부상"으로 표시되고, 고르면 경고 확인창이 뜹니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { getDriverIds } from "@/lib/drivers";
import { formatLong, isValidDate } from "@/lib/kst";
import { getExcludedIds, getPostsForDate } from "@/lib/day-board";
import { getDraw, getRoster } from "@/lib/draw-server";
import { Notice, Page } from "@/components/ui";
import { ConfirmButton, WarnSelectForm } from "@/components/confirm-button";
import { addAssignmentAction, removeAssignmentAction, replaceAssignmentAction } from "./actions";

const SOURCE_LABEL = { wanted: "희망 확정", drafted: "차출", admin: "관리자 수정" } as const;
const SOURCE_COLOR = {
  wanted: "bg-blue-100 text-blue-800",
  drafted: "bg-amber-100 text-amber-800",
  admin: "bg-purple-100 text-purple-800",
} as const;
const selectClass =
  "min-w-0 flex-1 rounded border border-zinc-300 bg-white px-1 py-1.5 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default async function RosterEditPage({ params, searchParams }: PageProps<"/admin/roster/[date]">) {
  await requireAdmin();
  const { date } = await params;
  if (!isValidDate(date)) notFound();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const draw = await getDraw(date);
  if (!draw) {
    return (
      <Page title="명단 수정">
        <Notice kind="warn">아직 추첨하지 않은 날입니다.</Notice>
        <Link href={`/day/${date}`} className="mt-6 block text-center text-sm text-zinc-500 underline">
          돌아가기
        </Link>
      </Page>
    );
  }

  const db = getSupabaseAdmin();
  const [posts, roster, excluded, drivers, { data: members }, { data: responses }] = await Promise.all([
    getPostsForDate(date),
    getRoster(date),
    getExcludedIds(date),
    getDriverIds(),
    db.from("members").select("id, name, is_clinic").eq("is_active", true).order("name"),
    db.from("responses").select("member_id, choice").eq("duty_date", date),
  ]);
  // 동(진료실 포함) 명단에 있는 사람 / 운전 명단에 있는 사람 — 따로 셉니다(운전병은 둘 다 가능)
  const driverPostIds = new Set(posts.filter((p) => p.pool === "driver").map((p) => p.id));
  const inPostRoster = new Set(roster.filter((r) => !driverPostIds.has(r.postId)).map((r) => r.memberId));
  const inDriveRoster = new Set(roster.filter((r) => driverPostIds.has(r.postId)).map((r) => r.memberId));
  const respOf = new Map((responses ?? []).map((r) => [r.member_id as number, r.choice as string]));

  // 후보 = 명단에 없는 활성 인원. 이름 옆에 진료반·응답·휴가 표시.
  //   동 자리 후보: 동 명단에 없는 사람 / 운전 자리 후보: 운전 명단에 없는 운전병
  const allCandidates = (members ?? [])
    .map((m) => {
      const tags = [
        m.is_clinic ? "진료반" : null,
        drivers.has(m.id) ? "운전병" : null,
        respOf.get(m.id) === "want" ? "희망했음" : respOf.get(m.id) === "decline" ? "미희망" : null,
        excluded.has(m.id) ? "⚠ 휴가·부상" : null,
      ].filter(Boolean);
      return {
        inPost: inPostRoster.has(m.id),
        inDrive: inDriveRoster.has(m.id),
        driver: drivers.has(m.id),
        id: m.id as number,
        label: `${m.name}${tags.length ? ` (${tags.join(", ")})` : ""}`,
        warn: excluded.has(m.id) ? `${m.name} 은(는) 이 날 휴가·부상 기간입니다.` : "",
      };
    });

  // 후보 선택 칸 (교체·추가에 같이 씀)
  const candidateSelect = (forDrive: boolean) => {
    const candidates = allCandidates.filter((c) => (forDrive ? c.driver && !c.inDrive : !c.inPost));
    return (
    <select name="member_id" required data-warn-select className={selectClass} defaultValue="">
      <option value="" disabled>
        사람 선택
      </option>
      {candidates.map((c) => (
        <option key={c.id} value={c.id} data-warn={c.warn || undefined}>
          {c.label}
        </option>
      ))}
    </select>
    );
  };

  return (
    <Page title="명단 수정">
      <p className="-mt-4 mb-4 text-lg font-semibold">{formatLong(date)}</p>
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      <ul className="mt-3 space-y-3">
        {posts
          .filter((p) => p.required > 0 || roster.some((r) => r.postId === p.id))
          .map((p) => {
            const people = roster.filter((r) => r.postId === p.id);
            const empty = Math.max(0, p.required - people.length);
            return (
              <li key={p.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                <p className="flex justify-between border-b border-zinc-200 px-3 py-2 text-sm font-semibold dark:border-zinc-800">
                  <span>{p.name}</span>
                  <span className={empty > 0 ? "text-red-600" : "text-zinc-500"}>
                    {people.length}/{p.required}명{empty > 0 ? ` · 빈자리 ${empty}` : ""}
                  </span>
                </p>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {people.map((r) => (
                    <li key={r.memberId} className="space-y-1.5 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span>
                          {r.name}{" "}
                          <span className={`rounded px-1 text-[11px] ${SOURCE_COLOR[r.source]}`}>{SOURCE_LABEL[r.source]}</span>
                          {excluded.has(r.memberId) && <span className="ml-1 text-xs text-red-600">⚠ 휴가·부상</span>}
                        </span>
                        <form action={removeAssignmentAction}>
                          <input type="hidden" name="date" value={date} />
                          <input type="hidden" name="member_id" value={r.memberId} />
                          <input type="hidden" name="post_id" value={p.id} />
                          <ConfirmButton
                            message={`${r.name} 을(를) 명단에서 뺄까요?`}
                            className="rounded border border-red-300 px-2 py-1 text-xs text-red-700"
                          >
                            삭제
                          </ConfirmButton>
                        </form>
                      </div>
                      {/* 교체: 같은 자리에 다른 사람 */}
                      <WarnSelectForm action={replaceAssignmentAction} className="flex items-center gap-1.5">
                        <input type="hidden" name="date" value={date} />
                        <input type="hidden" name="old_member_id" value={r.memberId} />
                        <input type="hidden" name="post_id" value={p.id} />
                        {candidateSelect(p.pool === "driver")}
                        <button type="submit" className="shrink-0 rounded border border-zinc-300 px-2 py-1.5 text-xs dark:border-zinc-700">
                          교체
                        </button>
                      </WarnSelectForm>
                    </li>
                  ))}
                  {/* 추가: 이 자리에 사람 넣기 */}
                  <li className="px-3 py-2">
                    <WarnSelectForm action={addAssignmentAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="date" value={date} />
                      <input type="hidden" name="post_id" value={p.id} />
                      {candidateSelect(p.pool === "driver")}
                      <button type="submit" className="shrink-0 rounded bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white">
                        추가
                      </button>
                    </WarnSelectForm>
                  </li>
                </ul>
              </li>
            );
          })}
      </ul>

      <p className="mt-3 text-xs text-zinc-500">
        추가·교체한 사람은 &quot;관리자 수정&quot; 꼬리표가 붙고, 모든 변경은 변경 이력에 남습니다.
      </p>
      <Link href={`/day/${date}`} className="mt-6 block text-center text-sm text-zinc-500 underline">
        근무일 화면으로
      </Link>
    </Page>
  );
}
