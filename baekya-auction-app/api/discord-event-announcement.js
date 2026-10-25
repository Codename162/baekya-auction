import { createClient } from '@supabase/supabase-js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
function clean(value, max = 1800) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
}
function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
}
export default async function handler(req, res) {
  const origin = req.headers.origin || '';
  let allowedOrigin = '';
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'baekya-auction.vercel.app' || (parsed.hostname.endsWith('.vercel.app') && parsed.hostname.includes('baekya-auction')))) allowedOrigin = origin;
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

  const webhook = process.env.DISCORD_ANNOUNCEMENT_WEBHOOK_URL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!webhook) return send(res, 503, { error: '디스코드 공지 웹훅이 설정되지 않았습니다. Vercel 환경변수 DISCORD_ANNOUNCEMENT_WEBHOOK_URL에 공지 채널 웹훅을 등록해 주세요.' });
  if (!supabaseUrl || !supabaseAnonKey) return send(res, 503, { error: '서버의 Supabase 환경변수가 설정되지 않았습니다.' });
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!token) return send(res, 401, { error: '로그인이 필요합니다.' });
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) return send(res, 401, { error: '로그인 세션을 확인할 수 없습니다. 다시 로그인해 주세요.' });
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
    if (profileError) return send(res, 403, { error: '관리자 권한을 확인하지 못했습니다.' });
    if (profile?.role !== 'admin') return send(res, 403, { error: '관리자만 공지를 전송할 수 있습니다.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const title = clean(body.title, 150);
    const content = clean(body.content, 1800);
    if (!title || !content) return send(res, 400, { error: '공지 제목과 내용이 필요합니다.' });
    const details = [];
    const eventDate = formatDate(body.eventDate);
    const deadline = formatDate(body.signupDeadline);
    if (body.roomName) details.push('**경매방:** ' + clean(body.roomName, 100));
    if (eventDate) details.push('**진행 일시:** ' + eventDate);
    if (deadline) details.push('**신청 마감:** ' + deadline);
    const payload = { allowed_mentions: { parse: [] }, embeds: [{ title: '📢 ' + title, description: content.slice(0, 4000), color: 0x8877e8, fields: details.map(value => ({ name: '\u200b', value, inline: false })), footer: { text: 'BAEKYA · EVENT ANNOUNCEMENT' }, timestamp: new Date().toISOString() }] };
    const discordResponse = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!discordResponse.ok) return send(res, 502, { error: '디스코드 전송에 실패했습니다. 공지 채널 웹훅을 확인해 주세요.' });
    return send(res, 200, { ok: true });
  } catch {
    return send(res, 500, { error: '공지 전송 중 오류가 발생했습니다.' });
  }
}
