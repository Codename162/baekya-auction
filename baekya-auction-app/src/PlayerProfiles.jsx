import React, { useEffect, useMemo, useState } from 'react';
import { Search, Trophy, Gavel, Users, Medal } from 'lucide-react';
import './PlayerProfiles.css';

export default function PlayerProfiles({ supabase, roomId, room, players = [], teams = [], history = [] }) {
  const [tournamentResults, setTournamentResults] = useState([]);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadResults() {
      if (!supabase || !roomId) { setTournamentResults([]); return; }
      setLoading(true); setError('');
      const { data, error: queryError } = await supabase.from('tournament_results').select('id,title,event_date,team_a,team_b,winner,mvp,score_a,score_b').eq('room_id', roomId).order('event_date', { ascending: false });
      if (cancelled) return;
      if (queryError) setError('대회 전적을 불러오지 못했습니다: ' + queryError.message);
      else setTournamentResults(data || []);
      setLoading(false);
    }
    loadResults();
    return () => { cancelled = true; };
  }, [supabase, roomId]);

  const cards = useMemo(() => {
    return players.filter(p => !p.is_captain).map(player => {
      const auctionRecords = history.filter(h => h.player_id === player.id || (h.player_name === player.name && h.grade === player.grade));
      const soldRecord = auctionRecords[0] || history.find(h => h.player_id === player.id);
      const mvpCount = tournamentResults.filter(r => (r.mvp || '').trim().toLowerCase() === player.name.trim().toLowerCase()).length;
      const wins = tournamentResults.filter(r => r.winner && r.winner !== '무승부' && (r.winner === teams.find(t => t.id === player.team_id)?.name)).length;
      const team = teams.find(t => t.id === player.team_id);
      return { ...player, teamName: team?.name || (player.status === 'available' ? '미배정' : '팀 미확인'), auctionRecords, soldRecord, mvpCount, wins };
    }).filter(p => (gradeFilter === 'all' || p.grade === gradeFilter) && p.name.toLowerCase().includes(search.trim().toLowerCase()));
  }, [players, history, teams, tournamentResults, gradeFilter, search]);

  return <section className="player-profiles">
    <div className="panel player-profiles-intro">
      <div><p className="eyebrow">BAEKYA PLAYER HUB</p><h3>선수 프로필</h3><p className="muted">등급, 소속 팀, 낙찰 기록과 대회 MVP 기록을 확인합니다.</p></div>
      <span className="pill">{cards.length}명</span>
    </div>
    <div className="profile-tools panel">
      <label className="profile-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="선수 닉네임 검색" aria-label="선수 닉네임 검색"/></label>
      <div className="profile-grade-filters">{['all','S','A','B','C','D'].map(g=><button key={g} type="button" className={gradeFilter===g?'profile-filter active':'profile-filter'} onClick={()=>setGradeFilter(g)}>{g==='all'?'전체':g+'급'}</button>)}</div>
    </div>
    {error && <div className="alert">{error}</div>}
    {loading && <p className="muted">대회 기록을 불러오는 중…</p>}
    {cards.length ? <div className="profile-grid">{cards.map(player=><article className="profile-card" key={player.id}>
      <div className="profile-card-top"><span className={'grade '+player.grade}>{player.grade}</span><span className="pill">{player.status==='sold'?'낙찰 완료':player.status==='auctioning'?'경매 중':player.status==='passed'?'유찰':'대기 중'}</span></div>
      <h3>{player.name}</h3><p className="profile-team"><Users size={14}/>{player.teamName}</p>
      <div className="profile-card-stats">
        <div><small>시작가</small><strong>{player.start_price ?? 0}P</strong></div>
        <div><small>낙찰가</small><strong>{player.sold_price != null ? player.sold_price+'P' : player.soldRecord ? player.soldRecord.price+'P' : '—'}</strong></div>
        <div><small>팀 MVP</small><strong>{player.mvpCount}회</strong></div>
      </div>
      <div className="profile-card-foot"><span><Trophy size={14}/>대회 MVP {player.mvpCount}회</span><span><Gavel size={14}/>낙찰 기록 {player.auctionRecords.length}건</span></div>
    </article>)}</div> : <div className="empty">조건에 맞는 선수가 없습니다.</div>}
    <div className="panel profile-history"><div className="panelhead"><div><h3><Medal size={18}/> 최근 대회 기록</h3><p className="tiny">현재 선택한 방의 대회 결과를 표시합니다.</p></div><span className="pill">{tournamentResults.length}경기</span></div>
      {tournamentResults.length ? <div className="playerlist">{tournamentResults.slice(0,8).map(r=><div className="playerrow" key={r.id}><div className="grow"><strong>{r.team_a} {r.score_a} : {r.score_b} {r.team_b}</strong><small>{r.event_date} · {r.title}{r.mvp ? ' · MVP '+r.mvp : ''}</small></div><span className="pill">{r.winner || '미정'}</span></div>)}</div> : <div className="empty">아직 저장된 대회 전적이 없습니다.</div>}
    </div>
    <p className="tiny">전적은 현재 방에 저장된 경매·대회 기록을 기준으로 계산됩니다. 선수 이름이 변경된 과거 기록은 일부 연결되지 않을 수 있습니다.</p>
  </section>;
}
