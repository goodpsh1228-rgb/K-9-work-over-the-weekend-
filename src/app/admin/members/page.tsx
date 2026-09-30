// ─────────────────────────────────────────────────────────────
// 인원 관리 화면 (/admin/members) — 관리자 전용
//   - 전체 인원 목록 (계급, 진료반·관리자·비활성 표시)
//   - 계급 변경: 드롭다운에서 고르면 바로 저장
//   - 삭제: 왼쪽 체크박스로 여러 명 선택 → "선택한 사람 삭제"
//   - 인원 한 명 추가 (초기 비밀번호 1111)
//   - 이름을 누르면 상세 화면: 진료반 변경, 비밀번호 초기화, 관리자 지정/내려놓기, 비활성화
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Notice, Page } from "@/components/ui";
import { addMemberAction, deleteMembersAction, updateRankAction } from "./actions";
import { DeleteButton, RankSelect } from "./member-controls";

export default async function MembersPage({ searchParams }: PageProps<"/admin/members">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const { data: members, error: loadError } = await getSupabaseAdmin()
    .from("members")
    .select("id, name, rank, is_clinic, is_admin, is_active, must_change_password")
    .order("is_active", { ascending: false })
    .order("name");
  const list = members ?? [];
  const noRank = list.filter((m) => m.is_active && !m.rank).length;

  return (
    <Page title="인원 관리">
      <div className="space-y-3">
        {loadError && (
          <Notice kind="error">
            인원 목록을 불러오지 못했습니다. 계급 기능용 SQL(supabase/migrations/0004_rank_and_delete.sql)을 Supabase SQL
            Editor에서 실행했는지 확인해 주세요. (/status 화면에서 확인 가능)
          </Notice>
        )}
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
        {noRank > 0 && (
          <Notice kind="warn">계급이 없는 인원 {noRank}명 — 계급이 없으면 화요일부터만 투표할 수 있습니다.</Notice>
        )}
      </div>

      {/* 한 명 추가 */}
      <form action={addMemberAction} className="mt-3 space-y-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        <p className="text-sm font-semibold">인원 한 명 추가 (초기 비밀번호 1111)</p>
        <div className="flex gap-2">
          <input
            name="name"
            required
            maxLength={30}
            placeholder="이름 (동명이인은 홍길동B)"
            className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          <select
            name="rank"
            defaultValue=""
            className="rounded-lg border border-zinc-300 bg-white px-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">계급</option>
            <option value="이병">이병</option>
            <option value="일병">일병</option>
            <option value="상병">상병</option>
            <option value="병장">병장</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="is_clinic" className="h-4 w-4" /> 진료반
        </label>
        <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
          추가
        </button>
      </form>

      <div className="mt-3 flex gap-2 text-sm">
        <Link href="/admin/members/import" className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-center dark:border-zinc-700">
          + 인원 일괄 등록
        </Link>
        <Link href="/admin/audit" className="flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-center dark:border-zinc-700">
          변경 이력
        </Link>
      </div>

      <p className="mt-4 mb-2 text-sm text-zinc-500">
        전체 {list.length}명 (활성 {list.filter((m) => m.is_active).length}명) · 이름을 누르면 상세 관리
      </p>
      {/* 삭제용 폼: 체크박스들이 form="delete-form" 으로 이 폼에 연결됩니다 */}
      <form id="delete-form" action={deleteMembersAction} />
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {list.map((m) => (
          <li key={m.id} className={`flex items-center gap-2 px-3 py-2 ${m.is_active ? "" : "bg-zinc-50 dark:bg-zinc-900"}`}>
            <input
              type="checkbox"
              name="ids"
              value={m.id}
              form="delete-form"
              disabled={m.id === me.id}
              aria-label={`${m.name} 선택`}
              className="h-5 w-5 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <Link
                href={`/admin/members/${m.id}`}
                className={`underline decoration-zinc-300 ${m.is_active ? "font-medium" : "text-zinc-400 line-through"}`}
              >
                {m.name}
              </Link>
              <span className="ml-1 space-x-1 text-[11px]">
                {m.is_clinic && <span className="rounded bg-teal-100 px-1 py-0.5 text-teal-800">진료반</span>}
                {m.is_admin && <span className="rounded bg-blue-100 px-1 py-0.5 text-blue-800">관리자</span>}
                {!m.is_active && <span className="rounded bg-zinc-200 px-1 py-0.5 text-zinc-600">비활성</span>}
                {m.must_change_password && m.is_active && (
                  <span className="rounded bg-zinc-100 px-1 py-0.5 text-zinc-500">첫 로그인 전</span>
                )}
              </span>
            </div>
            <form action={updateRankAction}>
              <input type="hidden" name="member_id" value={m.id} />
              <RankSelect defaultValue={m.rank ?? ""} />
            </form>
          </li>
        ))}
      </ul>

      <div className="mt-4">
        <DeleteButton />
        <p className="mt-2 text-xs text-zinc-500">
          과거 근무 명단에 있던 사람은 기록 보존을 위해 삭제 대신 비활성화됩니다. 본인과 마지막 관리자는 삭제할 수 없습니다.
        </p>
      </div>

      <Link href="/admin" className="mt-6 block text-center text-sm text-zinc-500 underline">
        돌아가기
      </Link>
    </Page>
  );
}
