import React, { useEffect, useState } from 'react';
import { CalendarDays, Check, Edit3, Megaphone, Save, Send, Trash2, Trophy, X, Medal } from 'lucide-react';
import './AdminRecords.css';

const dateOnly = () => new Date().toLocaleDateString('en-CA');
const localDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const emptyResult = () => ({ title: '백야 내전', event_date: dateOnly(), team_a: '', team_b: '', score_a: '0', score_b: '0', mvp: '', notes: '' });
const emptyAnnouncement = () => ({ title: '', content: '', event_date: '', signup_deadline: '', status: 'draft' });

export default function AdminRecords({ supabase, roomId, room, session, mode, readOnly = false }) {
  const [results, setResults] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [resultForm, setResultForm] = useState(emptyResult());
  const [announcementForm, setAnnouncementForm] = useState(emptyAnnouncement());
  const [editingResult, setEditingResult] = useState(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    if (!supabase || !roomId) return;
    setLoading(true); setError('');
    try {
      const table = mode === 'tournament' ? 'tournament_results' : 'event_announcements';
      const { data, error: queryError } = await supabase.from(table).select('*').eq('room_id', roomId).order(mode === 'tournament' ? 'event_date' : 'created_at', { ascending: false });
      if (queryError) throw queryError;
      if (mode === 'tournament') setResults(data || []);
      else setAnnouncements(data || []);
    } catch (e) { setError('목록을 불러오지 못했습니다: ' + (e.message || '권한 또는 데이터베이스 설정을 확인해 주세요.')); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    setError(''); setNotice(''); setEditingResult(null); setEditingAnnouncement(null);
    setResultForm(emptyResult()); setAnnouncementForm(emptyAnnouncement()); load();
  }, [roomId, mode]);

  useEffect(() => {
    if (!supabase || !roomId || mode !== 'tournament') return;
    const channel = supabase.channel('tournament-results-' + roomId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_results', filter: 'room_id=eq.' + roomId }, load)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, roomId, mode]);

  function resetResult() { setResultForm(emptyResult()); setEditingResult(null); }
  function resetAnnouncement() { setAnnouncementForm(emptyAnnouncement()); setEditingAnnouncement(null); }

  async function saveResult(e) {
    e.preventDefault();
    if (!resultForm.team_a.trim() || !resultForm.team_b.trim()) { setError('두 팀 이름을 모두 입력해 주세요.'); return; }
    const a = Number(resultForm.score_a), b = Number(resultForm.score_b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) { setError('점수는 0 이상의 정수로 입력해 주세요.'); return; }
    const payload = { room_id: roomId, title: resultForm.title.trim() || '대회 전적', event_date: resultForm.event_date || dateOnly(), team_a: resultForm.team_a.trim(), team_b: resultForm.team_b.trim(), score_a: a, score_b: b, winner: a === b ? '무승부' : a > b ? resultForm.team_a.trim() : resultForm.team_b.trim(), mvp: resultForm.mvp.trim(), notes: resultForm.notes.trim(), created_by: session?.user?.id || null, updated_at: new Date().toISOString() };
    setSaving(true); setError(''); setNotice('');
    try {
      const query = editingResult ? supabase.from('tournament_results').update(payload).eq('id', editingResult).eq('room_id', roomId) : supabase.from('tournament_results').insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      setNotice(editingResult ? '대회 전적을 수정했습니다.' : '대회 전적을 저장했습니다.'); resetResult(); await load();
    } catch (e2) { setError('저장하지 못했습니다: ' + e2.message); }
    finally { setSaving(false); }
  }

  function editResult(item) {
    setEditingResult(item.id);
    setResultForm({ title: item.title || '', event_date: item.event_date || dateOnly(), team_a: item.team_a || '', team_b: item.team_b || '', score_a: String(item.score_a ?? 0), score_b: String(item.score_b ?? 0), mvp: item.mvp || '', notes: item.notes || '' });
    setError(''); setNotice('');
  }

  async function deleteResult(item) {
    if (!window.confirm('「' + item.title + '」 전적을 삭제할까요?')) return;
    setSaving(true); setError(''); setNotice('');
    const { error: deleteError } = await supabase.from('tournament_results').delete().eq('id', item.id).eq('room_id', roomId);
    setSaving(false);
    if (deleteError) setError('삭제하지 못했습니다: ' + deleteError.message);
    else { setNotice('전적을 삭제했습니다.'); await load(); if (editingResult === item.id) resetResult(); }
  }

  async function saveAnnouncement(e) {
    e.preventDefault();
    if (!announcementForm.title.trim() || !announcementForm.content.trim()) { setError('공지 제목과 내용을 입력해 주세요.'); return; }
    const payload = { room_id: roomId, title: announcementForm.title.trim(), content: announcementForm.content.trim(), event_date: announcementForm.event_date ? new Date(announcementForm.event_date).toISOString() : null, signup_deadline: announcementForm.signup_deadline ? new Date(announcementForm.signup_deadline).toISOString() : null, status: announcementForm.status, created_by: session?.user?.id || null, updated_at: new Date().toISOString() };
    setSaving(true); setError(''); setNotice('');
    try {
      const query = editingAnnouncement ? supabase.from('event_announcements').update(payload).eq('id', editingAnnouncement).eq('room_id', roomId) : supabase.from('event_announcements').insert(payload);
      const { error: saveError } = await query;
      if (saveError) throw saveError;
      setNotice(editingAnnouncement ? '이벤트 공지를 수정했습니다.' : '이벤트 공지를 저장했습니다.'); resetAnnouncement(); await load();
    } catch (e2) { setError('저장하지 못했습니다: ' + e2.message); }
    finally { setSaving(false); }
  }

  function editAnnouncement(item) {
    setEditingAnnouncement(item.id);
    setAnnouncementForm({ title: item.title || '', content: item.content || '', event_date: localDateTime(item.event_date), signup_deadline: localDateTime(item.signup_deadline), status: item.status || 'draft' });
    setError(''); setNotice('');
  }

  async function deleteAnnouncement(item) {
    if (!window.confirm('「' + item.title + '」 공지를 삭제할까요?')) return;
    setSaving(true); setError(''); setNotice('');
    const { error: deleteError } = await supabase.from('event_announcements').delete().eq('id', item.id).eq('room_id', roomId);
    setSaving(false);
    if (deleteError) setError('삭제하지 못했습니다: ' + deleteError.message);
    else { setNotice('이벤트 공지를 삭제했습니다.'); await load(); if (editingAnnouncement === item.id) resetAnnouncement(); }
  }

  async function sendAnnouncement(item) {
    if (!window.confirm('「' + item.title + '」 공지를 디스코드 채널로 전송할까요?')) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('로그인 세션이 없습니다. 다시 로그인해 주세요.');
      const response = await fetch('/api/discord-event-announcement', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ title: item.title, content: item.content, eventDate: item.event_date, signupDeadline: item.signup_deadline, roomName: room?.name || '백야 이벤트' }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || '디스코드 전송에 실패했습니다.');
      const { error: updateError } = await supabase.from('event_announcements').update({ status: 'published', discord_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', item.id).eq('room_id', roomId);
      if (updateError) throw updateError;
      setNotice('디스코드 채널로 공지를 전송했습니다.'); await load();
    } catch (e) { setError(e.message || '디스코드 전송에 실패했습니다.'); }
    finally { setSaving(false); }
  }

  const standings = isTournament ? Object.values(results.reduce((acc, item) => {
    [item.team_a, item.team_b].filter(Boolean).forEach(name => {
      if (!acc[name]) acc[name] = { name, played: 0, wins: 0, draws: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, mvps: 0 };
      acc[name].played += 1;
      acc[name].mvps += item.mvp ? 0 : 0;
    });
    if (item.team_a && acc[item.team_a]) { acc[item.team_a].pointsFor += Number(item.score_a || 0); acc[item.team_a].pointsAgainst += Number(item.score_b || 0); }
    if (item.team_b && acc[item.team_b]) { acc[item.team_b].pointsFor += Number(item.score_b || 0); acc[item.team_b].pointsAgainst += Number(item.score_a || 0); }
    if (item.winner === '무승부') { if (acc[item.team_a]) acc[item.team_a].draws += 1; if (acc[item.team_b]) acc[item.team_b].draws += 1; }
    else if (item.winner && acc[item.winner]) { acc[item.winner].wins += 1; const loser = item.winner === item.team_a ? item.team_b : item.team_a; if (acc[loser]) acc[loser].losses += 1; }
    if (item.mvp) { const key = item.mvp.trim(); if (key) { if (!acc['__mvp__'+key]) acc['__mvp__'+key] = { name: '__mvp__'+key, mvps: 0 }; acc['__mvp__'+key].mvps += 1; } }
    return acc;
  }, {})).filter(team => !team.name.startsWith('__mvp__')).sort((a,b) => b.wins-a.wins || b.draws-a.draws || (b.pointsFor-b.pointsAgainst)-(a.pointsFor-a.pointsAgainst)) : [];
  const mvpLeaders = isTournament ? Object.entries(results.reduce((acc, item) => { const name=(item.mvp||'').trim(); if(name) acc[name]=(acc[name]||0)+1; return acc; }, {})).sort((a,b)=>b[1]-a[1]).slice(0,5) : [];
  const isTournament = mode === 'tournament';
  return <section className="admin-records">
    <div className="admin-records-heading"><div className="admin-records-icon">{isTournament ? <Trophy size={22}/> : <Megaphone size={22}/>}</div><div><h3>{isTournament ? '대회 전적 관리' : '이벤트 공지 관리'}</h3><p className="tiny">관리 대상 경매방: {room?.name || '미선택'} · {readOnly ? '멤버 열람' : '관리자 전용'}</p></div><span className="pill">{isTournament ? results.length + '개 기록' : announcements.length + '개 공지'}</span></div>
    {isTournament && results.length > 0 && <div className="tournament-overview">
      <div className="tournament-summary-grid">
        <div className="stat"><small>등록 경기</small><strong>{results.length}</strong><span>현재 방 기준</span></div>
        <div className="stat"><small>참가 팀</small><strong>{standings.length}</strong><span>기록에 등장한 팀</span></div>
        <div className="stat"><small>등록 MVP</small><strong>{results.filter(r=>r.mvp && r.mvp.trim()).length}</strong><span>MVP가 기록된 경기</span></div>
      </div>
      <div className="tournament-leaderboards">
        <div className="panel"><div className="panelhead"><h3><Trophy size={17}/> 팀 순위</h3><span className="pill">승수 우선</span></div>
          {standings.length ? <div className="playerlist">{standings.map((team,i)=><div className="playerrow" key={team.name}><span className="pill">#{i+1}</span><div className="grow"><strong>{team.name}</strong><small>{team.played}경기 · {team.wins}승 {team.draws}무 {team.losses}패 · 득실 {team.pointsFor-team.pointsAgainst > 0 ? '+' : ''}{team.pointsFor-team.pointsAgainst}</small></div><strong className="winning">{team.wins*3+team.draws}점</strong></div>)}</div> : <div className="empty">순위 데이터가 없습니다.</div>}
        </div>
        <div className="panel"><div className="panelhead"><h3><Medal size={17}/> MVP 순위</h3><span className="pill">상위 5명</span></div>
          {mvpLeaders.length ? <div className="playerlist">{mvpLeaders.map(([name,count],i)=><div className="playerrow" key={name}><span className="pill">#{i+1}</span><div className="grow"><strong>{name}</strong><small>대회 MVP 선정</small></div><strong className="winning">{count}회</strong></div>)}</div> : <div className="empty">아직 MVP 기록이 없습니다.</div>}
        </div>
      </div>
    </div>}
    {isTournament ? <>
      {!readOnly && <form className="panel admin-record-form" onSubmit={saveResult}>
        <div className="panelhead"><div><h3>{editingResult ? '전적 수정' : '전적 등록'}</h3><p className="tiny">경기 결과와 MVP를 저장하면 아래 기록에 반영됩니다.</p></div>{editingResult && <button className="btn ghost" type="button" onClick={resetResult}><X size={15}/> 취소</button>}</div>
        <div className="admin-form-grid">
          <label>대회 / 경기명<input value={resultForm.title} onChange={e=>setResultForm(v=>({...v,title:e.target.value}))} placeholder="예: 백야 롤 내전 1경기" maxLength={120}/></label>
          <label>진행 날짜<input type="date" value={resultForm.event_date} onChange={e=>setResultForm(v=>({...v,event_date:e.target.value}))} required/></label>
          <label>1팀 이름<input value={resultForm.team_a} onChange={e=>setResultForm(v=>({...v,team_a:e.target.value}))} placeholder="예: 1팀" maxLength={80} required/></label>
          <label>1팀 점수<input type="number" min="0" step="1" value={resultForm.score_a} onChange={e=>setResultForm(v=>({...v,score_a:e.target.value}))} required/></label>
          <label>2팀 이름<input value={resultForm.team_b} onChange={e=>setResultForm(v=>({...v,team_b:e.target.value}))} placeholder="예: 2팀" maxLength={80} required/></label>
          <label>2팀 점수<input type="number" min="0" step="1" value={resultForm.score_b} onChange={e=>setResultForm(v=>({...v,score_b:e.target.value}))} required/></label>
          <label className="admin-form-wide">MVP<input value={resultForm.mvp} onChange={e=>setResultForm(v=>({...v,mvp:e.target.value}))} placeholder="MVP 닉네임 (선택)" maxLength={100}/></label>
          <label className="admin-form-wide">비고<textarea value={resultForm.notes} onChange={e=>setResultForm(v=>({...v,notes:e.target.value}))} placeholder="세트 결과, 특이사항 등" rows="2" maxLength={1000}/></label>
        </div>
        <div className="admin-form-actions"><button className="btn primary" type="submit" disabled={saving}><Save size={16}/>{saving ? '저장 중…' : editingResult ? '수정 저장' : '전적 저장'}</button></div>
      </form>}
      <div className="panel"><div className="panelhead"><h3>등록된 전적</h3><button type="button" className="btn ghost" onClick={load} disabled={loading}><CalendarDays size={15}/> 새로고침</button></div>
        {loading ? <p className="muted">불러오는 중…</p> : results.length ? <div className="admin-record-list">{results.map(item=><article className="admin-record-card" key={item.id}><div className="admin-record-card-top"><span className="pill">{item.event_date}</span><span className="tiny">{item.title}</span></div><div className="admin-match-score"><strong>{item.team_a}</strong><b>{item.score_a} : {item.score_b}</b><strong>{item.team_b}</strong></div><p className="admin-record-winner">{item.winner === '무승부' ? '무승부' : '승리: ' + (item.winner || '미정')}{item.mvp ? ' · MVP ' + item.mvp : ''}</p>{item.notes && <p className="admin-record-notes">{item.notes}</p>}{!readOnly && <div className="admin-form-actions"><button className="btn ghost" type="button" disabled={saving} onClick={()=>editResult(item)}><Edit3 size={15}/> 수정</button><button className="btn danger" type="button" disabled={saving} onClick={()=>deleteResult(item)}><Trash2 size={15}/> 삭제</button></div>}</article>)}</div> : <div className="empty">아직 전적이 없습니다.</div>}
      </div>
    </> : <>
      <form className="panel admin-record-form" onSubmit={saveAnnouncement}>
        <div className="panelhead"><div><h3>{editingAnnouncement ? '공지 수정' : '새 이벤트 공지'}</h3><p className="tiny">먼저 저장한 뒤 디스코드 전송 버튼으로 공지할 수 있습니다.</p></div>{editingAnnouncement && <button className="btn ghost" type="button" onClick={resetAnnouncement}><X size={15}/> 취소</button>}</div>
        <div className="admin-form-grid">
          <label className="admin-form-wide">공지 제목<input value={announcementForm.title} onChange={e=>setAnnouncementForm(v=>({...v,title:e.target.value}))} placeholder="예: 백야 롤 내전 참가 모집" maxLength={150} required/></label>
          <label className="admin-form-wide">공지 내용<textarea value={announcementForm.content} onChange={e=>setAnnouncementForm(v=>({...v,content:e.target.value}))} placeholder="일정, 참여 방법, 보상 등을 입력해 주세요." rows="5" maxLength={4000} required/></label>
          <label>이벤트 진행 일시<input type="datetime-local" value={announcementForm.event_date} onChange={e=>setAnnouncementForm(v=>({...v,event_date:e.target.value}))}/></label>
          <label>신청 마감 일시<input type="datetime-local" value={announcementForm.signup_deadline} onChange={e=>setAnnouncementForm(v=>({...v,signup_deadline:e.target.value}))}/></label>
          <label>상태<select value={announcementForm.status} onChange={e=>setAnnouncementForm(v=>({...v,status:e.target.value}))}><option value="draft">작성 중</option><option value="published">공지 완료</option><option value="closed">마감</option></select></label>
        </div>
        <div className="admin-form-actions"><button className="btn primary" type="submit" disabled={saving}><Save size={16}/>{saving ? '저장 중…' : editingAnnouncement ? '수정 저장' : '공지 저장'}</button></div>
      </form>
      <div className="panel"><div className="panelhead"><h3>이벤트 공지 목록</h3><button type="button" className="btn ghost" onClick={load} disabled={loading}><CalendarDays size={15}/> 새로고침</button></div>
        {loading ? <p className="muted">불러오는 중…</p> : announcements.length ? <div className="admin-record-list">{announcements.map(item=><article className="admin-record-card" key={item.id}><div className="admin-record-card-top"><span className={'pill announcement-status ' + item.status}>{item.status === 'published' ? '공지 완료' : item.status === 'closed' ? '마감' : '작성 중'}</span><span className="tiny">{new Date(item.created_at).toLocaleDateString('ko-KR')} 작성</span></div><h4>{item.title}</h4><p className="admin-announcement-content">{item.content}</p>{item.event_date && <p className="tiny">진행: {new Date(item.event_date).toLocaleString('ko-KR')}</p>}{item.signup_deadline && <p className="tiny">신청 마감: {new Date(item.signup_deadline).toLocaleString('ko-KR')}</p>}{item.discord_sent_at && <p className="admin-record-winner"><Check size={14}/> 디스코드 전송 {new Date(item.discord_sent_at).toLocaleString('ko-KR')}</p>}<div className="admin-form-actions"><button className="btn ghost" type="button" disabled={saving} onClick={()=>editAnnouncement(item)}><Edit3 size={15}/> 수정</button><button className="btn primary" type="button" disabled={saving} onClick={()=>sendAnnouncement(item)}><Send size={15}/> 디스코드 전송</button><button className="btn danger" type="button" disabled={saving} onClick={()=>deleteAnnouncement(item)}><Trash2 size={15}/> 삭제</button></div></article>)}</div> : <div className="empty">아직 공지가 없습니다. 위에서 첫 공지를 작성해 주세요.</div>}
      </div>
    </>}
    {error && <div className="alert">{error}</div>}{notice && <div className="success">{notice}</div>}
  </section>;
}
