import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Bell, BellRing, CalendarClock, ChevronRight, Clock3, Megaphone, Radio, RefreshCw, ShieldCheck, Trophy } from 'lucide-react';

const fmt = (value) => value ? new Date(value).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '일정 미정';

export default function LiveOperationsHub({ supabase, roomId, isAdmin, onNavigate }) {
  const [announcements, setAnnouncements] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [browserAlerts, setBrowserAlerts] = useState(() => {
    try { return window.localStorage.getItem('baekya-browser-alerts') === 'on'; } catch { return false; }
  });
  const seenRef = useRef({ announcements: new Set(), liveMatches: new Set() });
  const initialRef = useRef(false);

  const load = useCallback(async () => {
    if (!supabase || !roomId) { setAnnouncements([]); setMatches([]); return; }
    setLoading(true); setError('');
    const [a, m] = await Promise.all([
      supabase.from('event_announcements').select('id,title,content,event_date,signup_deadline,status,created_at').eq('room_id', roomId).eq('status', 'published').order('event_date', { ascending: true }).limit(8),
      supabase.from('tournament_matches').select('id,tournament_name,team_a,team_b,score_a,score_b,status,round_number,match_number,created_at').eq('room_id', roomId).order('round_number').order('match_number').limit(20)
    ]);
    if (a.error && !/does not exist|schema cache/i.test(a.error.message || '')) setError('공지 일정을 불러오지 못했습니다: ' + a.error.message);
    if (m.error && !/does not exist|schema cache/i.test(m.error.message || '')) setError((prev) => prev ? prev + ' · 경기 현황도 불러오지 못했습니다.' : '경기 현황을 불러오지 못했습니다: ' + m.error.message);
    const nextAnnouncements = a.error ? [] : (a.data || []);
    const nextMatches = m.error ? [] : (m.data || []);
    if (browserAlerts && 'Notification' in window && Notification.permission === 'granted' && initialRef.current) {
      nextAnnouncements.forEach(item => {
        if (!seenRef.current.announcements.has(item.id)) new Notification('백야 대회 공지', { body: item.title });
      });
      nextMatches.filter(item => item.status === 'live').forEach(item => {
        if (!seenRef.current.liveMatches.has(item.id)) new Notification('백야 경기 시작', { body: item.tournament_name + ': ' + item.team_a + ' vs ' + item.team_b });
      });
    }
    seenRef.current.announcements = new Set(nextAnnouncements.map(item => item.id));
    seenRef.current.liveMatches = new Set(nextMatches.filter(item => item.status === 'live').map(item => item.id));
    initialRef.current = true;
    setAnnouncements(nextAnnouncements); setMatches(nextMatches); setLoading(false);
  }, [supabase, roomId, browserAlerts]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!supabase || !roomId) return;
    const channel = supabase.channel('live-operations-hub-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_announcements', filter: 'room_id=eq.' + roomId }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_matches', filter: 'room_id=eq.' + roomId }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, roomId, load]);

  const upcoming = useMemo(() => announcements.filter(item => !item.event_date || new Date(item.event_date).getTime() >= Date.now()).sort((a,b) => (a.event_date || '9999').localeCompare(b.event_date || '9999')), [announcements]);
  const live = matches.filter(item => item.status === 'live');
  const queued = matches.filter(item => item.status === 'scheduled').slice(0, 4);
  const enableAlerts = async () => {
    if (!('Notification' in window)) { setNotice('이 브라우저는 알림을 지원하지 않습니다.'); return; }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') { setNotice('브라우저 알림 권한이 허용되지 않았습니다.'); return; }
    try { window.localStorage.setItem('baekya-browser-alerts', 'on'); } catch {}
    setBrowserAlerts(true); setNotice('브라우저 알림을 켰습니다. 새 공지와 경기 시작을 알려드립니다.');
  };
  const disableAlerts = () => {
    try { window.localStorage.setItem('baekya-browser-alerts', 'off'); } catch {}
    setBrowserAlerts(false); setNotice('브라우저 알림을 껐습니다.');
  };

  return <section className="live-operations-hub">
    <div className="panel live-hub-header">
      <div className="live-hub-title"><span className="live-hub-icon"><Radio size={20}/></span><div><p className="eyebrow">BAEKYA LIVE</p><h3>대회 운영 현황</h3><p className="tiny">일정, 공지, 현재 진행 중인 경기를 한곳에서 확인하세요.</p></div></div>
      <div className="live-hub-actions"><button className="btn ghost" type="button" onClick={load} disabled={loading}><RefreshCw size={15}/> 새로고침</button>{browserAlerts ? <button className="btn ghost" type="button" onClick={disableAlerts}><Bell size={15}/> 알림 끄기</button> : <button className="btn primary" type="button" onClick={enableAlerts}><BellRing size={15}/> 알림 켜기</button>}</div>
    </div>
    {notice && <div className="success live-hub-message">{notice}</div>}
    {error && <div className="alert live-hub-message">{error}</div>}
    <div className="live-hub-grid">
      <div className="panel live-hub-card">
        <div className="panelhead"><div><h3><Activity size={17}/> 실시간 경기</h3><p className="tiny">경기 상태가 변경되면 자동으로 갱신됩니다.</p></div><span className={'pill ' + (live.length ? 'live-hub-live-pill' : '')}>{live.length ? live.length + '경기 진행 중' : '진행 경기 없음'}</span></div>
        {live.length ? <div className="live-hub-list">{live.map(match => <article className="live-hub-match" key={match.id}><div className="live-hub-match-meta"><span className="live-hub-dot"/> LIVE · {match.tournament_name || '대회'} · {match.round_number ? '라운드 ' + match.round_number : '경기 ' + match.match_number}</div><div className="live-hub-score"><strong>{match.team_a}</strong><b>{Number(match.score_a || 0)} : {Number(match.score_b || 0)}</b><strong>{match.team_b}</strong></div></article>)}</div> : <div className="live-hub-empty"><Radio size={22}/><span>현재 진행 중인 경기가 없습니다.</span></div>}
        {queued.length > 0 && <div className="live-hub-next"><strong><Clock3 size={14}/> 다음 경기</strong>{queued.map(match => <div key={match.id}>{match.tournament_name || '대회'} · {match.team_a} vs {match.team_b}</div>)}</div>}
        <button type="button" className="btn ghost live-hub-link" onClick={() => onNavigate('bracket')}>대진표 및 경기 관리 <ChevronRight size={15}/></button>
      </div>
      <div className="panel live-hub-card">
        <div className="panelhead"><div><h3><CalendarClock size={17}/> 예정 일정 및 공지</h3><p className="tiny">게시된 이벤트 공지와 일정을 모아 보여줍니다.</p></div><span className="pill">{upcoming.length}개</span></div>
        {upcoming.length ? <div className="live-hub-list">{upcoming.slice(0,5).map(item => <article className="live-hub-announcement" key={item.id}><div className="live-hub-announcement-icon"><Megaphone size={16}/></div><div className="grow"><strong>{item.title}</strong><p>{item.content}</p><small><CalendarClock size={12}/> {fmt(item.event_date)}{item.signup_deadline ? ' · 신청 마감 ' + fmt(item.signup_deadline) : ''}</small></div></article>)}</div> : <div className="live-hub-empty"><CalendarClock size={22}/><span>게시된 예정 일정이 없습니다.</span></div>}
        {isAdmin && <button type="button" className="btn ghost live-hub-link" onClick={() => onNavigate('announcements')}>공지 및 일정 관리 <ChevronRight size={15}/></button>}
      </div>
    </div>
    <div className="live-hub-footer"><span><ShieldCheck size={14}/> 공지와 경기 현황은 기존 대회 데이터를 사용합니다.</span><span>{loading ? '갱신 중…' : '실시간 연결 대기'}</span></div>
  </section>;
}
