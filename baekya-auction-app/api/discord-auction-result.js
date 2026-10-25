import { createClient } from '@supabase/supabase-js';

function send(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}
const clean = (value, max = 120) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max);

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST 요청만 허용됩니다.' });
  const origin = req.headers.origin || '';
  let allowed = false;
  try {
    const u = new URL(origin);
    allowed = u.protocol === 'https:' && (u.hostname === 'baekya-auction.vercel.app' || (u.hostname.endsWith('.vercel.app') && u.hostname.includes('baekya-auction')));
  } catch {}
  if (!allowed) return send(res, 403, { error: '허용되지 않은 사이트입니다.' });
  const webhook = process.env.DISCORD_ANNOUNCEMENT_WEBHOOK_URL;
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!webhook) return send(res, 503, { error: 'DISCORD_ANNOUNCEMENT_WEBHOOK_URL 환경변수가 필요합니다.' });
  if (!supabaseUrl || !anonKey) return send(res, 503, { error: 'Supabase 환경변수가 필요합니다.' });
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/, '');
  if (!token) return send(res, 401, { error: '로그인이 필요합니다.' });
  try {
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: 'Bearer ' + token } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: auth, error: authError } = await supabase.auth.getUser(token);
    if (authError || !auth?.user) return send(res, 401, { error: '로그인 세션을 확인할 수 없습니다.' });
    const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', auth.user.id).maybeSingle();
    if (profileError || profile?.role !== 'admin') return send(res, 403, { error: '관리자만 낙찰 결과를 전송할 수 있습니다.' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const player = clean(body.player, 100), team = clean(body.team, 100), price = Number(body.price), grade = clean(body.grade, 4);
    if (!player || !team || !Number.isInteger(price) || price < 0) return send(res, 400, { error: '선수, 팀, 낙찰가 정보가 올바르지 않습니다.' });
    const payload = { allowed_mentions: { parse: [] }, embeds: [{ title: '🔨 백야 경매 낙찰 결과', color: 0x8877e8, fields: [{ name: '선수', value: player, inline: true }, { name: '등급', value: grade || '미정', inline: true }, { name: '낙찰 팀', value: team, inline: true }, { name: '낙찰가', value: price + 'P', inline: true }], footer: { text: 'BAEKYA AUCTION' }, timestamp: new Date().toISOString() }] };
    const sent = await fetch(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!sent.ok) return send(res, 502, { error: '디스코드 웹훅 전송 실패: 채널 웹훅 설정을 확인해 주세요.' });
    return send(res, 200, { ok: true });
  } catch {
    return send(res, 500, { error: '낙찰 결과 전송 중 오류가 발생했습니다.' });
  }
}
