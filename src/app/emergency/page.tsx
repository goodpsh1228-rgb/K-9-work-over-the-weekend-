// ─────────────────────────────────────────────────────────────
// 비상 관리자 복구 화면 (/emergency)
// - 사이트 어디에도 이 화면으로 가는 링크를 두지 않습니다. 주소를 아는 사람만 들어옵니다.
// - 서버 환경변수 EMERGENCY_KEY 를 정확히 입력해야만 동작합니다.
// - 처음 관리자 1명을 만들 때, 또는 관리자가 모두 로그인할 수 없을 때 사용합니다.
// ─────────────────────────────────────────────────────────────
import type { Metadata } from "next";
import { Page } from "@/components/ui";
import { EmergencyForm } from "./emergency-form";

// 검색엔진에 노출되지 않게 합니다.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function EmergencyPage() {
  return (
    <Page title="비상 관리자 복구">
      <p className="mb-4 text-sm text-zinc-500">
        서버에 설정한 비상 키가 필요합니다. 입력한 이름이 없으면 새 관리자로 등록되고, 있으면 관리자 권한과
        새 비밀번호가 설정됩니다.
      </p>
      <EmergencyForm />
    </Page>
  );
}
