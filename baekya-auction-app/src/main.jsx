import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Moon, Gavel, Users, Coins, ShieldCheck, LogOut, RefreshCw, Plus, Play, Pause, CheckCircle2, History, Settings, CircleAlert } from 'lucide-react';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const defaultRoomId = import.meta.env.VITE_ROOM_ID;
const supabase = url && anon ? createClient(url, anon) : null;
const PRICE = { S: 8, A: 6, B: 4, C: 3, D: 1 };

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [room, setRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState(defaultRoomId || '');
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [bids, setBids] = useState([]);
  const [history, setHistory] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [captainTeamId, setCaptainTeamId] = useState('');
  const [captainUserId, setCaptainUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('B');
  const [gradePrices, setGradePrices] = useState({ ...PRICE });
  const [budgetInputs, setBudgetInputs] = useState({});
  const [nicknameInputs, setNicknameInputs] = useState({});
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomBudget, setNewRoomBudget] = useState('30');
  const [newRoomTeamSize, setNewRoomTeamSize] = useState('5');

  const isAdmin = profile?.role === 'admin';
  const myTeam = teams.find(t => t.captain_user_id === session?.user?.id);
  const currentPlayer = players.find(p => p.id === room?.current_player_id) || null;
  const highestBid = bids.filter(b => b.player_id === currentPlayer?.id).sort((a,b) => b.amount-a.amount || new Date(b.created_at)-new Date(a.created_at))[0] || null;
  const currentPrice = highestBid?.amount ?? currentPlayer?.start_price ?? null;
  const activePlayers = players.filter(p => !p.is_captain && p.status === 'available');

  async function loadAll() {
    if (!supabase || !roomId) return;
    const [r,t,p,b,h,pr,allProfiles] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).single(),
      supabase.from('teams').select('*').eq('room_id', roomId).order('team_number'),
      supabase.from('players').select('*').eq('room_id', roomId).order('created_at'),
      supabase.from('bids').select('*').eq('room_id', roomId).order('created_at', {ascending:false}).limit(100),
      supabase.from('auction_history').select('*').eq('room_id', roomId).order('created_at', {ascending:false}).limit(100),
      supabase.from('profiles').select('*').eq('id', session?.user?.id || '00000000-0000-0000-0000-000000000000').maybeSingle(),
      supabase.from('profiles').select('id,discord_username,role').order('created_at')
    ]);
    if (r.error) setError('경매 방을 불러오지 못했습니다. 설정 안내의 SQL 초기화 단계를 확인해 주세요.'); else { setRoom(r.data); setGradePrices({ ...PRICE, ...(r.data.grade_prices || {}) }); }
    if (p.data) { setPlayers(p.data); setNicknameInputs(Object.fromEntries(p.data.map(player => [player.id, player.name]))); } if (t.data) { const loadedTeams = t.data.map(team => ({...team, roster_count: (p.data||[]).filter(player => player.team_id===team.id || player.captain_team_id===team.id).length})); setTeams(loadedTeams); setBudgetInputs(prev => Object.fromEntries(loadedTeams.map(team => [team.id, prev[team.id] ?? String(Number(team.budget) + Number(team.spent || 0))]))); } if (b.data) setBids(b.data); if (h.data) setHistory(h.data); if (pr.data) setProfile(pr.data); if (allProfiles.data) setProfiles(allProfiles.data)
  }

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({data}) => setSession(data.session));
    const {data:{subscription}} = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error: roomsError } = await supabase.from('rooms').select('id,name,status,created_at').order('created_at', { ascending: false });
      if (cancelled) return;
      if (roomsError) { setError('경매방 목록을 불러오지 못했습니다: ' + roomsError.message); return; }
      setRooms(data || []);
      if (data?.length && !data.some(r => r.id === roomId)) setRoomId(data[0].id);
    })();
    return () => { cancelled = true; };
  }, [session]);
  useEffect(() => { if (session && supabase && roomId) loadAll(); }, [session, roomId]);
  useEffect(() => {
    if (!supabase || !session || !roomId) return;
    const channel = supabase.channel(`auction-${roomId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'rooms',filter:`id=eq.${roomId}`},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'teams',filter:`room_id=eq.${roomId}`},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'players',filter:`room_id=eq.${roomId}`},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'bids',filter:`room_id=eq.${roomId}`},loadAll)
      .on('postgres_changes',{event:'*',schema:'public',table:'auction_history',filter:`room_id=eq.${roomId}`},loadAll)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, roomId]);

  async function login() {
    setError('');
    const {error} = await supabase.auth.signInWithOAuth({provider:'discord', options:{redirectTo:window.location.origin, scopes:'identify email'}});
    if (error) setError(error.message);
  }
  async function logout() { await supabase.auth.signOut(); setProfile(null); setRoom(null); }
  async function action(fn, args={}) {
    setBusy(true); setError(''); setNotice('');
    try {
      const {data, error} = await supabase.rpc(fn, args);
      if (error) throw error;
      setNotice(typeof data === 'string' ? data : '처리가 완료되었습니다.');
      await loadAll();
    } catch(e) { setError(e.message || '요청 처리에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  async function refreshRooms(preferredId) {
    const { data, error: roomsError } = await supabase.from('rooms').select('id,name,status,created_at').order('created_at', { ascending: false });
    if (roomsError) throw roomsError;
    setRooms(data || []);
    if (preferredId && data?.some(r => r.id === preferredId)) setRoomId(preferredId);
    else if (data?.length && !data.some(r => r.id === roomId)) setRoomId(data[0].id);
  }
  async function createRoom(e) {
    e.preventDefault(); const name = newRoomName.trim();
    if (name.length < 2) { setError('방 이름은 2자 이상 입력해 주세요.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: createError } = await supabase.rpc('create_auction_room', { p_name: name, p_budget: Number(newRoomBudget), p_team_size: Number(newRoomTeamSize) });
      if (createError) throw createError;
      await refreshRooms(data); setNewRoomName(''); setShowAdmin(false); setNotice('새 경매방과 3개 팀을 만들었습니다.');
    } catch (e) { setError(e.message || '경매방 생성에 실패했습니다.'); } finally { setBusy(false); }
  }
  async function deleteRoom() {
    if (!roomId || !room) return;
    if (!window.confirm('「' + room.name + '」 방을 삭제할까요? 선수나 경매 기록이 있으면 삭제되지 않습니다.')) return;
    setBusy(true); setError(''); setNotice('');
    try { const { error: deleteError } = await supabase.rpc('delete_auction_room', { p_room_id: roomId }); if (deleteError) throw deleteError; await refreshRooms(rooms.find(r => r.id !== roomId)?.id || ''); setNotice('경매방을 삭제했습니다.'); }
    catch (e) { setError(e.message || '경매방 삭제에 실패했습니다.'); } finally { setBusy(false); }
  }

  async function addPlayer(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true); setError('');
    const {error} = await supabase.from('players').insert({room_id:roomId, name:newName.trim(), grade:newGrade, start_price:Number(gradePrices[newGrade] ?? PRICE[newGrade]), status:'available', is_captain:false});
    setBusy(false);
    if (error) setError(error.message); else {setNewName(''); setNotice('선수를 등록했습니다.'); loadAll();}
  }
  async function saveSettings(e) {
    e.preventDefault();
    if (!roomId || room?.status !== 'setup') return;
    const budgets = teams.map(t => ({ team_id: t.id, budget: Number(budgetInputs[t.id]) }));
    if (budgets.some(item => !Number.isFinite(item.budget) || item.budget < 0 || item.budget > 500)) { setError('팀 예산은 0~500P 사이로 입력해 주세요.'); return; }
    if (Object.values(gradePrices).some(v => !Number.isFinite(Number(v)) || Number(v) < 1 || Number(v) > 100)) { setError('등급별 시작가는 1~100P 사이로 입력해 주세요.'); return; }
    await action('update_auction_balance_settings', { p_room_id: roomId, p_team_budgets: budgets, p_grade_prices: Object.fromEntries(Object.entries(gradePrices).map(([k,v]) => [k, Number(v)])) });
  }
  async function saveNickname(player) {
    const name = (nicknameInputs[player.id] || '').trim();
    if (!name) { setError('닉네임을 입력해 주세요.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error } = await supabase.from('players').update({ name }).eq('id', player.id).eq('room_id', roomId);
    setBusy(false);
    if (error) setError(error.message); else { setNotice(player.name + ' 닉네임을 수정했습니다.'); await loadAll(); }
  }
  async function assignCaptain(e) {
    e.preventDefault();
    if (!captainTeamId || !captainUserId) return;
    await action('assign_team_captain', {p_room_id:roomId, p_team_id:captainTeamId, p_user_id:captainUserId, p_grade:'B'});
    setCaptainTeamId(''); setCaptainUserId('');
  }

  if (!supabase || !roomId) return <Setup />;
  if (!session) return <main className="login"><div className="logo"><Moon size={27}/></div><p className="eyebrow">BAEKYA COMMUNITY · LEAGUE OF LEGENDS</p><h1>BAEKYA <span>AUCTION</span></h1><p className="muted lead">팀장을 맡고, 포인트를 전략적으로 사용해<br/>우리 팀의 승리를 만들어 보세요.</p><button className="btn primary loginbtn" onClick={login}><ShieldCheck size={18}/> Discord로 로그인</button>{error && <p className="error">{error}</p>}<p className="tiny">디스코드 인증은 Supabase OAuth 설정이 완료된 뒤 작동합니다.</p></main>;

  return <div className="app"><header><div className="brand"><div className="moon"><Moon size={22}/></div><div><h1>BAEKYA <span>AUCTION</span></h1><p>{room?.name || '백야 경매방'} · PLAYER DRAFT SYSTEM</p></div></div><div className="head-actions"><span className="pill">{profile?.discord_username || session.user.user_metadata?.full_name || session.user.email}</span>{isAdmin && <><label className="room-picker"><span>경매방</span><select aria-label="경매방 선택" value={roomId} onChange={e=>{setRoomId(e.target.value);setShowAdmin(false);setError('');setNotice('');}}>{rooms.map(r=><option key={r.id} value={r.id}>{r.name} · {r.status==='setup'?'준비':r.status==='running'?'진행 중':r.status==='paused'?'일시정지':'종료'}</option>)}</select></label><button className="btn ghost" onClick={()=>setShowAdmin(v=>!v)}><Settings size={16}/> 관리자</button></>}<button className="btn ghost" onClick={loadAll}><RefreshCw size={16}/></button><button className="btn ghost" onClick={logout}><LogOut size={16}/></button></div></header>
    <main className="main"><section className="hero"><div><p className="eyebrow">NIGHT LEAGUE · SEASON 01</p><h2>선수 영입 경매</h2><p className="muted">팀장 3명이 같은 예산으로 경쟁 입찰합니다. 낙찰 결과는 모든 참가자에게 실시간으로 표시됩니다.</p></div><div className={`status ${room?.status==='running'?'live':''}`}>● {room?.status==='running'?'경매 진행 중':room?.status==='paused'?'일시정지':room?.status==='finished'?'경매 종료':'준비 중'}</div></section>
    <section className="stats"><Stat icon={<Users/>} label="참가자" value={`${players.length}명`} sub="팀장 포함"/><Stat icon={<Gavel/>} label="경매 대기" value={`${activePlayers.length}명`} sub="팀장 제외"/><Stat icon={<Coins/>} label="전체 예산" value={`${teams.reduce((n,t)=>n+t.budget,0)}P`} sub="팀별 초기 30P"/><Stat icon={<History/>} label="낙찰 완료" value={`${history.length}명`} sub="기록 저장 중"/></section>
    {error && <div className="alert"><CircleAlert size={17}/>{error}</div>}{notice && <div className="success">{notice}</div>}
    <div className="columns"><section className="panel"><div className="panelhead"><h3>현재 경매</h3><span className="pill">입찰 단위 1P</span></div>{currentPlayer ? <div className="auction"><div className="playerhead"><div className={`avatar ${currentPlayer.grade}`}>{currentPlayer.grade}</div><div><h2>{currentPlayer.name}</h2><p>{currentPlayer.grade}급 선수 · 시작가 {currentPlayer.start_price}P</p></div></div><div className="price"><div><small>현재 최고 입찰가</small><strong>{currentPrice}P</strong></div><div className="highest">{highestBid ? `${teams.find(t=>t.id===highestBid.team_id)?.name || '팀'} 최고 입찰`:'아직 입찰 없음'}</div></div><button className="btn primary full" disabled={busy||room?.status!=='running'||!myTeam||myTeam.roster_count>=5||(highestBid?.team_id===myTeam?.id)||myTeam?.budget<(highestBid?highestBid.amount+1:currentPlayer.start_price)} onClick={()=>action('place_bid',{p_room_id:roomId,p_team_id:myTeam?.id})}>{myTeam?`${myTeam.name} · ${highestBid?.team_id===myTeam.id?'최고 입찰 중':'입찰하기'}`:'팀장 계정으로 지정되지 않았습니다'}</button><p className="tiny">팀장 계정으로 로그인하면 소속 팀의 입찰 버튼이 활성화됩니다.</p>{isAdmin && <button className="btn ghost full" disabled={busy||!highestBid} onClick={()=>action('award_current_player',{p_room_id:roomId})}><CheckCircle2 size={17}/> 최고 입찰 팀에 낙찰 확정</button>}</div> : <div className="empty"><Gavel size={30}/><h3>현재 경매 선수가 없습니다.</h3><p>관리자가 경매를 시작하고 선수를 선택하면 여기에 표시됩니다.</p></div>}
    {isAdmin && <div className="admin-tools"><div className="panelhead"><h3>경매 관리</h3><span className="pill">관리자 전용</span></div><div className="buttonrow"><button className="btn primary" disabled={busy} onClick={()=>action('set_auction_status',{p_room_id:roomId,p_status:'running'})}><Play size={16}/> 시작</button><button className="btn ghost" disabled={busy} onClick={()=>action('set_auction_status',{p_room_id:roomId,p_status:'paused'})}><Pause size={16}/> 일시정지</button><button className="btn ghost" disabled={busy} onClick={()=>action('set_auction_status',{p_room_id:roomId,p_status:'finished'})}>종료</button></div><label className="field">다음 경매 선수<select id="nextPlayer" defaultValue=""><option value="" disabled>선수 선택</option>{activePlayers.map(p=><option key={p.id} value={p.id}>{p.name} · {p.grade}급 · {p.start_price}P</option>)}</select></label><button className="btn primary full" disabled={busy} onClick={()=>{const id=document.getElementById('nextPlayer')?.value;if(id)action('select_auction_player',{p_room_id:roomId,p_player_id:id});}}>선수 경매 시작</button></div>}
    </section><aside className="panel"><div className="panelhead"><h3>팀별 예산 & 명단</h3><span className="pill">{room?.budget_per_team ?? 30}P / 팀</span></div><div className="teams">{teams.map((t,i)=><div className="team" key={t.id} style={{'--team': ['#a69aff','#70a9ff','#e5a1ff'][i%3]}}><div className="teamtop"><strong><i/> {t.name}</strong><span className="money">{t.budget}P</span></div><div className="subrow"><span>사용 {Math.max(0, Number(room?.budget_per_team ?? 30)-Number(t.budget))}P</span><span>{t.roster_count}/5명</span></div><div className="bar"><span style={{width:`${Math.min(100,(Number(room?.budget_per_team ?? 30)-Number(t.budget))/Math.max(1,Number(room?.budget_per_team ?? 30))*100)}%`}}/></div><p className="captain">팀장: {t.captain_name || '미지정'}</p><div className="chips">{players.filter(p=>p.team_id===t.id||p.captain_team_id===t.id).map(p=><span key={p.id}>{p.name}{p.is_captain?' · 팀장':p.sold_price!=null?` · ${p.sold_price}P`:''}</span>)}</div></div>)}</div></aside></div>
    <div className="columns lower"><section className="panel"><div className="panelhead"><h3>경매 대기 선수</h3><span className="pill">{activePlayers.length}명</span></div>{activePlayers.length ? <div className="playerlist">{activePlayers.map(p=><div className="playerrow" key={p.id}><div className={`grade ${p.grade}`}>{p.grade}</div><div className="grow"><strong>{p.name}</strong><small>시작가 {p.start_price}P</small></div>{isAdmin && <button className="btn ghost" onClick={()=>action('select_auction_player',{p_room_id:roomId,p_player_id:p.id})}>경매 선택</button>}</div>)}</div>:<div className="empty">대기 중인 선수가 없습니다.</div>}</section><section className="panel"><div className="panelhead"><h3>낙찰 기록</h3><span className="pill">{history.length}건</span></div>{history.length?<div className="playerlist">{history.map(h=><div className="playerrow" key={h.id}><div className={`grade ${h.grade}`}>{h.grade}</div><div className="grow"><strong>{h.player_name} → {h.team_name}</strong><small>{new Date(h.created_at).toLocaleString('ko-KR')}</small></div><strong className="winning">{h.price}P</strong></div>)}</div>:<div className="empty">아직 낙찰 기록이 없습니다.</div>}</section></div>
    {isAdmin && showAdmin && <div className="panel admin-panel"><div className="panelhead"><h3>관리자 설정</h3><button className="btn ghost" onClick={()=>setShowAdmin(false)}>닫기</button></div><div className="settings-section"><div className="panelhead"><h3>경매방 관리</h3><span className="pill">{rooms.length}개 방</span></div><form onSubmit={createRoom} className="adminform"><label className="field">새 방 이름<input value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} placeholder="예: 백야 롤 내전 2회차" maxLength={60} required /></label><label className="field">팀별 예산 (P)<input type="number" min="1" max="500" value={newRoomBudget} onChange={e=>setNewRoomBudget(e.target.value)} required /></label><label className="field">팀당 인원<input type="number" min="1" max="10" value={newRoomTeamSize} onChange={e=>setNewRoomTeamSize(e.target.value)} required /></label><button className="btn primary" disabled={busy}><Plus size={16}/> 새 경매방 만들기</button></form><p className="tiny">새 방은 준비 상태로 생성되며 1팀·2팀·3팀이 자동으로 만들어집니다.</p><button type="button" className="btn danger" disabled={busy || !room || roomId==="bace0000-0000-4000-8000-000000000001"} onClick={deleteRoom}>현재 선택한 방 삭제</button><p className="tiny">기존 ‘백야 롤 내전’은 삭제할 수 없습니다. 선수·입찰·경매 기록이 있는 방도 삭제가 차단됩니다.</p></div><form onSubmit={addPlayer} className="adminform"><label className="field">선수 닉네임<input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="예: 새벽별" required/></label><label className="field">실력 등급<select value={newGrade} onChange={e=>setNewGrade(e.target.value)}>{Object.keys(PRICE).map(g=><option key={g} value={g}>{g}급 · 시작가 {gradePrices[g] ?? PRICE[g]}P</option>)}</select></label><button className="btn primary" disabled={busy}><Plus size={16}/> 선수 등록</button></form><form onSubmit={assignCaptain} className="adminform"><label className="field">팀 선택<select value={captainTeamId} onChange={e=>setCaptainTeamId(e.target.value)} required><option value="">팀 선택</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name} · {t.captain_name||'팀장 미지정'}</option>)}</select></label><label className="field">디스코드 사용자<select value={captainUserId} onChange={e=>setCaptainUserId(e.target.value)} required><option value="">로그인한 사용자 선택</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.discord_username||p.id} · {p.role}</option>)}</select></label><button className="btn primary" disabled={busy}>팀장 지정</button></form><div className="settings-section"><div className="panelhead"><h3>팀 예산 · 등급별 시작가</h3><span className="pill">{room?.status === 'setup' ? '수정 가능' : '경매 설정 잠김'}</span></div>{room?.status !== 'setup' && <p className="tiny">현재 방은 준비 상태가 아니므로 기존 경매 기록 보호를 위해 예산과 시작가를 잠갔습니다. 새 경매 방을 준비 상태로 만들면 수정할 수 있습니다.</p>}<form onSubmit={saveSettings}><div className="settings-grid">{teams.map(t=><label className="field" key={t.id}>{t.name} 초기 예산 (P)<input type="number" min="0" max="500" value={budgetInputs[t.id] ?? ''} disabled={busy || room?.status !== 'setup'} onChange={e=>setBudgetInputs(v=>({...v,[t.id]:e.target.value}))} required /></label>)}</div><div className="settings-grid">{Object.keys(PRICE).map(g=><label className="field" key={g}>{g}급 시작가 (P)<input type="number" min="1" max="100" value={gradePrices[g] ?? PRICE[g]} disabled={busy || room?.status !== 'setup'} onChange={e=>setGradePrices(v=>({...v,[g]:e.target.value}))} required /></label>)}</div><button className="btn primary" disabled={busy || room?.status !== 'setup'}>예산·시작가 저장</button></form></div><div className="settings-section"><div className="panelhead"><h3>선수 닉네임 수정</h3><span className="pill">{players.length}명</span></div><div className="nickname-list">{players.map(p=><div className="nickname-editor" key={p.id}><span className={'grade ' + p.grade}>{p.grade}</span><input aria-label={p.name + ' 닉네임'} value={nicknameInputs[p.id] ?? p.name} onChange={e=>setNicknameInputs(v=>({...v,[p.id]:e.target.value}))} disabled={busy}/><button type="button" className="btn ghost" disabled={busy || !(nicknameInputs[p.id] || '').trim() || (nicknameInputs[p.id] || '').trim()===p.name} onClick={()=>saveNickname(p)}>저장</button></div>)}</div></div><p className="tiny">중요: 관리자 권한은 profiles.role='admin'인 계정에만 부여됩니다. 처음 관리자는 Supabase SQL Editor에서 직접 지정하세요.</p></div>}
    <footer>BAEKYA AUCTION · 실시간 데이터는 Supabase에서 동기화됩니다.</footer></main></div>;
}
function Stat({icon,label,value,sub}) { return <div className="stat"><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>; }
function Setup() { return <main className="setup"><div className="logo"><Moon size={28}/></div><p className="eyebrow">BAEKYA AUCTION · SETUP REQUIRED</p><h1>사이트 연결 설정이 필요해요.</h1><p>프로젝트 폴더의 <code>.env.example</code>을 복사해 <code>.env</code> 파일을 만들고, Supabase 프로젝트 URL·anon key·경매 방 UUID를 입력한 뒤 실행하세요.</p><ol><li>Supabase 프로젝트 생성</li><li><code>supabase/migrations/001_schema.sql</code>을 SQL Editor에서 실행</li><li>Authentication → Providers에서 Discord 활성화</li><li>환경변수 입력 후 <code>npm install</code>, <code>npm run dev</code></li></ol><p className="tiny">이 미리보기는 실제 계정이나 서버에 아직 연결되지 않았습니다.</p></main>; }

createRoot(document.getElementById('root')).render(<App/>);
