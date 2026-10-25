import React, { useEffect, useMemo, useState } from 'react';
import { Scale, Users, Save, WandSparkles, RefreshCw, ShieldCheck } from 'lucide-react';

const gradeDefault = { S: 100, A: 80, B: 60, C: 40, D: 20 };

export default function TeamBalance({ supabase, roomId, room, teams, players, history, isAdmin, onRefresh }) {
  const [scores, setScores] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setScores(Object.fromEntries(players.map(p => [p.id, Number(p.skill_score ?? gradeDefault[p.grade] ?? 50)])));
  }, [players]);

  const teamStats = useMemo(() => teams.map(team => {
    const roster = players.filter(p => p.team_id === team.id || p.captain_team_id === team.id);
    return { ...team, roster, total: roster.reduce((sum, p) => sum + Number(scores[p.id] ?? p.skill_score ?? gradeDefault[p.grade] ?? 50), 0) };
  }), [teams, players, scores]);

  const hasAuction = history.length > 0 || players.some(p => !p.is_captain && p.status !== 'available');
  const canBalance = isAdmin && room?.status === 'setup' && !hasAuction && teams.length >= 2;
  const sortedPlayers = useMemo(() => [...players].sort((a,b) => Number(scores[b.id] ?? 0) - Number(scores[a.id] ?? 0) || a.name.localeCompare(b.name, 'ko')), [players, scores]);

  async function saveScores() {
    for (const p of players) {
      const score = Number(scores[p.id]);
      if (!Number.isInteger(score) || score < 0 || score > 100) throw new Error(p.name + ' 점수는 0~100 사이의 정수여야 합니다.');
    }
    const results = await Promise.all(players.map(p => supabase.from('players').update({ skill_score: Number(scores[p.id]) }).eq('id', p.id).eq('room_id', roomId)));
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;
  }

  async function handleSave() {
    setBusy(true); setError(''); setNotice('');
    try {
      await saveScores();
      if (onRefresh) await onRefresh();
      setNotice('선수 점수를 저장했습니다.');
    } catch (e) { setError(e.message || '점수 저장에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  async function handleBalance() {
    if (!canBalance) return;
    if (!window.confirm('입력한 점수를 저장한 뒤, 팀장을 현재 팀에 유지하면서 나머지 선수들을 점수 합계가 균형을 이루도록 다시 배정할까요?')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await saveScores();
      const { data, error: rpcError } = await supabase.rpc('balance_teams_by_score', { p_room_id: roomId });
      if (rpcError) throw rpcError;
      setNotice(typeof data === 'string' ? data : '점수 균형 팀 배정을 완료했습니다.');
      if (onRefresh) await onRefresh();
    } catch (e) { setError(e.message || '팀 배정에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  return <section className="panel team-balance-panel">
    <div className="panelhead">
      <div className="balance-heading"><div className="balance-icon"><Scale size={18}/></div><div><h3>점수별 팀 배정</h3><p className="tiny">경매 없이 선수 점수 합계를 기준으로 팀을 자동 구성합니다.</p></div></div>
      <span className="pill">관리자 전용</span>
    </div>
    {error && <div className="alert balance-message">{error}</div>}
    {notice && <div className="success balance-message">{notice}</div>}
    {!isAdmin && <div className="empty balance-empty"><ShieldCheck size={22}/><p>관리자만 선수 점수 수정 및 팀 자동 배정을 할 수 있습니다.</p></div>}
    {isAdmin && <>
      <div className="balance-rules">
        <div><Users size={16}/><span>팀 수 <strong>{teams.length}</strong></span></div>
        <div><Scale size={16}/><span>선수 점수 <strong>0~100점</strong></span></div>
        <div><ShieldCheck size={16}/><span>팀장 <strong>현재 팀 유지</strong></span></div>
      </div>
      {(room?.status !== 'setup' || hasAuction) && <div className="balance-warning">점수 배정은 경매 시작 전 준비 상태에서만 사용할 수 있어. 경매 기록이 있는 방은 기존 배정 보호를 위해 잠겨 있어.</div>}
      <div className="balance-content">
        <div className="balance-score-list">
          <div className="balance-subhead"><strong>선수별 점수</strong><span className="tiny">{players.length}명 · 점수 직접 입력</span></div>
          {!players.length ? <div className="empty">먼저 관리자 설정에서 선수를 등록해 주세요.</div> : sortedPlayers.map(p => <div className="balance-player" key={p.id}>
            <span className={'grade ' + (p.is_captain ? 'TL' : p.grade)}>{p.is_captain ? 'TL' : p.grade}</span>
            <div className="grow"><strong>{p.name}{p.is_captain ? ' · 팀장' : ''}</strong><small>{p.is_captain ? '팀장 고정 배정' : '점수가 높을수록 팀 합계 계산에 더 크게 반영'}</small></div>
            <label className="score-input"><span className="sr-only">{p.name} 점수</span><input aria-label={p.name + ' 점수'} type="number" min="0" max="100" step="1" value={scores[p.id] ?? 50} disabled={busy} onChange={e=>setScores(v=>({...v,[p.id]:e.target.value}))}/><small>점</small></label>
          </div>)}
          <div className="balance-buttons"><button className="btn ghost" type="button" disabled={busy || !players.length} onClick={handleSave}><Save size={15}/>{busy ? '처리 중…' : '점수 저장'}</button><button className="btn primary" type="button" disabled={busy || !canBalance || !players.length} onClick={handleBalance}><WandSparkles size={15}/>점수 균형 팀 자동 배정</button></div>
        </div>
        <div className="balance-team-list">
          <div className="balance-subhead"><strong>현재 팀별 합계</strong><button className="btn ghost balance-refresh" type="button" disabled={busy} onClick={onRefresh}><RefreshCw size={13}/>새로고침</button></div>
          {teamStats.map(team => <article className="balance-team" key={team.id}>
            <div className="balance-team-head"><strong>{team.name}</strong><span><b>{team.total}</b>점</span></div>
            <div className="balance-meter"><span style={{width:Math.min(100,team.total/Math.max(1,teamStats.reduce((m,t)=>Math.max(m,t.total),0))*100)+'%'}}/></div>
            <p className="tiny">{team.roster.length}명 · 팀장 {team.captain_name || '미지정'}</p>
            <div className="balance-roster">{team.roster.length ? team.roster.map(p=><span key={p.id}>{p.name} <b>{Number(scores[p.id] ?? p.skill_score ?? gradeDefault[p.grade] ?? 50)}</b></span>) : <span className="tiny">아직 배정된 선수가 없습니다.</span>}</div>
          </article>)}
          {teamStats.length > 1 && <p className="balance-difference">현재 최고·최저 팀 합계 차이: <strong>{Math.max(...teamStats.map(t=>t.total))-Math.min(...teamStats.map(t=>t.total))}점</strong></p>}
        </div>
      </div>
      <p className="tiny balance-footnote">기본 점수는 S=100, A=80, B=60, C=40, D=20으로 시작하며 직접 바꿀 수 있어. 자동 배정은 높은 점수 선수부터 현재 합계가 가장 낮은 팀에 배정하고, 팀장은 기존 팀에 유지해. 팀원 수 제한도 적용돼.</p>
    </>}
  </section>;
}
