# 주말·공휴일 출근 투표 및 추첨 사이트

주말·공휴일 출근자를 휴대폰 투표 + 자동 추첨으로 정하는 웹사이트입니다.
전체 기획은 [`docs/PLAN.md`](docs/PLAN.md)를 보세요.

- **Next.js**: 화면과 서버 기능을 함께 만드는 웹 프레임워크(뼈대 도구)
- **Supabase**: 인터넷에 있는 데이터베이스(데이터 창고)
- **Vercel**: 완성된 사이트를 인터넷에 올려 주는 배포 서비스

## 진행 상황

- [x] 1단계: 준비 (프로젝트 뼈대, `.env`/`.gitignore`)
- [x] 2단계: 데이터 창고 설계
- [x] 3단계: 로그인과 인원 일괄 등록
- [ ] 4단계: 근무일 자동 생성
- [ ] 5단계: 투표 화면
- [ ] 6단계: 추첨 기능
- [ ] 7단계: 관리자 화면
- [ ] 8단계: 텍스트 복사, 자동 추첨 예약
- [ ] 9단계: 테스트와 배포

## 3단계: 로그인과 인원 일괄 등록

| 주소 | 화면 | 누가 |
|---|---|---|
| `/login` | 이름 + 비밀번호 로그인 | 모두 |
| `/change-password` | 비밀번호 변경 (첫 로그인 때 강제) | 로그인한 인원 |
| `/home` | 로그인 후 첫 화면 (5단계에서 투표 화면이 됨) | 로그인한 인원 |
| `/admin/members/import` | 인원 일괄 등록 | 관리자 |
| `/status` | 서버 점검 화면 | 모두 (비밀 값은 보이지 않음) |
| `/emergency` | 비상 관리자 복구 (링크 없음, 주소를 아는 사람만) | `EMERGENCY_KEY` 를 아는 사람 |

규칙
- 비밀번호는 해시로만 저장하고, 새 비밀번호는 6자 이상입니다.
- 비밀번호를 5번 연속 틀리면 그 이름은 10분 동안 로그인이 차단됩니다.
- 일괄 등록 때 초기 비밀번호를 비우면 **1111** 로 등록됩니다. 첫 로그인 때 각자 새 비밀번호(6자 이상)로 바꿔야 다른 화면을 쓸 수 있습니다.
- 비밀번호를 바꾸면 다른 기기의 로그인은 자동으로 풀립니다.

### 첫 관리자 만들기
1. Vercel → Settings → Environment Variables 에 `EMERGENCY_KEY` 추가 (Secret, 본인이 정한 16자 이상 문장) → Redeploy
2. 사이트 주소 뒤에 `/emergency` 를 붙여 접속 → 비상 키, 관리자 이름, 비밀번호 입력
3. `/login` 에서 로그인 → 홈의 "인원 일괄 등록"에서 인원 등록

## 2단계: 데이터 창고(표) 만들기

표 설계는 [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) 에 있습니다.

| 표 | 내용 |
|---|---|
| `members` | 인원 (이름, 비밀번호 해시, 진료반·관리자·활성 여부) |
| `posts` | 근무 자리 설정 (진료실 2 / 관리1동 1 / 관리2동 3 / 관리3동 4 / 훈련동 4 / 종모견동 2 / 분만실 1) |
| `duty_day_overrides` | 근무일 수동 추가·삭제 |
| `duty_day_post_counts` | 특정 날짜만 자리별 인원 변경 |
| `responses` | 희망 / 미희망 응답 |
| `absences` | 휴가·부상(제외) 기간 |
| `draws` | 추첨 실행 기록 (근무일당 1번만 가능) |
| `assignments` | 확정 명단 (희망 확정 / 차출 / 관리자 수정) |
| `audit_logs` | 변경 이력 |

실행 방법:
1. GitHub에서 `supabase/migrations/0001_init.sql` 파일을 열고, 오른쪽 위 **복사 버튼(Copy raw file)** 을 누릅니다.
2. Supabase 대시보드 → 왼쪽 **SQL Editor** → 빈 편집창에 붙여넣기 → **Run**.
3. "Success. No rows returned" 가 나오면 성공. 사이트 점검 화면의 4번째 줄이 **정상**이 됩니다.

> 이 SQL은 **한 번만** 실행합니다. 두 번 실행하면 "already exists(이미 있음)" 오류가 나는데, 이미 만들어졌다는 뜻이므로 괜찮습니다.

## 1단계: 아이패드(또는 컴퓨터 없이)로 확인하기 — Vercel 사용

아이패드에서는 프로그램을 직접 실행할 수 없으므로, Vercel이 GitHub 코드를 받아 인터넷에 띄워 주는 방식으로 확인합니다.

1. <https://vercel.com> 에서 **Add New… → Project**를 누르고, 이 저장소를 **Import** 합니다.
2. 설정 화면에서 **Environment Variables**를 펼쳐 아래 2개를 입력합니다.
   - `SUPABASE_URL` = Supabase의 Project URL
   - `SUPABASE_SECRET_KEY` = Supabase의 Secret key (`sb_secret_...`)
3. **Deploy**를 누르고, 끝나면 나오는 주소(`https://….vercel.app`)를 엽니다.
4. 세 줄이 모두 **정상**이면 1단계 완료입니다.

> 환경변수를 나중에 바꾸면 **Deployments → 최근 배포의 ⋯ → Redeploy**를 해야 반영됩니다.
>
> Vercel 무료(Hobby) 플랜은 비공개 저장소에서 **계정 주인이 작성한 커밋만 자동 배포**합니다.
> 그래서 이 저장소의 커밋 작성자는 저장소 주인 계정으로 설정되어 있습니다.

## 1단계: 내 컴퓨터에서 실행하기

### 준비물
- [Node.js](https://nodejs.org/) 20 이상 (LTS 버전 권장)
- Git

### 순서
```bash
# 1) 저장소 내려받기 (이미 받았다면 생략)
git clone https://github.com/goodpsh1228-rgb/K-9-work-over-the-weekend-.git
cd K-9-work-over-the-weekend-
git checkout claude/weekend-duty-voting-lottery-7xwqkx

# 2) 필요한 부품(패키지) 설치
npm install

# 3) 환경변수 파일 만들기: 예시 파일을 복사
cp .env.example .env.local      # (Windows PowerShell: copy .env.example .env.local)

# 4) .env.local 을 메모장/VS Code로 열어 Supabase 값 2개 채우기

# 5) 개발 서버 켜기
npm run dev
```
브라우저에서 <http://localhost:3000> 을 열면 "준비 상태 점검 화면"이 보입니다.
세 항목이 모두 **정상**이면 1단계 완료입니다.

> ⚠️ `.env.local` 에는 비밀 키가 들어갑니다. 이 파일은 `.gitignore` 에 의해 GitHub에 올라가지 않습니다.
> 비밀 키를 채팅·메신저에 붙여넣지 마세요.
