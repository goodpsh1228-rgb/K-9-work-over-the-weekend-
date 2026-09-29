// ─────────────────────────────────────────────────────────────
// 변경 이력 화면 (/admin/audit) — 관리자 전용
//   누가 · 언제 · 무엇을 · 어떻게 바꿨는지 최신순으로 50개씩 보여 줍니다.
//   ?member=번호 를 붙이면 그 사람과 관련된 기록만 봅니다.
//   맨 아래 "더 보기"로 이전 기록을 이어서 봅니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { formatShort } from "@/lib/kst";
import { actionLabel, detailText } from "@/lib/audit-labels";
import { Page } from "@/components/ui";

const PAGE_SIZE = 50;

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  // 주소 뒤 숫자만 받아들임 (잘못된 값은 무시)
  const toId = (v: unknown) => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null);
  const memberId = toId(sp.member);
  const before = toId(sp.before);

  const db = getSupabaseAdmin();
  let query = db
    .from("audit_logs")
    .select("id, actor_id, action, target_member_id, duty_date, details, created_at")
    .order("id", { ascending: false })
    .limit(PAGE_SIZE);
  if (memberId) query = query.or(`target_member_id.eq.${memberId},actor_id.eq.${memberId}`);
  if (before) query = query.lt("id", before);
  const [{ data: logs }, { data: members }] = await Promise.all([query, db.from("members").select("id, name")]);
  const nameOf = new Map((members ?? []).map((m) => [m.id as number, m.name as string]));
  const list = logs ?? [];

  return (
    <Page title="변경 이력">
      {memberId && (
        <p className="-mt-4 mb-3 text-sm">
          <b>{nameOf.get(memberId) ?? "삭제된 인원"}</b> 관련 기록만 보는 중 ·{" "}
          <Link href="/admin/audit" className="text-blue-600 underline">
            전체 보기
          </Link>
        </p>
      )}
      {list.length === 0 ? (
        <p className="text-sm text-zinc-500">기록이 없습니다.</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
          {list.map((l) => {
            const detail = detailText(l.action, (l.details ?? {}) as Record<string, unknown>);
            const target = l.target_member_id && l.target_member_id !== l.actor_id ? nameOf.get(l.target_member_id) : null;
            return (
              <li key={l.id} className="px-3 py-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{actionLabel(l.action)}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {new Date(l.created_at).toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      month: "numeric",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                <p className="text-zinc-600 dark:text-zinc-400">
                  <span className="text-zinc-500">누가:</span> {l.actor_id ? (nameOf.get(l.actor_id) ?? "삭제된 인원") : "시스템"}
                  {target && (
                    <>
                      {" "}
                      · <span className="text-zinc-500">대상:</span> {target}
                    </>
                  )}
                  {l.duty_date && (
                    <>
                      {" "}
                      · <span className="text-zinc-500">근무일:</span> {formatShort(l.duty_date)}
                    </>
                  )}
                </p>
                {detail && <p className="text-zinc-600 dark:text-zinc-400">{detail}</p>}
              </li>
            );
          })}
        </ul>
      )}
      {list.length === PAGE_SIZE && (
        <Link
          href={`/admin/audit?${memberId ? `member=${memberId}&` : ""}before=${list[list.length - 1].id}`}
          className="mt-3 block rounded-lg border border-zinc-300 py-2 text-center text-sm dark:border-zinc-700"
        >
          더 보기 (이전 기록)
        </Link>
      )}
      <Link href="/home" className="mt-6 block text-center text-sm text-zinc-500 underline">
        돌아가기
      </Link>
    </Page>
  );
}
