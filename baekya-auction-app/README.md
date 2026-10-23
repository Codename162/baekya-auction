# 백야 AUCTION — 실제 서비스용 웹 앱 소스

이 프로젝트는 Vite + React + Supabase로 구성된 백야 롤 내전 경매 사이트입니다. Discord OAuth 로그인, Supabase DB 저장, 실시간 구독, 팀장 입찰 RPC, 관리자 낙찰 처리 기능을 포함합니다.

> 중요: 이 소스 패키지는 배포 준비물입니다. 현재 OpenAI/ChatGPT가 사용자의 Supabase·Discord·호스팅 계정에 접근하거나 공개 배포한 상태는 아닙니다. 아래 계정 설정을 완료해야 실제 온라인 서비스로 작동합니다.

## 기본 규칙

- 3팀, 팀당 5명
- 팀장별 예산 30P, 총 90P
- 팀장은 팀에 무료 배정되고 경매 대상에서 제외
- 등급 시작가: S=8P, A=6P, B=4P, C=3P, D=1P
- 입찰 단위 1P
- 서버 RPC에서 팀장 권한, 경매 상태, 예산, 팀 인원을 확인
- 낙찰은 관리자만 확정하고 DB 트랜잭션 안에서 예산 차감 및 기록 저장

## 1. Supabase 프로젝트 만들기

1. https://supabase.com 에서 프로젝트를 생성합니다.
2. **SQL Editor**에서 `supabase/migrations/001_schema.sql` 전체를 실행합니다.
3. 기본 경매 방과 3개 팀, 12명의 예시 경매 선수가 생성됩니다.
4. 기본 방 UUID는 다음과 같습니다.

   `bace0000-0000-4000-8000-000000000001`

## 2. Discord OAuth 연결

1. https://discord.com/developers/applications 에서 New Application을 만듭니다.
2. OAuth2 설정에서 Client ID와 Client Secret을 준비합니다.
3. Supabase 대시보드의 **Authentication → Providers → Discord**에서 Discord provider를 켜고 Client ID/Secret을 입력합니다.
4. Supabase 대시보드의 **Authentication → URL Configuration**에서 개발 중 Redirect URL과 배포 도메인을 허용합니다. OAuth callback은 Supabase 대시보드에 표시된 callback URL을 Discord Developer Portal에 등록합니다.
5. 사이트 로그인은 Supabase의 Discord OAuth를 사용합니다. 사용자 프로필은 첫 로그인 시 자동 생성됩니다.

## 3. 최초 관리자 지정

1. 사이트를 실행하고 자신의 Discord 계정으로 한 번 로그인합니다.
2. Supabase → Authentication → Users에서 해당 사용자의 UUID를 복사합니다.
3. SQL Editor에서 아래 쿼리의 UUID를 실제 값으로 바꿔 실행합니다.

```sql
update public.profiles
set role = 'admin'
where id = '여기에-내-사용자-UUID';
```

로그아웃 후 다시 로그인하면 관리자 메뉴가 나타납니다. 관리자 메뉴에서 로그인한 참가자를 팀장으로 지정할 수 있습니다. 팀장 지정 시 팀장 선수는 무료로 명단에 포함됩니다.

## 4. 로컬 실행

Node.js 20 이상 권장.

```bash
cp .env.example .env
```

`.env` 파일을 열어 다음 값을 채웁니다.

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_ROOM_ID=bace0000-0000-4000-8000-000000000001
```

Supabase의 anon/publishable key만 브라우저에 사용하세요. `service_role` key는 절대 `.env`의 `VITE_` 변수로 넣거나 브라우저에 노출하면 안 됩니다.

```bash
npm install
npm run dev
```

## 5. 인터넷 배포 (예: Vercel)

1. 이 폴더를 GitHub 저장소에 올립니다.
2. Vercel에서 해당 저장소를 Import합니다.
3. Build command `npm run build`, Output directory `dist`를 사용합니다.
4. Vercel Project Settings → Environment Variables에 `.env`의 세 변수를 등록합니다.
5. 배포 후 도메인을 Supabase Auth URL Configuration과 Discord OAuth redirect 설정에 추가합니다.

배포 플랫폼의 계정 로그인·승인과 환경변수 입력은 계정 소유자가 직접 해야 합니다.

## 보안/운영 메모

- 입찰 및 낙찰은 Postgres RPC로 실행되어 예산 차감과 낙찰 기록이 DB에서 처리됩니다.
- 테이블은 RLS를 사용합니다. 참가자는 읽기만 가능하고, 관리자만 선수 등록/관리 작업을 수행할 수 있도록 정책이 설정되어 있습니다.
- 팀장 입찰은 로그인한 사용자 UUID와 팀장 계정이 일치해야 합니다.
- 현재 UI는 입찰 단위 1P, 팀당 5명, 30P 초기 예산을 기본으로 합니다.
- 팀장별 등급은 `assign_team_captain` RPC의 `p_grade` 기본값 B입니다. 필요하면 SQL에서 호출할 때 다른 등급을 넘길 수 있습니다.
- 운영 전에 Supabase 프로젝트의 RLS, OAuth redirect, 실시간 구독, 실제 계정 3개 이상으로 동시 입찰을 테스트하세요.
- 이 버전은 웹사이트의 기본 경매 플로우를 포함하지만, 사용자 신고/차단, 관리자 감사 로그, 자동 백업, 비밀번호 없는 Discord OAuth 외의 로그인 수단은 포함하지 않습니다.
