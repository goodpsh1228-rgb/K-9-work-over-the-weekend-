// ─────────────────────────────────────────────────────────────
// 휴가·부상 입력 화면 (/absences)
//   - 시작일~종료일을 입력하면 그 기간에 걸친 근무일에서 바로 제외됩니다.
//   - 일반 인원: 본인 기록만 보고 입력·삭제
//   - 관리자: 인원을 골라 대신 입력, 모든 사람의 기록을 보고 삭제 가능
//   - 끝난 지 30일이 지난 기록은 목록에서 숨깁니다(데이터는 남아 있음).
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { addDays, formatShort, todayKST } from "@/lib/kst";
import { Notice, Page } from "@/components/ui";
import { addAbsenceAction, deleteAbsenceAction } from "./actions";

const KIND_LABEL: Record<string, string> = { leave: "휴가", injury: "부상" };
const inputClass =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";

export default async function AbsencesPage({ searchParams }: PageProps<"/absences">) {
  const me = await requireMember();
  const sp = await searchParams;
  const msg = typeof sp.msg === "string" ? sp.msg : null;
  const error = typeof sp.error === "string" ? sp.error : null;
  const today = todayKST();

  const db = getSupabaseAdmin();
  let query = db
    .from("absences")
    .select("id, member_id, kind, start_date, end_date, created_by")
    .gte("end_date", addDays(today, -30))
    .order("start_date");
  if (!me.is_admin) query = query.eq("member_id", me.id);
  const [{ data: rows }, { data: members }] = await Promise.all([
    query,
    db.from("members").select("id, name, is_active").order("name"),
  ]);
  const nameOf = new Map((members ?? []).map((m) => [m.id as number, m.name as string]));

  return (
    <Page title="휴가·부상 입력">
      <div className="space-y-3">
        {msg && <Notice kind="success">{msg}</Notice>}
        {error && <Notice kind="error">{error}</Notice>}
      </div>

      <form action={addAbsenceAction} className="mt-3 space-y-3 rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
        {me.is_admin && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">누구 (관리자)</span>
            <select name="member_id" defaultValue={me.id} className={inputClass}>
              {(members ?? [])
                .filter((m) => m.is_active)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === me.id ? " (나)" : ""}
                  </option>
                ))}
            </select>
          </label>
        )}
        <fieldset className="flex gap-4">
          <legend className="mb-1 text-sm font-medium">종류</legend>
          <label className="flex items-center gap-1">
            <input type="radio" name="kind" value="leave" defaultChecked /> 휴가
          </label>
          <label className="flex items-center gap-1">
            <input type="radio" name="kind" value="injury" /> 부상
          </label>
        </fieldset>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">시작일</span>
            <input type="date" name="start_date" required className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">종료일</span>
            <input type="date" name="end_date" required className={inputClass} />
          </label>
        </div>
        <p className="text-xs text-zinc-500">
          시작일과 종료일 모두 포함합니다. 입력 즉시 제외되며, 이 기간 근무일의 &quot;희망&quot;은 자동 취소됩니다.
        </p>
        <button type="submit" className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white">
          저장
        </button>
      </form>

      <h2 className="mt-8 mb-2 text-lg font-bold">{me.is_admin ? "전체 기록" : "내 기록"}</h2>
      {(rows ?? []).length === 0 ? (
        <p className="text-sm text-zinc-500">기록이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                {me.is_admin && <b className="mr-1">{nameOf.get(r.member_id)}</b>}
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  {KIND_LABEL[r.kind]}
                </span>{" "}
                {formatShort(r.start_date)} ~ {formatShort(r.end_date)}
                {r.created_by !== r.member_id && (
                  <span className="ml-1 text-xs text-zinc-500">(입력: {nameOf.get(r.created_by)})</span>
                )}
              </div>
              <form action={deleteAbsenceAction}>
                <input type="hidden" name="id" value={r.id} />
                <button type="submit" className="rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700">
                  삭제
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <Link href="/home" className="mt-6 block text-center text-sm text-zinc-500 underline">
        돌아가기
      </Link>
    </Page>
  );
}
