import React, { useEffect, useMemo, useState } from 'react';
import { Search, Trophy, Gavel, Users, Medal, Save, Swords } from 'lucide-react';
import './PlayerProfiles.css';

const GAME_OPTIONS = ['리그 오브 레전드', '발로란트', '오버워치 2', '에이펙스 레전드', '배틀그라운드', '이터널 리턴', '기타'];
const blankGame = game => ({ game, position: '', tier: '', favorites: '', notes: '' });
const GAME_EXAMPLES = {
  '리그 오브 레전드': ['미드, 정글, 탑, 원딜, 서포터', '에메랄드 2, 다이아몬드 4, 마스터', '아리, 야스오, 리 신', '주로 미드 라인에서 플레이합니다.'],
  '발로란트': ['타격대, 척후대, 감시자, 전략가', '실버 2, 다이아몬드, 초월자', '제트, 레이나, 소바', '타격대 역할과 엔트리 진입을 선호합니다.'],
  '오버워치 2': ['돌격, 공격, 지원', '골드 3, 다이아몬드, 마스터', '디바, 트레이서, 아나', '주 포지션과 자주 플레이하는 영웅을 적어 주세요.'],
  '에이펙스 레전드': ['교전 담당, 정찰, 지원', '골드, 플래티넘, 다이아몬드, 마스터', '레이스, 호라이즌, 블러드하운드', '주 무기나 교전 스타일을 적어 주세요.'],
  '배틀그라운드': ['오더, 엔트리, 저격, 서포트', '경쟁전 티어', 'M416, 베릴, AWM', '선호 맵이나 팀 역할을 적어 주세요.'],
  '이터널 리턴': ['딜러, 탱커, 서포터', '브론즈, 골드, 플래티넘, 데미갓', '실비아, 아비게일, 재키', '주 실험체와 선호 무기군을 적어 주세요.'],
  '기타': ['주 역할 또는 플레이 스타일', '랭크 / 등급 (없으면 비워 두기)', '좋아하는 캐릭터, 무기, 직업 등', '게임 내 강점이나 소개하고 싶은 내용을 적어 주세요.']
};
const gameExample = (game, index) => (GAME_EXAMPLES[game] || GAME_EXAMPLES['기타'])[index];

const emptyEdit = p => {
  const saved = Array.isArray(p.game_profiles) ? p.game_profiles : [];
  const games = saved.length ? saved.map(g => ({ ...blankGame(g.game || '기타'), ...g, favorites: Array.isArray(g.favorites) ? g.favorites.join(', ') : (g.favorites || '') })) : (
    (p.main_position || p.tier || (p.favorite_champions || []).length)
      ? [{ ...blankGame('리그 오브 레전드'), position: p.main_position || '', tier: p.tier || '', favorites: (p.favorite_champions || []).join(', ') }]
      : []
  );
  return { games };
};

