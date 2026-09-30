// ─────────────────────────────────────────────────────────────
// 인원 일괄 등록 화면 (/admin/members/import) — 관리자 전용
// 아래쪽에 현재 등록된 인원 목록도 함께 보여줍니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { Page } from "@/components/ui";
import { ImportForm } from "./import-form";

export default async function ImportPage() {
  await requireAdmin(); // 관리자가 아니면 /home 으로 보냄

  const { data: members } = await getSupabaseAdmin()
    .from("members")
    .select("id, name, is_clinic, is_admin, is_active, must_change_password")
    .eq("is_active", true) // 비활성(전출·전역) 인원은 표시하지 않음
    .order("name");

  return (
    <Page title="인원 일괄 등록">
      <ImportForm />

      <h2 className="mt-10 mb-2 text-lg font-bold">현재 등록된 인원 ({members?.length ?? 0}명)</h2>
      <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 text-sm dark:divide-zinc-800 dark:border-zinc-800">
        {(members ?? []).map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 px-3 py-2">
            <span className={m.is_active ? "" : "text-zinc-400 line-through"}>{m.name}</span>
            <span className="space-x-1 text-xs">
              {m.is_clinic && <span className="rounded bg-teal-100 px-1.5 py-0.5 text-teal-800">진료반</span>}
              {m.is_admin && <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800">관리자</span>}
              {m.must_change_password && (
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-600">첫 로그인 전</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <Link href="/admin/members" className="mt-6 block text-center text-sm text-zinc-500 underline">
        돌아가기
      </Link>
    </Page>
  );
}
