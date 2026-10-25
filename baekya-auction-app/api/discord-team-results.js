import { createClient } from '@supabase/supabase-js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

function clean(value, max = 100) {
  return String(value ?? '').replace(/[\\u0000-\\u001f\\u007f]/g, '').trim().slice(0, max);
}

export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  let allowedOrigin = '';
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'baekya-auction.vercel.app' || (parsed.hostname.endsWith('.vercel.app') && parsed.hostname.includes('baekya-auction')))) {
      allowedOrigin = origin;
    }
  } catch {}

  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 허용됩니다.' });
  if (!allowedOrigin) return send(res, 403, { error: '허용되지 않은 사이트에서 요청했습니다.' });

  const webhook = process.env.DISCORD_TEAM_WEBHOOK_URL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!webhook) return send(res, 503, { error: '서버에 디스코드 웹훅이 아직 설정되지 않았습니다. Vercel 환경변수 DISCORD_TEAM_WEBHOOK_URL을 등록해 주세요.' });
  if (!supabaseUrl || !supabaseAnonKey) return send(res, 503, { error: '서버의 Supabase 환경변수가 설정되지 않았습니다.' });

  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return send(res, 401, { error: '로그인이 필요합니다.' });

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: 'Bearer ' + token } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return send(res, 401, { error: '로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.' });

    const { data: profile, error: profileError } = await supabase
      .from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profileError) return send(res, 403, { error: '관리자 권한을 확인하지 못했습니다.' });
    if (profile?.role !== 'admin') return send(res, 403, { error: '관리자만 팀 결과를 전송할 수 있습니다.' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const roomName = clean(body.roomName || '백야 내전', 80);
    const teamSize = Number(body.teamSize);
    const teams = body.teams;
    if (!Number.isInteger(teamSize) || teamSize < 2 || teamSize > 10 || !Array.isArray(teams) || teams.length < 2 || teams.length > 10) {
      return send(res, 400, { error: '팀 구성 정보가 올바르지 않습니다.' });
    }

    const fields = [];
    for (const team of teams) {
      const name = clean(team?.name, 100);
      const roster = team?.players;
      if (!name) return send(res, 400, { error: '팀 이름이 비어 있습니다. 팀 이름을 확인해 주세요.' });
      if (!Array.isArray(roster)) return send(res, 400, { error: `${name}: 팀원 명단을 읽지 못했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.` });
      if (roster.length !== teamSize) return send(res, 400, { error: `${name}: 현재 ${roster.length}명으로 확인됩니다. 팀당 설정 인원은 ${teamSize}명입니다. 팀 배정을 새로고침해 주세요.` });
      const emptyNameIndex = roster.findIndex(p => !clean(p?.name, 80));
      if (emptyNameIndex !== -1) {
        const playerId = clean(roster[emptyNameIndex]?.id, 80);
        const playerHint = playerId ? ` (선수 ID 끝자리: ${playerId.slice(-6)})` : '';
        return send(res, 400, { error: `${name} 팀의 ${emptyNameIndex + 1}번째 선수${playerHint} 닉네임이 비어 있습니다. 관리자 메뉴에서 닉네임을 입력하고 저장한 뒤 다시 전송해 주세요.` });
      }
      const lines = roster.map(player => {
        const playerName = clean(player.name, 80).replace(/([\\\\*_~`|>])/g, '\\\\$1');
        const role = player.isCaptain ? ' **[TL]**' : '';
        const price = Number.isFinite(Number(player.soldPrice)) && player.soldPrice !== null ? ' · 낙찰 ' + Number(player.soldPrice) + 'P' : '';
        return '• ' + playerName + role + price;
      });
      const value = lines.join('\\n').slice(0, 1024);
      fields.push({ name: name.slice(0, 256), value, inline: teams.length <= 3 });
    }

    const payload = {
      allowed_mentions: { parse: [] },
      embeds: [{
        title: '🌙 백야 내전 팀 편성 결과',
        description: roomName + ' · ' + teams.length + '개 팀 · 팀당 ' + teamSize + '명',
        color: 0x8877e8,
        fields,
        footer: { text: 'BAEKYA · PLAYER DRAFT SYSTEM' },
        timestamp: new Date().toISOString()
      }]
    };

    const discordResponse = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!discordResponse.ok) {
      return send(res, 502, { error: '디스코드에서 메시지를 받지 못했습니다. 웹훅 주소와 채널 설정을 확인해 주세요.' });
    }
    return send(res, 200, { ok: true });
  } catch (error) {
    return send(res, 500, { error: '팀 결과 전송 중 오류가 발생했습니다.' });
  }
}
