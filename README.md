# 주말·공휴일 출근 투표 및 추첨 사이트

주말·공휴일 출근자를 휴대폰 투표 + 자동 추첨으로 정하는 웹사이트입니다.
전체 기획은 [`docs/PLAN.md`](docs/PLAN.md)를 보세요.

- **Next.js**: 화면과 서버 기능을 함께 만드는 웹 프레임워크(뼈대 도구)
- **Supabase**: 인터넷에 있는 데이터베이스(데이터 창고)
- **Vercel**: 완성된 사이트를 인터넷에 올려 주는 배포 서비스

## 진행 상황

- [x] 1단계: 준비 (프로젝트 뼈대, `.env`/`.gitignore`)
- [ ] 2단계: 데이터 창고 설계
- [ ] 3단계: 로그인과 인원 일괄 등록
- [ ] 4단계: 근무일 자동 생성
- [ ] 5단계: 투표 화면
- [ ] 6단계: 추첨 기능
- [ ] 7단계: 관리자 화면
- [ ] 8단계: 텍스트 복사, 자동 추첨 예약
- [ ] 9단계: 테스트와 배포

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