export default function PlayerProfiles({ supabase, roomId, room, players = [], teams = [], history = [], isAdmin = false, onRefresh }) {
  const [tournamentResults, setTournamentResults] = useState([]);
  const [search, setSearch] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [edits, setEdits] = useState({});
  const [editingId, setEditingId] = useState('');

  useEffect(() => {
    setEdits(Object.fromEntries(players.map(p => [p.id, emptyEdit(p)])));
  }, [players]);

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

  const cards = useMemo(() => players.filter(p => !p.is_captain).map(player => {
    const auctionRecords = history.filter(h => h.player_id === player.id);
    const soldRecord = auctionRecords.find(h => h.team_id === player.team_id) || auctionRecords[0];
    const mvpCount = tournamentResults.filter(r => (r.mvp || '').trim().toLowerCase() === player.name.trim().toLowerCase()).length;
    const team = teams.find(t => t.id === player.team_id);
    const wins = tournamentResults.filter(r => r.winner && r.winner !== '무승부' && r.winner === team?.name).length;
    const appearances = tournamentResults.filter(r => r.team_a === team?.name || r.team_b === team?.name).length;
    return { ...player, teamName: team?.name || (player.status === 'available' ? '미배정' : '팀 미확인'), auctionRecords, soldRecord, mvpCount, wins, appearances };
  }).filter(p => (gradeFilter === 'all' || p.grade === gradeFilter) && p.name.toLowerCase().includes(search.trim().toLowerCase())), [players, history, teams, tournamentResults, gradeFilter, search]);

  async function saveProfile(player) {
    const value = edits[player.id] || emptyEdit(player);
    const game_profiles = (value.games || []).map(g => ({
      game: String(g.game || '기타').trim().slice(0, 60),
      position: String(g.position || '').trim().slice(0, 80),
      tier: String(g.tier || '').trim().slice(0, 80),
      favorites: [...new Set(String(g.favorites || '').split(',').map(s => s.trim()).filter(Boolean))].slice(0, 20),
      notes: String(g.notes || '').trim().slice(0, 240)
    })).filter(g => g.game);
    const lol = game_profiles.find(g => g.game === '리그 오브 레전드');
    const main_position = lol?.position || '';
    const tier = lol?.tier || '';
    const favorite_champions = lol?.favorites || [];
    setBusyId(player.id); setError(''); setNotice('');
    try {
      const { error: updateError } = await supabase.from('players').update({ game_profiles, main_position, tier, favorite_champions }).eq('id', player.id).eq('room_id', roomId);
      if (updateError) throw updateError;
      setNotice(player.name + ' 선수의 게임별 프로필을 저장했습니다.');
      setEditingId('');
      if (onRefresh) await onRefresh();
    } catch (e) { setError(e.message || '프로필 저장에 실패했습니다.'); }
    finally { setBusyId(''); }
  }

  return <section className="player-profiles">
    <div className="panel player-profiles-intro">
      <div><p className="eyebrow">BAEKYA PLAYER HUB</p><h3>선수 프로필</h3><p className="muted">주 포지션, 티어, 선호 챔피언과 현재 방의 경매·대회 기록을 확인합니다.</p></div>
      <span className="pill">{cards.length}명</span>
    </div>
    <div className="profile-tools panel">
      <label className="profile-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="선수 닉네임 검색" aria-label="선수 닉네임 검색"/></label>
      <div className="profile-grade-filters">{['all','S','A','B','C','D'].map(g=><button key={g} type="button" className={gradeFilter===g?'profile-filter active':'profile-filter'} onClick={()=>setGradeFilter(g)}>{g==='all'?'전체':g+'급'}</button>)}</div>
    </div>
    {error && <div className="alert">{error}</div>}{notice && <div className="success">{notice}</div>}
    {loading && <p className="muted">대회 기록을 불러오는 중…</p>}
    {cards.length ? <div className="profile-grid">{cards.map(player=>{
      const edit = edits[player.id] || emptyEdit(player);
      return <article className="profile-card" key={player.id}>
        <div className="profile-card-top"><span className={'grade '+player.grade}>{player.grade}</span><span className="pill">{player.status==='sold'?'낙찰 완료':player.status==='auctioning'?'경매 중':player.status==='passed'?'유찰':'대기 중'}</span></div>
        <h3>{player.name}</h3><p className="profile-team"><Users size={14}/>{player.teamName}</p>
        <div className="profile-game-list">
          {(Array.isArray(player.game_profiles) && player.game_profiles.length ? player.game_profiles : ((player.main_position || player.tier || (player.favorite_champions || []).length) ? [{game:'리그 오브 레전드',position:player.main_position,tier:player.tier,favorites:player.favorite_champions}] : [])).map((g, index) => <div className="profile-game-item" key={(g.game || 'game') + index}>
            <div className="profile-game-title"><strong>{g.game || '게임'}</strong>{g.tier && <span>{g.tier}</span>}</div>
            {g.position && <p><span>주 포지션</span>{g.position}</p>}
            {Array.isArray(g.favorites) && g.favorites.length > 0 && <p><span>{g.game === '발로란트' ? '선호 요원' : '선호 캐릭터'}</span>{g.favorites.join(' · ')}</p>}
            {g.notes && <p><span>메모</span>{g.notes}</p>}
          </div>)}
          {!(Array.isArray(player.game_profiles) && player.game_profiles.length) && !(player.main_position || player.tier || (player.favorite_champions || []).length) && <p className="profile-champions">아직 등록된 게임 프로필이 없습니다.</p>}
        </div>
        <div className="profile-card-stats">
          <div><small>시작가</small><strong>{player.start_price ?? 0}P</strong></div>
          <div><small>낙찰가</small><strong>{player.sold_price != null ? player.sold_price+'P' : player.soldRecord ? player.soldRecord.price+'P' : '—'}</strong></div>
          <div><small>MVP</small><strong>{player.mvpCount}회</strong></div>
        </div>
        <div className="profile-card-foot"><span><Trophy size={14}/>대회 MVP {player.mvpCount}회</span><span><Gavel size={14}/>낙찰 기록 {player.auctionRecords.length}건</span><span>팀 승리 {player.wins}/{player.appearances}</span></div>
        {isAdmin && <div className="profile-edit">
          {editingId === player.id ? <>
            <div className="profile-game-editor-heading"><strong>게임별 프로필</strong><button className="btn ghost" type="button" onClick={() => setEdits(v=>({...v,[player.id]:{...edit,games:[...(edit.games||[]),blankGame('리그 오브 레전드')]}}))}>+ 게임 추가</button></div>
            {(edit.games || []).map((gameProfile, gameIndex) => <div className="profile-game-editor" key={gameIndex}>
              <div className="profile-game-editor-top"><strong>게임 프로필 {gameIndex + 1}</strong><button className="btn danger" type="button" onClick={() => setEdits(v=>({...v,[player.id]:{...edit,games:edit.games.filter((_,i)=>i!==gameIndex)}}))}>삭제</button></div>
              <label className="field">게임<select value={gameProfile.game} onChange={e=>setEdits(v=>({...v,[player.id]:{...edit,games:edit.games.map((g,i)=>i===gameIndex?{...g,game:e.target.value}:g)}}))}>{[...new Set([...GAME_OPTIONS,gameProfile.game].filter(Boolean))].map(g=><option key={g} value={g}>{g}</option>)}</select></label>
              <label className="field">주 포지션 / 역할<input maxLength="80" value={gameProfile.position || ''} onChange={e=>setEdits(v=>({...v,[player.id]:{...edit,games:edit.games.map((g,i)=>i===gameIndex?{...g,position:e.target.value}:g)}}))} placeholder={'예: ' + gameExample(gameProfile.game, 0)}/></label>
              <label className="field">티어 / 랭크<input maxLength="80" value={gameProfile.tier || ''} onChange={e=>setEdits(v=>({...v,[player.id]:{...edit,games:edit.games.map((g,i)=>i===gameIndex?{...g,tier:e.target.value}:g)}}))} placeholder={'예: ' + gameExample(gameProfile.game, 1)}/></label>
              <label className="field">{gameProfile.game === '발로란트' ? '선호 요원' : gameProfile.game === '배틀그라운드' ? '선호 무기' : gameProfile.game === '마인크래프트' ? '선호 콘텐츠' : '선호 캐릭터'} (쉼표로 구분<input maxLength="500" value={gameProfile.favorites || ''} onChange={e=>setEdits(v=>({...v,[player.id]:{...edit,games:edit.games.map((g,i)=>i===gameIndex?{...g,favorites:e.target.value}:g)}}))} placeholder={'예: ' + gameExample(gameProfile.game, 2)}/></label>
              <label className="field">추가 소개<textarea maxLength="240" rows="2" value={gameProfile.notes || ''} onChange={e=>setEdits(v=>({...v,[player.id]:{...edit,games:edit.games.map((g,i)=>i===gameIndex?{...g,notes:e.target.value}:g)}}))} placeholder={'예: ' + gameExample(gameProfile.game, 3)}/></label>
            </div>)}
            {!edit.games?.length && <p className="tiny">등록할 게임이 없습니다. ‘게임 추가’를 눌러 프로필을 만들어 주세요.</p>}
            <div className="profile-edit-actions"><button className="btn primary" type="button" disabled={busyId===player.id} onClick={()=>saveProfile(player)}><Save size={14}/>{busyId===player.id?'저장 중…':'프로필 저장'}</button><button className="btn ghost" type="button" onClick={()=>setEditingId('')}>취소</button></div>
          </> : <button className="btn ghost full" type="button" onClick={()=>{setEdits(v=>({...v,[player.id]:emptyEdit(player)}));setEditingId(player.id);}}>게임 프로필 편집</button>}
        </div>}
      </article>;
    })}</div> : <div className="empty">조건에 맞는 선수가 없습니다.</div>}
    <div className="panel profile-history"><div className="panelhead"><div><h3><Medal size={18}/> 최근 대회 기록</h3><p className="tiny">현재 선택한 방의 대회 결과를 표시합니다.</p></div><span className="pill">{tournamentResults.length}경기</span></div>
      {tournamentResults.length ? <div className="playerlist">{tournamentResults.slice(0,8).map(r=><div className="playerrow" key={r.id}><div className="grow"><strong>{r.team_a} {r.score_a} : {r.score_b} {r.team_b}</strong><small>{r.event_date} · {r.title}{r.mvp ? ' · MVP '+r.mvp : ''}</small></div><span className="pill">{r.winner || '미정'}</span></div>)}</div> : <div className="empty">아직 저장된 대회 전적이 없습니다.</div>}
    </div>
    <p className="tiny">전적은 현재 방에 저장된 경매·대회 기록을 기준으로 계산됩니다. 팀 승리는 현재 팀명 기준이며, 과거 팀명이 바뀐 기록은 일부 연결되지 않을 수 있습니다.</p>
  </section>;
}
