// ─────────────────────────────────────────────────────────────
// 인원 상세 화면 (/admin/members/12 같은 주소) — 관리자 전용
//   한 사람에 대한 관리 버튼을 모아 둔 곳입니다. 중요한 작업은 확인창을 거칩니다.
//   - 진료반 여부 변경
//   - 비밀번호 초기화 (1111)
//   - 관리자 지정 (다른 사람) / 내 권한 내려놓기 (본인)
//   - 비활성화 / 다시 활성화
//   - 이 사람의 최근 변경 이력
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Notice, Page } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { actionLabel } from "@/lib/audit-labels";
import {
  grantAdminAction,
  relinquishAdminAction,
  resetPasswordAction,
  setActiveAction,
  setClinicAction,
} from "../actions";

// 지금 로그인 차단 중인지 (차단 끝 시각이 현재보다 뒤)
function isLockedNow(until: string | null): boolean {
  return Boolean(until) && new Date(until!).getTime() > Date.now();
}

const btn = "w-full rounded-lg border px-4 py-3 text-sm font-semibold";

export default async function MemberDetailPage({ params, searchParams }: PageProps<"/admin/members/[id]">) {
  const me = await requireAdmin();
  const id = Number((await params).id);
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;

  const db = getSupabaseAdmin();
  const { data: m } = await db
    .from("members")
    .select("id, name, rank, is_clinic, is_admin, is_active, must_change_password, locked_until, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!m) notFound();
  const { data: logs } = await db
    .from("audit_logs")
    .select("id, action, created_at, duty_date")
    .or(`target_member_id.eq.${id},actor_id.eq.${id}`)
    .order("created_at", { ascending: false })
    .limit(10);
  const isMe = m.id === me.id;
  const locked = isLockedNow(m.locked_until);

  return (
    <Page title={m.name}>
      <p className="-mt-4 mb-4 space-x-1 text-sm">
        <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-700">{m.rank ?? "계급 미지정"}</span>
        {m.is_clinic && <span className="rounded bg-teal-100 px-2 py-0.5 text-teal-800">진료반</span>}
        {m.is_admin && <span className="rounded bg-blue-100 px-2 py-0.5 text-blue-800">관리자</span>}
        {!m.is_active && <span className="rounded bg-zinc-200 px-2 py-0.5 text-zinc-600">비활성</span>}
        {m.must_change_password && <span className="rounded bg-zinc-100 px-2 py-0.5 text-zinc-500">첫 로그인 전</span>}
        {locked && <span className="rounded bg-red-100 px-2 py-0.5 text-red-800">로그인 차단 중</span>}
      </p>
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      <div className="mt-4 space-y-3">
        {/* 진료반 여부 */}
        <form action={setClinicAction}>
          <input type="hidden" name="member_id" value={m.id} />
          <input type="hidden" name="value" value={String(!m.is_clinic)} />
          <ConfirmButton
            message={m.is_clinic ? `${m.name} 을(를) 진료반에서 뺄까요? (일반 추첨 대상이 됩니다)` : `${m.name} 을(를) 진료반으로 바꿀까요? (진료실 추첨에만 들어갑니다)`}
            className={`${btn} border-teal-300 text-teal-800 dark:text-teal-300`}
          >
            {m.is_clinic ? "진료반에서 빼기" : "진료반으로 지정"}
          </ConfirmButton>
        </form>

        {/* 비밀번호 초기화 */}
        <form action={resetPasswordAction}>
          <input type="hidden" name="member_id" value={m.id} />
          <ConfirmButton
            message={`${m.name} 의 비밀번호를 1111 로 초기화할까요?\n다음 로그인 때 새 비밀번호로 바꾸게 되고, 로그인 차단도 풀립니다.`}
            className={`${btn} border-zinc-300 dark:border-zinc-700`}
          >
            비밀번호 초기화 (1111)
          </ConfirmButton>
        </form>

        {/* 관리자 지정 / 내려놓기 */}
        {isMe ? (
          <form action={relinquishAdminAction}>
            <ConfirmButton
              message="정말 내 관리자 권한을 내려놓으시겠어요?\n다시 관리자가 되려면 다른 관리자가 지정해 줘야 합니다."
              className={`${btn} border-blue-300 text-blue-800 dark:text-blue-300`}
            >
              내 관리자 권한 내려놓기
            </ConfirmButton>
          </form>
        ) : (
          !m.is_admin &&
          m.is_active && (
            <form action={grantAdminAction}>
              <input type="hidden" name="member_id" value={m.id} />
              <ConfirmButton
                message={`정말 ${m.name} 을(를) 관리자로 지정하시겠어요?`}
                className={`${btn} border-blue-300 text-blue-800 dark:text-blue-300`}
              >
                관리자로 지정
              </ConfirmButton>
            </form>
          )
        )}
        {!isMe && m.is_admin && (
          <p className="text-xs text-zinc-500">관리자 권한은 본인만 내려놓을 수 있습니다.</p>
        )}

        {/* 비활성화 / 다시 활성화 */}
        {!isMe && (
          <form action={setActiveAction}>
            <input type="hidden" name="member_id" value={m.id} />
            <input type="hidden" name="value" value={String(!m.is_active)} />
            <ConfirmButton
              message={
                m.is_active
                  ? `${m.name} 을(를) 비활성화할까요? (전출·전역 등)\n로그인·투표·추첨에서 빠지고, 과거 명단에는 남습니다.`
                  : `${m.name} 을(를) 다시 활성화할까요?`
              }
              className={`${btn} ${m.is_active ? "border-red-300 text-red-700" : "border-green-300 text-green-700"}`}
            >
              {m.is_active ? "비활성화 (전출·전역)" : "다시 활성화"}
            </ConfirmButton>
          </form>
        )}
      </div>

      <h2 className="mt-8 mb-2 text-lg font-bold">최근 변경 이력</h2>
      {(logs ?? []).length === 0 ? (
        <p className="text-sm text-zinc-500">기록이 없습니다.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {(logs ?? []).map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span>{actionLabel(l.action)}</span>
              <span className="shrink-0 text-xs text-zinc-500">
                {new Date(l.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", dateStyle: "short", timeStyle: "short" })}
              </span>
            </li>
          ))}
        </ul>
      )}
      <Link href={`/admin/audit?member=${m.id}`} className="mt-2 block text-sm text-blue-600 underline">
        전체 이력 보기
      </Link>

      <Link href="/admin/members" className="mt-6 block text-center text-sm text-zinc-500 underline">
        인원 목록으로
      </Link>
    </Page>
  );
}
