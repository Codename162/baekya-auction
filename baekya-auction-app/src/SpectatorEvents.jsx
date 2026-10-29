import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, Crown, LockKeyhole, Moon, RefreshCw, Target, Trophy } from 'lucide-react';

function localDateTimeInput(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function SpectatorEvents({ supabase, roomId, teams, players, session, profile, isAdmin, onRefresh }) {
  const [events, setEvents] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [awards, setAwards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('백야 롤 내전 관전자 예측');
  const [startsAt, setStartsAt] = useState(() => localDateTimeInput(new Date(Date.now() + 30 * 60000)));
  const [teamChoices, setTeamChoices] = useState({});
  const [mvpChoices, setMvpChoices] = useState({});
  const [winnerChoices, setWinnerChoices] = useState({});
  const [resultMvpChoices, setResultMvpChoices] = useState({});
  const roster = useMemo(() => {
    const assigned = players.filter(p => p.team_id || p.captain_team_id);
    return assigned.length ? assigned : players;
  }, [players]);

  const loadEvents = useCallback(async () => {
    if (!supabase || !session?.user?.id) return;
    setLoading(true);
    const [er, pr, ar] = await Promise.all([
      supabase.from('spectator_events').select('*').order('created_at', { ascending: false }),
      supabase.from('spectator_predictions').select('*').eq('user_id', session.user.id),
      supabase.from('spectator_point_awards').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
    ]);
    if (er.error) setError('관전자 이벤트를 불러오지 못했습니다. 데이터베이스 마이그레이션 적용 여부를 확인해 주세요.');
    else { setEvents(er.data || []); setError(''); }
    if (pr.data) setPredictions(pr.data);
    if (ar.data) setAwards(ar.data);
    setLoading(false);
  }, [supabase, session?.user?.id]);

  useEffect(() => { loadEvents(); }, [loadEvents]);
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel('spectator-events-global')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'spectator_events' }, loadEvents)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadEvents]);

  const callRpc = async (id, fn, args, successText) => {
    setBusyId(id); setError(''); setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc(fn, args);
      if (rpcError) throw rpcError;
      setNotice(successText || (typeof data === 'string' ? data : '처리가 완료되었습니다.'));
      await loadEvents();
      if (onRefresh) await onRefresh();
      return true;
    } catch (e) {
      setError(e.message || '요청 처리에 실패했습니다.');
      return false;
    } finally { setBusyId(''); }
  };

  const createEvent = async (e) => {
    e.preventDefault();
    if (!title.trim() || !startsAt || !roomId) { setError('이벤트를 만들려면 먼저 이벤트를 진행할 방을 선택해 주세요.'); return; }
    const created = await callRpc('create', 'create_spectator_event', {
      p_room_id: roomId, p_title: title.trim(), p_starts_at: new Date(startsAt).toISOString()
    }, '관전자 이벤트를 만들었습니다.');
    // Keep the user's input if the server rejects the request so they can correct it.
    if (!created) return;
    setTitle('백야 롤 내전 관전자 예측');
    setStartsAt(localDateTimeInput(new Date(Date.now() + 30 * 60000)));
  };

  const submitPrediction = (event) => {
    const teamId = teamChoices[event.id], mvpId = mvpChoices[event.id];
    if (!teamId || !mvpId) { setError('승리 팀과 MVP를 모두 선택해 주세요.'); return; }
    callRpc(event.id, 'submit_spectator_prediction', {
      p_event_id: event.id, p_team_id: teamId, p_mvp_player_id: mvpId
    });
  };
  const statusLabel = event => event.status === 'settled' ? '정산 완료' : event.status === 'cancelled' ? '취소됨' : (event.status === 'locked' || Date.now() >= new Date(event.starts_at).getTime()) ? '예측 마감' : '접수 중';
  const isOpen = event => event.status === 'open' && Date.now() < new Date(event.starts_at).getTime();
  const predicted = event => predictions.find(p => p.event_id === event.id);
  const awardFor = event => awards.find(a => a.event_id === event.id);
  const dateLabel = value => new Date(value).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return <section className="panel spectator-panel">
    <div className="panelhead">
      <div className="spectator-title"><div className="spectator-icon"><Moon size={18}/></div><div><h3>관전자 이벤트</h3><p className="tiny">승리 팀 · MVP 예측으로 백야 포인트 획득</p></div></div>
      <button type="button" className="btn ghost" onClick={loadEvents} disabled={loading}><RefreshCw size={15}/>{loading ? '불러오는 중' : '새로고침'}</button>
    </div>
    {error && <div className="alert spectator-alert">{error}</div>}
    {notice && <div className="success spectator-alert">{notice}</div>}
    {isAdmin && roomId && <form className="spectator-create" onSubmit={createEvent}>
      <div className="spectator-form-heading"><CalendarClock size={17}/><strong>관전자 이벤트 만들기</strong><span className="pill">관리자 전용</span></div>
      <label className="field">이벤트 이름<input value={title} onChange={e => setTitle(e.target.value)} minLength={2} maxLength={100} required /></label>
      <label className="field">예측 마감 시간<input type="datetime-local" value={startsAt} onChange={e => setStartsAt(e.target.value)} min={localDateTimeInput(new Date(Date.now() + 60000))} required /></label>
      <p className="tiny">설정한 시간이 되면 예측 제출이 자동 차단됩니다. 팀 적중 5P, MVP 적중 5P, 모두 적중 시 추가 3P.</p>
      <button type="submit" className="btn primary" disabled={busyId === 'create'}>{busyId === 'create' ? '생성 중…' : '이벤트 생성'}</button>
    </form>}
    <div className="spectator-events">
      {!events.length && !loading && <div className="empty spectator-empty"><Target size={25}/><h3>등록된 관전자 이벤트가 없습니다.</h3><p>운영진이 이벤트를 만들면 여기에서 예측에 참여할 수 있습니다.</p></div>}
      {events.map(event => {
        const canParticipateInRoom = event.room_id === roomId;
        const myPrediction = predicted(event), myAward = awardFor(event);
        const resultLocked = event.status === 'locked' || Date.now() >= new Date(event.starts_at).getTime();
        const resultTeam = teams.find(t => t.id === event.winner_team_id);
        const resultMvp = players.find(p => p.id === event.mvp_player_id);
        return <article className="spectator-event" key={event.id}>
          <div className="spectator-event-top">
            <div><span className={'event-status ' + (event.status === 'settled' ? 'settled' : event.status === 'cancelled' ? 'cancelled' : resultLocked ? 'locked' : 'open')}>{statusLabel(event)}</span><h4>{event.title}</h4><p className="tiny"><Clock3 size={13}/> 예측 마감 {dateLabel(event.starts_at)}</p></div>
            <div className="event-rewards"><span><Target size={13}/> 팀 적중 5P</span><span><Crown size={13}/> MVP 적중 5P</span><strong>최대 13P</strong></div>
          </div>
          {myPrediction ? <div className="prediction-receipt"><CheckCircle2 size={17}/><div><strong>예측 제출 완료</strong><p className="tiny">승리 팀: {teams.find(t => t.id === myPrediction.predicted_team_id)?.name || '선택 팀'} · MVP: {players.find(p => p.id === myPrediction.predicted_mvp_player_id)?.name || '선택 선수'}</p></div>{myAward && <span className="award-points">+{myAward.points}P</span>}</div>
          : !canParticipateInRoom ? <p className="tiny spectator-closed">이 이벤트는 다른 방에서 진행됩니다. 이벤트 내용은 전체 공개되며, 예측 참여는 해당 방 권한이 필요합니다.</p>
          : event.status === 'settled' || event.status === 'cancelled' || !isOpen(event) ? <p className="tiny spectator-closed">예측 접수가 종료되었습니다.</p>
          : <div className="prediction-form">
            <label className="field">승리 팀 선택<select value={teamChoices[event.id] || ''} onChange={e => setTeamChoices(v => ({ ...v, [event.id]: e.target.value }))}><option value="">팀 선택</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="field">MVP 선택<select value={mvpChoices[event.id] || ''} onChange={e => setMvpChoices(v => ({ ...v, [event.id]: e.target.value }))}><option value="">선수 선택</option>{roster.map(p => <option key={p.id} value={p.id}>{p.name}{p.team_id ? ' · ' + (teams.find(t => t.id === p.team_id)?.name || '') : ''}</option>)}</select></label>
            <button type="button" className="btn primary" disabled={busyId === event.id} onClick={() => submitPrediction(event)}>{busyId === event.id ? '제출 중…' : '예측 제출'}</button>
            <p className="tiny prediction-warning">제출 후 수정할 수 없습니다. 해당 내전 팀장은 참여할 수 없습니다.</p>
          </div>}
          {event.status === 'settled' && <div className="event-result"><Trophy size={16}/><span>승리 팀: <strong>{resultTeam?.name || '확정'}</strong> · MVP: <strong>{resultMvp?.name || '확정'}</strong></span></div>}
          {isAdmin && canParticipateInRoom && !['settled','cancelled'].includes(event.status) && <div className="spectator-admin-actions">
            {event.status === 'open' && <button type="button" className="btn ghost" disabled={busyId === event.id} onClick={() => callRpc(event.id, 'lock_spectator_event', { p_event_id: event.id })}><LockKeyhole size={14}/> 예측 마감</button>}
            <label className="field">실제 승리 팀<select value={winnerChoices[event.id] || event.winner_team_id || ''} onChange={e => setWinnerChoices(v => ({ ...v, [event.id]: e.target.value }))}><option value="">승리 팀 선택</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label className="field">실제 MVP<select value={resultMvpChoices[event.id] || event.mvp_player_id || ''} onChange={e => setResultMvpChoices(v => ({ ...v, [event.id]: e.target.value }))}><option value="">MVP 선택</option>{roster.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <button type="button" className="btn primary" disabled={busyId === event.id} onClick={() => {
              const winner = winnerChoices[event.id] || event.winner_team_id, mvp = resultMvpChoices[event.id] || event.mvp_player_id;
              if (!winner || !mvp) { setError('실제 승리 팀과 MVP를 모두 선택해 주세요.'); return; }
              if (!window.confirm('결과를 확정하고 적중자에게 포인트를 지급할까요? 정산은 한 번만 할 수 있습니다.')) return;
              callRpc(event.id, 'settle_spectator_event', { p_event_id: event.id, p_winner_team_id: winner, p_mvp_player_id: mvp });
            }}>결과 확정 및 포인트 지급</button>
            <button type="button" className="btn danger" disabled={busyId === event.id} onClick={() => { if (window.confirm('이벤트를 취소할까요? 포인트는 지급되지 않습니다.')) callRpc(event.id, 'cancel_spectator_event', { p_event_id: event.id }); }}>취소</button>
          </div>}
        </article>;
      })}
    </div>
    <div className="spectator-footer"><span>내 백야 포인트</span><strong>{Number(profile?.points || 0)}P</strong></div>
  </section>;
}
