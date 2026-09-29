// ─────────────────────────────────────────────────────────────
// 비밀번호 변경 화면 (/change-password)
// 첫 로그인(또는 관리자가 초기화한 뒤)에는 이 화면을 반드시 거쳐야 다른 화면을 쓸 수 있습니다.
// ─────────────────────────────────────────────────────────────
import Link from "next/link";
import { requireMember } from "@/lib/session";
import { Notice, Page } from "@/components/ui";
import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const me = await requireMember({ allowMustChange: true });
  return (
    <Page title="비밀번호 변경">
      {me.must_change_password && (
        <div className="mb-4">
          <Notice kind="warn">
            {me.name} 님, 처음 로그인하셨습니다. 본인만 아는 새 비밀번호로 바꿔 주세요.
          </Notice>
        </div>
      )}
      <ChangePasswordForm needCurrent={!me.must_change_password} />
      {!me.must_change_password && (
        <Link href="/home" className="mt-6 block text-center text-sm text-zinc-500 underline">
          돌아가기
        </Link>
      )}
    </Page>
  );
}
