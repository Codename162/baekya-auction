export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'Supabase server configuration is missing.' });
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  if (!webhook) return res.status(503).json({ error: 'Discord webhook is not configured.' });
  try {
    const userResponse = await fetch(supabaseUrl.replace(/\/$/, '') + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
    });
    if (!userResponse.ok) return res.status(401).json({ error: 'Invalid session.' });
    const user = await userResponse.json();
    const profileResponse = await fetch(supabaseUrl.replace(/\/$/, '') + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=role', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token }
    });
    if (!profileResponse.ok) return res.status(403).json({ error: 'Could not verify administrator permissions.' });
    const profiles = await profileResponse.json();
    if (!profiles.some(profile => profile.role === 'admin')) return res.status(403).json({ error: 'Administrator access required.' });
    const { title, content, kind } = req.body || {};
    const safeTitle = String(title || '').trim().slice(0, 180);
    const safeContent = String(content || '').trim().slice(0, 1500);
    if (!safeTitle || !safeContent) return res.status(400).json({ error: 'Title and content are required.' });
    const discordResponse = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowed_mentions: { parse: [] },
        embeds: [{
          title: safeTitle,
          description: safeContent,
          color: kind === 'match' ? 0x8174ff : 0x6d5ce8,
          footer: { text: 'BAEKYA · 공식 대회 알림' },
          timestamp: new Date().toISOString()
        }]
      })
    });
    if (!discordResponse.ok) return res.status(502).json({ error: 'Discord rejected the notification.' });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Notification delivery failed.' });
  }
}
