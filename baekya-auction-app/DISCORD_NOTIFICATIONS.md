# Discord 알림 연동 설정

백야 사이트는 관리자 권한을 서버에서 확인한 뒤 Discord webhook으로 공지/대회 알림을 전송합니다. Webhook URL은 브라우저 코드에 넣지 마세요.

Vercel 프로젝트의 **Settings → Environment Variables**에서 아래 값을 Production(필요하면 Preview에도)으로 설정하고 재배포하세요.

- `DISCORD_WEBHOOK_URL`: 알림을 받을 Discord 채널의 webhook URL
- `SUPABASE_URL`: 기존 Supabase Project URL
- `SUPABASE_ANON_KEY`: 기존 Supabase anon/publishable key

서버는 요청의 Supabase access token을 검증하고 `profiles.role = 'admin'`인 계정만 알림을 보낼 수 있도록 확인합니다. Service-role key는 필요하지 않습니다.

이 API는 Vercel 프로젝트 루트가 `baekya-auction-app`일 때 `/api/discord-notify` 경로로 배포됩니다.
