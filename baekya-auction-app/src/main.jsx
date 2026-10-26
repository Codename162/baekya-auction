import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Orbit, Zap, ContactRound, Gem, Shield, LogOut, RefreshCw, Plus, Play, Pause, BadgeCheck, History, SlidersHorizontal, CircleAlert, Crown, Megaphone, Activity } from 'lucide-react';
import './style.css';
import SpectatorEvents from './SpectatorEvents.jsx';
import TeamBalance from './TeamBalance.jsx';
import DiscordTeamResults from './DiscordTeamResults.jsx';
import AdminRecords from './AdminRecords.jsx';
import OperationsCenter from './OperationsCenter.jsx';
import PlayerProfiles from './PlayerProfiles.jsx';
import RoomTools from './RoomTools.jsx';
import TournamentBracket from './TournamentBracket.jsx';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
const defaultRoomId = import.meta.env.VITE_ROOM_ID;
const supabase = url && anon ? createClient(url, anon) : null;
const PRICE = { S: 8, A: 6, B: 4, C: 3, D: 1 };

function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [room, setRoom] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomId, setRoomId] = useState('');
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [allPlayers, setAllPlayers] = useState([]);
  const [bids, setBids] = useState([]);
  const [history, setHistory] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [captainTeamId, setCaptainTeamId] = useState('');
  const [captainUserId, setCaptainUserId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showAdmin, setShowAdmin] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [bidIncrement, setBidIncrement] = useState(1);
  const [gradePrices, setGradePrices] = useState({ ...PRICE });
  const [budgetInputs, setBudgetInputs] = useState({});
  const [nicknameInputs, setNicknameInputs] = useState({});
  const [newRoomName, setNewRoomName] = useState('');
  const [roomNameInputs, setRoomNameInputs] = useState({});
  const [newRoomBudget, setNewRoomBudget] = useState('30');
  const [newRoomTeamSize, setNewRoomTeamSize] = useState('5');
  const [newRoomTeamCount, setNewRoomTeamCount] = useState('3');
  const [newRoomType, setNewRoomType] = useState('auction');
  const [autoRegisteredKey, setAutoRegisteredKey] = useState('');
  const [timerNow, setTimerNow] = useState(Date.now());
  const [auctionStats, setAuctionStats] = useState(null);
  const [celebration, setCelebration] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const myTeam = teams.find(t => t.captain_user_id === session?.user?.id);
  const currentPlayer = players.find(p => p.id === room?.current_player_id) || null;
  const highestBid = bids.filter(b => b.player_id === currentPlayer?.id).sort((a,b) => b.amount-a.amount || new Date(b.created_at)-new Date(a.created_at))[0] || null;
  const currentPrice = highestBid?.amount ?? currentPlayer?.start_price ?? null;
  const auctionDeadline = room?.current_player_id ? new Date((room.highest_team_id && room.last_bid_at ? room.last_bid_at : room.auction_started_at || new Date().toISOString())).getTime() + (room.highest_team_id && room.last_bid_at ? 5000 : 40000) : null;
  const auctionSecondsLeft = auctionDeadline ? Math.max(0, Math.ceil((auctionDeadline - timerNow) / 1000)) : 0;
  const activePlayers = players.filter(p => !p.is_captain && p.status === 'available');

  function navigateSection(section, targetRoomId = null) {
    if (section === 'auction' || section === 'balance') {
      const roomType = section === 'balance' ? 'balance' : 'auction';
      const requested = targetRoomId ? rooms.find(r => r.id === targetRoomId && r.room_type === roomType) : null;
      const current = rooms.find(r => r.id === roomId && r.room_type === roomType);
      const target = requested || current || rooms.find(r => r.room_type === roomType);
      if (target) setRoomId(target.id);
    }
    setActiveSection(section);
    setShowAdmin(false);
    setError('');
    setNotice('');
  }

  useEffect(() => {
    if (!session || !activeSection) return;
    const timer = window.setTimeout(() => {
      document.getElementById('section-workspace')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
    return () => window.clearTimeout(timer);
  }, [activeSection, roomId, session]);

  async function loadAll() {
    if (!supabase || !roomId) return;
    const [r,t,p,b,h,pr,allProfiles,allRoomPlayers] = await Promise.all([
      supabase.from('rooms').select('*').eq('id', roomId).single(),
      supabase.from('teams').select('*').eq('room_id', roomId).order('team_number'),
      supabase.from('players').select('*').eq('room_id', roomId).or('discord_user_id.not.is.null,is_captain.eq.true').order('created_at'),
      supabase.from('bids').select('*').eq('room_id', roomId).order('created_at', {ascending:false}).limit(100),
      supabase.from('auction_history').select('*').eq('room_id', roomId).order('created_at', {ascending:false}).limit(100),
      supabase.from('profiles').select('*').eq('id', session?.user?.id || '00000000-0000-0000-0000-000000000000').maybeSingle(),
      supabase.from('profiles').select('id,discord_username,role,created_at').order('created_at'),
      supabase.from('players').select('*').not('discord_user_id', 'is', null)
    ]);
    if (r.error) setError('경매 방을 불러오지 못했습니다. 설정 안내의 SQL 초기화 단계를 확인해 주세요.'); else { setRoom(r.data); setGradePrices({ ...PRICE, ...(r.data.grade_prices || {}) }); }
    if (p.data) { setPlayers(p.data); setNicknameInputs(Object.fromEntries(p.data.map(player => [player.id, player.name]))); } if (allRoomPlayers.data) setAllPlayers(allRoomPlayers.data); if (t.data) { const loadedTeams = t.data.map(team => ({...team, roster_count: (p.data||[]).filter(player => player.team_id===team.id || player.captain_team_id===team.id).length})); setTeams(loadedTeams); setBudgetInputs(prev => Object.fromEntries(loadedTeams.map(team => [team.id, prev[team.id] ?? String(Number(team.budget) + Number(team.spent || 0))]))); } if (b.data) setBids(b.data); if (h.data) setHistory(h.data); if (pr.data) setProfile(pr.data); if (allProfiles.data) setProfiles(allProfiles.data); const { data: statsData } = await supabase.rpc('get_auction_stats', { p_room_id: roomId }); if (statsData) setAuctionStats(Array.isArray(statsData) ? statsData[0] : statsData)
  }

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let active = true;
    // Subscribe before reading the existing session so an OAuth callback/session
    // refresh cannot be missed while the initial session is being restored.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (event === 'INITIAL_SESSION' || nextSession) setAuthLoading(false);
    });

    supabase.auth.getSession()
      .then(({ data, error: sessionError }) => {
        if (!active) return;
        if (sessionError) setError('로그인 세션을 확인하지 못했습니다. 다시 로그인해 주세요.');
        setSession(data?.session ?? null);
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setError('로그인 세션을 복구하지 못했습니다. 다시 로그인해 주세요.');
        }
      })
      .finally(() => {
        if (active) setAuthLoading(false);
      });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!session || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error: roomsError } = await supabase.from('rooms').select('id,name,status,created_at,room_type').order('created_at', { ascending: false });
      if (cancelled) return;
      if (roomsError) { setError('경매방 목록을 불러오지 못했습니다: ' + roomsError.message); return; }
      setRooms(data || []);
      if (data?.length && !data.some(r => r.id === roomId)) setRoomId(data.find(r => r.id === defaultRoomId)?.id || data[0].id);
    })();
    return () => { cancelled = true; };
  }, [session]);
  useEffect(() => { if (session && supabase && roomId) loadAll(); }, [session, roomId]);

  useEffect(() => {
    if (!session?.user?.id || !supabase || !roomId) return;
    const selectedRoom = rooms.find(r => r.id === roomId);
    if (!selectedRoom || selectedRoom.status === 'finished') return;
    const registrationKey = `${session.user.id}:${roomId}`;
    if (autoRegisteredKey === registrationKey) return;
    let cancelled = false;
    (async () => {
      const { data, error: registrationError } = await supabase.rpc('register_discord_player', { p_room_id: roomId });
      if (cancelled) return;
      if (registrationError) {
        setError('선수 자동 등록에 실패했습니다: ' + registrationError.message);
        return;
      }
      setAutoRegisteredKey(registrationKey);
      if (data?.status === 'registered') {
        setNotice(`${data.name || 'Discord 사용자'}님이 선수 목록에 자동 등록되었습니다.`);
        await loadAll();
      } else if (data?.status === 'captain') {
        setAutoRegisteredKey(registrationKey);
      } else {
        setAutoRegisteredKey(registrationKey);
      }
    })();
    return () => { cancelled = true; };
  }, [session, roomId, rooms, autoRegisteredKey]);
  useEffect(() => {
    const timer = window.setInterval(() => setTimerNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!session || !supabase || !roomId || room?.status !== 'running' || !room?.current_player_id || !room?.auction_started_at) return;
    const tick = async () => {
      if (profile?.role !== 'admin') return;
      try { await supabase.rpc('auto_finalize_auction', { p_room_id: roomId }); } catch (_) {}
    };
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session, roomId, room?.status, room?.current_player_id, room?.auction_started_at, room?.last_bid_at, profile?.role]);

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
      const message = typeof data === 'string' ? data : '처리가 완료되었습니다.';
      setNotice(message);
      if (/낙찰|영입 완료|선수 영입/.test(message) || fn === 'award_current_player') {
        setCelebration(true);
        window.setTimeout(() => setCelebration(false), 3200);
      }
      await loadAll();
    } catch(e) { setError(e.message || '요청 처리에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  async function refreshRooms(preferredId) {
    const { data, error: roomsError } = await supabase.from('rooms').select('id,name,status,created_at,room_type').order('created_at', { ascending: false });
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
      const { data, error: createError } = await supabase.rpc('create_auction_room', { p_name: name, p_budget: Number(newRoomBudget), p_team_size: Number(newRoomTeamSize), p_team_count: Number(newRoomTeamCount), p_room_type: newRoomType });
      if (createError) throw createError;
      await refreshRooms(data); setNewRoomName(''); setShowAdmin(false); setActiveSection(newRoomType === 'balance' ? 'balance' : 'auction'); setNotice((newRoomType === 'balance' ? '점수 팀배정방' : '선수 경매방') + '을 만들었습니다.');
    } catch (e) { setError(e.message || (newRoomType === 'balance' ? '점수 팀배정방 생성에 실패했습니다.' : '선수 경매방 생성에 실패했습니다.')); } finally { setBusy(false); }
  }
  async function saveRoomName(targetRoom) {
    const name = (roomNameInputs[targetRoom.id] ?? targetRoom.name).trim();
    if (name.length < 2) { setError('방 이름은 2자 이상 입력해 주세요.'); return; }
    if (name.length > 60) { setError('방 이름은 60자 이하로 입력해 주세요.'); return; }
    if (name === targetRoom.name) { setNotice('변경된 방 이름이 없습니다.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { data: updatedRoom, error: updateError } = await supabase.from('rooms').update({ name }).eq('id', targetRoom.id).select('id,name').maybeSingle();
      if (updateError) throw updateError;
      if (!updatedRoom) throw new Error('방 이름이 저장되지 않았습니다. 해당 방의 관리자 권한을 확인해 주세요.');
      setRooms(prev => prev.map(r => r.id === targetRoom.id ? { ...r, name } : r));
      if (targetRoom.id === roomId) setRoom(prev => prev ? { ...prev, name } : prev);
      setRoomNameInputs(prev => ({ ...prev, [targetRoom.id]: name }));
      setNotice('방 이름을 「' + name + '」(으)로 변경했습니다.');
    } catch (e) { setError(e.message || '방 이름 변경에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  async function deleteRoom(targetRoom) {
    if (!targetRoom?.id || targetRoom.status !== 'finished') return;
    const confirmed = window.confirm('정말 삭제할까요?\\n\\n「' + targetRoom.name + '」 방과 해당 방의 선수·팀·입찰·낙찰 기록이 모두 영구 삭제됩니다.\\n이 작업은 되돌릴 수 없습니다.');
    if (!confirmed) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: deleteError } = await supabase.rpc('delete_auction_room', { p_room_id: targetRoom.id });
      if (deleteError) throw deleteError;
      const nextRoom = rooms.find(r => r.id !== targetRoom.id)?.id || '';
      await refreshRooms(nextRoom);
      setNotice('종료된 경매방 「' + targetRoom.name + '」을 삭제했습니다.');
    } catch (e) { setError(e.message || '경매방 삭제에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  async function saveSlidersHorizontal(e) {
    e.preventDefault();
    if (!roomId || room?.status !== 'setup') return;
    const budgets = teams.map(t => ({ team_id: t.id, budget: Number(budgetInputs[t.id]) }));
    if (budgets.some(item => !Number.isFinite(item.budget) || item.budget < 0 || item.budget > 500)) { setError('팀 예산은 0~500P 사이로 입력해 주세요.'); return; }
    if (Object.values(gradePrices).some(v => !Number.isFinite(Number(v)) || Number(v) < 1 || Number(v) > 100)) { setError('등급별 시작가는 1~100P 사이로 입력해 주세요.'); return; }
    await action('update_auction_balance_settings', { p_room_id: roomId, p_team_budgets: budgets, p_grade_prices: Object.fromEntries(Object.entries(gradePrices).map(([k,v]) => [k, Number(v)])) });
  }
  async function saveGrade(player, grade) {
    if (!['S','A','B','C','D'].includes(grade) || player.is_captain) return;
    setBusy(true); setError(''); setNotice('');
    const changes = { grade };
    if (player.status === 'available') changes.start_price = Number(gradePrices[grade] ?? PRICE[grade]);
    const { data: updatedPlayer, error: gradeError } = await supabase.from('players').update(changes).eq('id', player.id).eq('room_id', player.room_id || roomId).select('id').maybeSingle();
    setBusy(false);
    if (gradeError) setError(gradeError.message); else if (!updatedPlayer) setError('선수 등급이 저장되지 않았습니다. 관리자 권한과 방 설정을 확인해 주세요.'); else { setNotice(player.name + ' 선수 등급을 ' + grade + '급으로 변경했습니다.'); await loadAll(); }
  }

  async function saveGlobalGrade(discordUserId, grade) {
    if (!discordUserId || !['S','A','B','C','D'].includes(grade)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: gradeError } = await supabase.rpc('set_member_global_grade', {
        p_discord_user_id: discordUserId,
        p_grade: grade
      });
      if (gradeError) throw gradeError;
      setNotice(typeof data === 'string' ? data : '멤버 기본 등급을 변경했습니다.');
      await loadAll();
    } catch (e) {
      setError(e.message || '전체 방 등급 변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function unsetCaptain(team) {
    if (!team?.captain_user_id) return;
    if (!window.confirm(team.name + ' 팀장의 지정을 해제할까요?')) return;
    await action('unset_team_captain', { p_room_id: roomId, p_team_id: team.id });
  }

  async function saveNickname(player) {
    const name = (nicknameInputs[player.id] || '').trim();
    if (!name) { setError('닉네임을 입력해 주세요.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      if (player.discord_user_id) {
        const { data: updatedPlayers, error } = await supabase.from('players').update({ name }).eq('discord_user_id', player.discord_user_id).eq('is_captain', false).select('id');
        if (error) throw error;
        if (!updatedPlayers?.length) throw new Error('닉네임이 저장되지 않았습니다. 변경 권한을 확인해 주세요.');
        setNotice(player.name + ' 닉네임을 모든 방에서 동일하게 변경했습니다.');
      } else {
        const { data: updatedPlayers, error } = await supabase.from('players').update({ name }).eq('id', player.id).eq('room_id', roomId).select('id');
        if (error) throw error;
        if (!updatedPlayers?.length) throw new Error('닉네임이 저장되지 않았습니다. 변경 권한을 확인해 주세요.');
        setNotice(player.name + ' 닉네임을 변경했습니다. 이 선수는 Discord 계정과 연결되어 있지 않아 현재 방에만 적용됩니다.');
      }
      await loadAll();
    } catch (e) { setError(e.message || '닉네임 변경에 실패했습니다.'); }
    finally { setBusy(false); }
  }
  async function assignCaptain(e) {
    e.preventDefault();
    if (!captainTeamId || !captainUserId) return;
    await action('assign_team_captain', {p_room_id:roomId, p_team_id:captainTeamId, p_user_id:captainUserId, p_grade:'B'});
    setCaptainTeamId(''); setCaptainUserId('');
  }

  if (!supabase) return <Setup />;
  if (authLoading) return <main className="login"><div className="logo"><Orbit size={27}/></div><p className="eyebrow">BAEKYA COMMUNITY</p><h1>BAEKYA <span>AUCTION</span></h1><p className="muted lead">로그인 상태를 확인하고 있습니다…</p></main>;
  if (!session) return <main className="login"><div className="logo"><Orbit size={27}/></div><p className="eyebrow">BAEKYA COMMUNITY · LEAGUE OF LEGENDS</p><h1>BAEKYA <span>AUCTION</span></h1><p className="muted lead">팀장을 맡고, 포인트를 전략적으로 사용해<br/>우리 팀의 승리를 만들어 보세요.</p><button className="btn primary loginbtn" onClick={login}><Shield size={18}/> Discord로 로그인</button>{error && <p className="error">{error}</p>}<p className="tiny">디스코드 인증은 Supabase OAuth 설정이 완료된 뒤 작동합니다.</p></main>;

  return <div className="app"><header><div className="brand"><div className="moon"><Orbit size={22}/></div><div><h1>BAEKYA <span>AUCTION</span></h1><p>백야 · PLAYER DRAFT SYSTEM</p></div></div><div className="head-actions"><span className="pill">{profile?.discord_username || session.user.user_metadata?.full_name || session.user.email}</span>{(activeSection === 'auction' || activeSection === 'balance') && <label className="room-picker"><span>{activeSection === 'balance' ? '팀배정방' : '경매방'}</span><select aria-label={activeSection === 'balance' ? '팀배정방 선택' : '경매방 선택'} value={rooms.some(r=>r.id===roomId && r.room_type===(activeSection==='balance'?'balance':'auction')) ? roomId : ''} onChange={e=>{setRoomId(e.target.value);setShowAdmin(false);setError('');setNotice('');}}><option value="" disabled>방 선택</option>{rooms.filter(r=>r.room_type===(activeSection==='balance'?'balance':'auction')).map(r=><option key={r.id} value={r.id}>{r.name} · {r.status==='setup'?'준비':r.status==='running'?'진행 중':r.status==='paused'?'일시정지':'종료'}</option>)}</select></label>}{isAdmin && <button className="btn ghost" onClick={()=>setShowAdmin(v=>!v)}><SlidersHorizontal size={16}/> 관리자</button>}<button className="btn ghost" onClick={loadAll}><RefreshCw size={16}/></button><button className="btn ghost" onClick={logout}><LogOut size={16}/></button></div></header>
    <main className="main"><section className="navigation-area">
      <div className="navigation-heading"><div><span className="navigation-kicker">PLAYER SPACE</span><h3>일반 이용</h3></div><p>참가자 누구나 이용할 수 있는 기능</p></div>
      <nav className="feature-tabs public-feature-tabs" aria-label="일반 이용 기능">
        <button type="button" className={activeSection === 'dashboard' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('dashboard') }><Orbit size={17}/><span>통합 홈</span><small>운영 현황</small></button>
        <button type="button" className={activeSection === 'profiles' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('profiles')}><ContactRound size={17}/><span>선수 프로필</span><small>등급 · 전적 · 낙찰</small></button>
        <button type="button" className={activeSection === 'tournament' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('tournament') }><Crown size={17}/><span>대회 전적</span><small>경기 결과 · MVP</small></button>
        <button type="button" className={activeSection === 'bracket' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('bracket')}><Activity size={17}/><span>대진표·경기 현황</span><small>라운드 · 점수 · 진행 상태</small></button>
        <button type="button" className={activeSection === 'auction' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('auction')}><Zap size={17}/><span>경매 진행</span><small>입찰 · 낙찰</small></button>
        <button type="button" className={activeSection === 'balance' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('balance')}><ContactRound size={17}/><span>점수 팀배정</span><small>총점 균형 맞추기</small></button>
        <button type="button" className={activeSection === 'events' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('events') }><Gem size={17}/><span>관전 이벤트</span><small>승리 팀 · MVP 예측</small></button>
      </nav>
      {isAdmin && <div className="admin-navigation">
        <div className="navigation-heading admin-navigation-heading"><div><span className="navigation-kicker">ADMIN CONTROL</span><h3>관리자 전용</h3></div><p>운영 권한이 있는 계정에만 표시됩니다</p></div>
        <nav className="feature-tabs admin-feature-tabs" aria-label="관리자 전용 기능">
          <button type="button" className={activeSection === 'members' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('members') }><ContactRound size={17}/><span>멤버 관리</span><small>닉네임 · 계정</small></button>
          <button type="button" className={activeSection === 'announcements' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('announcements') }><Megaphone size={17}/><span>이벤트 공지</span><small>작성 · 관리</small></button>
          <button type="button" className={activeSection === 'tools' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('tools') }><History size={17}/><span>기록 · 백업</span><small>변경 이력 · 복구</small></button>
          <button type="button" className={activeSection === 'rooms' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('rooms') }><Plus size={17}/><span>방 관리</span><small>경매방 · 팀배정방</small></button>
          <button type="button" className={activeSection === 'ops' ? 'feature-tab active' : 'feature-tab'} onClick={() => navigateSection('ops') }><Activity size={17}/><span>운영 센터</span><small>진행 현황 · 사전 점검</small></button>
        </nav>
      </div>}
    </section>
    <section className="hero"><div><p className="eyebrow">BAEKYA COMMUNITY · SEASON 01</p><h2>{activeSection === 'ops' ? '대회 진행 통합 대시보드' : activeSection === 'dashboard' ? '일반 이용 기능' : activeSection === 'members' ? '멤버 관리' : activeSection === 'profiles' ? '선수 프로필' : activeSection === 'bracket' ? '대진표 · 실시간 경기 현황' : activeSection === 'tournament' ? '대회 전적 관리' : activeSection === 'announcements' ? '이벤트 공지 관리' : activeSection === 'tools' ? '변경 기록 · 데이터 백업' : activeSection === 'rooms' ? '방 관리' : activeSection === 'auction' ? '선수 영입 경매' : activeSection === 'balance' ? '점수 기반 팀 배정' : '관전 이벤트'}</h2><p className="muted">{activeSection === 'ops' ? '방별 진행 상황과 운영 전 점검 항목을 확인합니다.' : activeSection === 'dashboard' ? '참가자 누구나 이용할 수 있는 기능을 선택하세요.' : activeSection === 'members' ? '현재 경매방의 선수 닉네임과 디스코드 가입 계정을 관리합니다.' : activeSection === 'profiles' ? '선수 등급, 소속 팀, 낙찰가와 대회 MVP 기록을 확인합니다.' : activeSection === 'bracket' ? '참가 팀 대진표를 만들고 경기 상태와 점수를 실시간으로 관리합니다.' : activeSection === 'tournament' ? '대회별 경기 결과, 팀 순위, 승패와 MVP 기록을 관리합니다.' : activeSection === 'announcements' ? '이벤트 공지를 작성하고 방별로 관리합니다.' : activeSection === 'tools' ? '팀장·선수·설정 변경 이력을 확인하고 방별 백업과 복구를 관리합니다.' : activeSection === 'rooms' ? '선수 경매방과 점수 팀배정방을 각각 생성하고 관리합니다.' : activeSection === 'auction' ? '팀장들이 포인트를 걸고 선수를 영입합니다.' : activeSection === 'balance' ? '선수별 점수를 입력하고 팀별 총점이 비슷하도록 자동 배정합니다.' : '승리 팀과 MVP를 예측하고 이벤트 포인트를 획득하세요.'}</p></div><div className={`status ${room?.status==='running'?'live':''}`}>● {room?.status==='running'?'경매 진행 중':room?.status==='paused'?'일시정지':room?.status==='finished'?'경매 종료':'준비 중'}</div></section>
    
    {celebration && <div className="auction-celebration" role="status" aria-live="polite"><div className="celebration-orb"><Crown size={34}/></div><p>BAEKYA AUCTION</p><h2>낙찰 완료</h2><span>우리 팀의 새로운 선수가 합류했습니다</span><div className="celebration-stars" aria-hidden="true">✦　✧　✦　✧　✦</div></div>}
    <section className="room-selection-panel panel">
      <div className="panelhead"><div><p className="eyebrow">BAEKYA ROOM SELECT</p><h3>참여할 방 선택</h3><p className="tiny">방을 선택하면 해당 방의 경매 또는 팀배정 화면으로 이동합니다.</p></div><span className="pill">{rooms.length}개 방</span></div>
      <div className="room-selection-groups">
        <div className="room-selection-group"><div className="room-selection-title"><Zap size={16}/><strong>선수 경매방</strong><span>{rooms.filter(r=>r.room_type==='auction').length}개</span></div>
          {rooms.filter(r=>r.room_type==='auction').length ? <div className="room-selection-list">{rooms.filter(r=>r.room_type==='auction').map(r=><button type="button" key={r.id} className={'room-selection-card ' + (roomId===r.id?'selected':'')} onClick={()=>navigateSection('auction',r.id)}><span className="room-selection-card-icon"><Zap size={18}/></span><span className="room-selection-card-info"><strong>{r.name}</strong><small>{new Date(r.created_at).toLocaleDateString('ko-KR')} 생성</small></span><span className={'room-selection-status '+(r.status==='running'?'running':'')}>{r.status==='setup'?'준비':r.status==='running'?'진행 중':r.status==='paused'?'일시정지':'종료'}</span></button>)}</div> : <div className="room-selection-empty">아직 생성된 경매방이 없습니다.</div>}
        </div>
        <div className="room-selection-group"><div className="room-selection-title"><ContactRound size={16}/><strong>점수 팀배정방</strong><span>{rooms.filter(r=>r.room_type==='balance').length}개</span></div>
          {rooms.filter(r=>r.room_type==='balance').length ? <div className="room-selection-list">{rooms.filter(r=>r.room_type==='balance').map(r=><button type="button" key={r.id} className={'room-selection-card ' + (roomId===r.id?'selected':'')} onClick={()=>navigateSection('balance',r.id)}><span className="room-selection-card-icon"><ContactRound size={18}/></span><span className="room-selection-card-info"><strong>{r.name}</strong><small>{new Date(r.created_at).toLocaleDateString('ko-KR')} 생성</small></span><span className={'room-selection-status '+(r.status==='running'?'running':'')}>{r.status==='setup'?'준비':r.status==='running'?'진행 중':r.status==='paused'?'일시정지':'종료'}</span></button>)}</div> : <div className="room-selection-empty">아직 생성된 팀배정방이 없습니다.</div>}
        </div>
      </div>
    </section>
    <section className="stats"><Stat icon={<ContactRound/>} label="참가자" value={`${players.length}명`} sub="팀장 포함"/><Stat icon={<Zap/>} label="경매 대기" value={`${activePlayers.length}명`} sub="팀장 제외"/><Stat icon={<Gem/>} label="전체 예산" value={`${teams.reduce((n,t)=>n+t.budget,0)}P`} sub="팀별 초기 30P"/><Stat icon={<History/>} label="낙찰 완료" value={`${history.length}명`} sub="기록 저장 중"/></section>
    <div id="section-workspace" className="section-workspace" style={{scrollMarginTop:'20px'}}>{activeSection === 'rooms' && isAdmin && <section className="room-management"><div className="panel"><div className="panelhead"><div><h3>{newRoomType === 'balance' ? '새 점수 팀배정방 만들기' : '새 선수 경매방 만들기'}</h3><p className="tiny">경매와 점수 팀배정 방은 각각 독립적으로 생성됩니다.</p></div><span className="pill">{rooms.length}개 방</span></div><form onSubmit={createRoom} className="adminform"><label className="field">방 종류<select value={newRoomType} onChange={e=>setNewRoomType(e.target.value)}><option value="auction">선수 경매방</option><option value="balance">점수 팀배정방</option></select></label><label className="field">방 이름<input value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} placeholder="예: 백야 롤 내전 2회차" maxLength={60} required /></label><label className="field">팀별 예산 (P)<input type="number" min="1" max="500" value={newRoomBudget} onChange={e=>setNewRoomBudget(e.target.value)} required /></label><label className="field">팀당 인원<input type="number" min="2" max="10" value={newRoomTeamSize} onChange={e=>setNewRoomTeamSize(e.target.value)} required /></label><label className="field">팀 수<input type="number" min="2" max="10" value={newRoomTeamCount} onChange={e=>setNewRoomTeamCount(e.target.value)} required /></label><button className="btn primary" disabled={busy}><Plus size={16}/> {newRoomType === 'balance' ? '점수 팀배정방 생성' : '선수 경매방 생성'}</button></form><p className="tiny">{newRoomType === 'balance' ? '점수 팀배정 전용 방이 생성됩니다. 선수 경매 기록과는 분리됩니다.' : '선수 경매 전용 방이 생성됩니다. 점수 팀배정 기록과는 분리됩니다.'} 설정한 팀 수만큼 팀이 자동 생성됩니다.</p></div><div className="panel"><div className="panelhead"><h3>방 목록</h3><span className="pill">{rooms.length}개</span></div>{rooms.length ? <div className="playerlist">{rooms.map(r=><div className="playerrow" key={r.id}><div className="grow"><strong><span className="pill">{r.room_type === 'balance' ? '점수 팀배정' : '선수 경매'}</span></strong><label className="field room-name-edit"><span className="tiny">방 이름</span><input value={roomNameInputs[r.id] ?? r.name} onChange={e=>setRoomNameInputs(prev=>({...prev,[r.id]:e.target.value}))} maxLength={60} aria-label={r.name + ' 방 이름 수정'} /></label><small>{new Date(r.created_at).toLocaleDateString('ko-KR')} 생성 · {r.status==='setup'?'준비':r.status==='running'?'진행 중':r.status==='paused'?'일시정지':'종료'}</small></div><button type="button" className="btn ghost" disabled={busy} onClick={()=>saveRoomName(r)}>이름 저장</button>{r.id===roomId ? <span className="pill">현재 선택</span> : <button type="button" className="btn ghost" disabled={busy} onClick={()=>{setRoomId(r.id);setActiveSection(r.room_type === 'balance' ? 'balance' : 'auction');setError('');setNotice('');}}>방 열기</button>}{r.status==='finished' && <button type="button" className="btn danger" disabled={busy} onClick={()=>deleteRoom(r)}>삭제</button>}</div>)}</div> : <div className="empty">아직 생성된 경매방이 없습니다.</div>}</div></section>}{activeSection === 'ops' && isAdmin && <OperationsCenter room={room} rooms={rooms} teams={teams} players={players} history={history} profiles={profiles} onNavigate={(section, targetRoomId) => navigateSection(section, targetRoomId)} />}{activeSection === 'dashboard' && <PublicDashboard room={room} rooms={rooms} teams={teams} players={players} history={history} onNavigate={navigateSection} />}{activeSection === 'members' && isAdmin && <MemberManagement players={players} allPlayers={allPlayers} profiles={profiles} teams={teams} nicknameInputs={nicknameInputs} setNicknameInputs={setNicknameInputs} saveNickname={saveNickname} saveGrade={saveGrade} saveGlobalGrade={saveGlobalGrade} unsetCaptain={unsetCaptain} busy={busy} room={room} />}{activeSection === 'profiles' && <PlayerProfiles supabase={supabase} roomId={roomId} room={room} players={players} teams={teams} history={history} isAdmin={isAdmin} onRefresh={loadAll} />}{activeSection === 'tournament' && <AdminRecords supabase={supabase} roomId={roomId} room={room} session={session} mode="tournament" readOnly={!isAdmin} />}{activeSection === 'bracket' && <TournamentBracket supabase={supabase} roomId={roomId} room={room} isAdmin={isAdmin} />}{activeSection === 'announcements' && isAdmin && <AdminRecords supabase={supabase} roomId={roomId} room={room} session={session} mode="events" />}{activeSection === 'tools' && isAdmin && <RoomTools supabase={supabase} roomId={roomId} room={room} isAdmin={isAdmin} />}{activeSection === 'events' && <SpectatorEvents supabase={supabase} roomId={roomId} teams={teams} players={players} session={session} profile={profile} isAdmin={isAdmin} onRefresh={loadAll} />}
    {activeSection === 'balance' && <TeamBalance supabase={supabase} roomId={roomId} room={room} teams={teams} players={players} history={history} isAdmin={isAdmin} onRefresh={loadAll} />}
    {error && <div className="alert"><CircleAlert size={17}/>{error}</div>}{notice && <div className="success">{notice}</div>}
    {activeSection === 'auction' && <>
    <section className="auction-progress-panel">
      <div className="panelhead"><div><h3>경매 진행 현황</h3><p className="tiny">선수별 진행 상태와 전체 처리율</p></div><span className="pill">{room?.status === 'running' ? 'LIVE' : room?.status === 'paused' ? 'PAUSED' : room?.status === 'finished' ? 'FINISHED' : 'READY'}</span></div>
      <div className="auction-progress-metrics">
        <div><small>전체 선수</small><strong>{players.filter(p => !p.is_captain).length}명</strong></div>
        <div><small>낙찰 완료</small><strong>{players.filter(p => !p.is_captain && p.status === 'sold').length}명</strong></div>
        <div><small>경매 대기</small><strong>{players.filter(p => !p.is_captain && p.status === 'available').length}명</strong></div>
        <div><small>유찰</small><strong>{players.filter(p => !p.is_captain && p.status === 'passed').length}명</strong></div>
      </div>
      <div className="auction-progress-track"><span style={{width: (players.filter(p => !p.is_captain && ['sold','passed'].includes(p.status)).length / Math.max(1, players.filter(p => !p.is_captain).length) * 100) + '%'}} /></div>
      <div className="auction-progress-foot"><span>{players.filter(p => !p.is_captain && ['sold','passed'].includes(p.status)).length} / {players.filter(p => !p.is_captain).length}명 처리 완료</span><strong>{Math.round(players.filter(p => !p.is_captain && ['sold','passed'].includes(p.status)).length / Math.max(1, players.filter(p => !p.is_captain).length) * 100)}%</strong></div>
    </section>
    <section className="auction-insights"><div className="stat"><small>총 낙찰</small><strong>{auctionStats?.total_sold ?? history.length}명</strong><span>현재 경매방</span></div><div className="stat"><small>평균 낙찰가</small><strong>{auctionStats?.average_price ?? (history.length ? (history.reduce((s,h)=>s+Number(h.price||0),0)/history.length).toFixed(1) : '0')}P</strong><span>전체 선수 기준</span></div><div className="stat"><small>최고 낙찰가</small><strong>{auctionStats?.highest_price ?? (history.length ? Math.max(...history.map(h=>Number(h.price||0))) : 0)}P</strong><span>{auctionStats?.highest_player || (history.length ? [...history].sort((a,b)=>Number(b.price)-Number(a.price))[0]?.player_name : '기록 없음')}</span></div><div className="stat"><small>총 사용 포인트</small><strong>{auctionStats?.total_spent ?? history.reduce((s,h)=>s+Number(h.price||0),0)}P</strong><span>모든 팀 합계</span></div></section>
    <div className="columns"><section className="panel"><div className="panelhead"><h3>현재 경매</h3><span className="pill">최대 +5P 입찰</span></div>{currentPlayer ? <div className={`auction auction-live ${auctionSecondsLeft <= 5 ? 'auction-ending' : ''}`}><div className="auction-ambient" aria-hidden="true"/><div className="playerhead"><div className={`avatar ${currentPlayer.grade}`}>{currentPlayer.grade}</div><div><h2>{currentPlayer.name}</h2><p>{currentPlayer.grade}급 선수 · 시작가 {currentPlayer.start_price}P</p></div></div><div className="price"><div><small>현재 최고 입찰가</small><strong>{currentPrice}P</strong></div><div className="highest">{highestBid ? `${teams.find(t=>t.id===highestBid.team_id)?.name || '팀'} 최고 입찰`:'아직 입찰 없음'}</div></div><div className="price"><div><small>{highestBid ? '추가 입찰 대기' : '남은 경매 시간'}</small><strong className={auctionSecondsLeft <= 5 ? 'auction-countdown urgent' : 'auction-countdown'}>{auctionSecondsLeft}<small>초</small></strong></div><div className="highest">{highestBid ? '5초 동안 추가 입찰이 없으면 자동 낙찰' : '40초 안에 입찰이 없으면 유찰'}</div></div><div className="bid-controls"><label className="field">입찰 상승 폭<select value={bidIncrement} onChange={e=>setBidIncrement(Number(e.target.value))} disabled={busy||room?.status!=='running'||!currentPlayer||highestBid?.team_id===myTeam?.id}>{[1,2,3,4,5].map(n=><option key={n} value={n}>+{n}P</option>)}</select></label><div className="bid-next"><small>이번 입찰 금액</small><strong>{highestBid ? highestBid.amount + bidIncrement : currentPlayer.start_price}P</strong></div></div><button className="btn primary full" disabled={busy||room?.status!=='running'||!myTeam||myTeam.roster_count>=Number(room?.team_size||5)||(highestBid?.team_id===myTeam?.id)||myTeam?.budget<(highestBid?highestBid.amount+bidIncrement:currentPlayer.start_price)||myTeam?.budget-(highestBid?highestBid.amount+bidIncrement:currentPlayer.start_price)<Math.max(0, Number(room?.team_size||5)-Number(myTeam?.roster_count||0)-1)} onClick={()=>action('place_bid',{p_room_id:roomId,p_team_id:myTeam?.id,p_expected_amount:highestBid ? highestBid.amount + bidIncrement : currentPlayer.start_price,p_bid_increment:bidIncrement})}>{myTeam?`${myTeam.name} · ${highestBid?.team_id===myTeam.id?'최고 입찰 중':` ${highestBid ? highestBid.amount + bidIncrement : currentPlayer.start_price}P 입찰하기`}`:'팀장 계정으로 지정되지 않았습니다'}</button><p className="tiny">첫 입찰은 선수 시작가로 진행되고, 이후에는 +1~+5P 중 선택한 금액만큼 올려 입찰합니다.</p>{isAdmin && <button className="btn ghost full" disabled={busy||!highestBid} onClick={()=>action('award_current_player',{p_room_id:roomId})}><BadgeCheck size={17}/> 최고 입찰 팀에 낙찰 확정</button>}{isAdmin && <button className="btn danger full" disabled={busy||history.length===0} onClick={()=>{if(window.confirm('가장 최근 낙찰을 되돌리고 해당 선수를 재경매할까요? 팀 예산과 낙찰 기록이 복구됩니다.'))action('undo_last_auction',{p_room_id:roomId});}}>↶ 직전 낙찰 되돌리기</button>}</div> : <div className="empty"><Zap size={30}/><h3>현재 경매 선수가 없습니다.</h3><p>관리자가 경매를 시작하고 선수를 선택하면 여기에 표시됩니다.</p></div>}
    {isAdmin && <div className="admin-tools"><div className="panelhead"><h3>경매 관리</h3><span className="pill">관리자 전용</span></div><div className="buttonrow"><button className="btn primary" disabled={busy} onClick={()=>action('set_auction_status',{p_room_id:roomId,p_status:'running'})}><Play size={16}/> 시작</button><button className="btn ghost" disabled={busy} onClick={()=>action('set_auction_status',{p_room_id:roomId,p_status:'paused'})}><Pause size={16}/> 일시정지</button><button className="btn ghost" disabled={busy} onClick={()=>action('set_auction_status',{p_room_id:roomId,p_status:'finished'})}>종료</button></div><label className="field">다음 경매 선수<select id="nextPlayer" defaultValue=""><option value="" disabled>선수 선택</option>{activePlayers.map(p=><option key={p.id} value={p.id}>{p.name} · {p.grade}급 · {p.start_price}P</option>)}</select></label><button className="btn primary full" disabled={busy} onClick={()=>{const id=document.getElementById('nextPlayer')?.value;if(id)action('select_auction_player',{p_room_id:roomId,p_player_id:id});}}>선수 경매 시작</button><button className="btn ghost full" disabled={busy || !isAdmin || activePlayers.length===0 || room?.status==='finished'} onClick={()=>{const pool=players.filter(p=>!p.is_captain&&p.status==='available');if(!pool.length){setError('무작위로 선택할 경매 대기 선수가 없습니다.');return;}const picked=pool[Math.floor(Math.random()*pool.length)];if(window.confirm('등급과 관계없이 「'+picked.name+'」 선수를 다음 경매 선수로 무작위 선택할까요?')) action('select_auction_player',{p_room_id:roomId,p_player_id:picked.id});}}><RefreshCw size={16}/> 다음 선수 무작위 선택</button><p className="tiny">등급은 고려하지 않고 경매 대기 선수 중 한 명을 무작위로 선택합니다. 선수의 등급과 시작가는 변경되지 않습니다.</p></div>}
    </section><aside className="panel"><div className="panelhead"><h3>팀별 예산 & 명단</h3><span className="pill">{room?.budget_per_team ?? 30}P / 팀</span></div><div className="teams">{teams.map((t,i)=><div className="team" key={t.id} style={{'--team': ['#a69aff','#70a9ff','#e5a1ff'][i%3]}}><div className="teamtop"><strong><i/> {t.name}</strong><span className="money">{t.budget}P</span></div><div className="subrow"><span>사용 {Math.max(0, Number(room?.budget_per_team ?? 30)-Number(t.budget))}P</span><span>{t.roster_count}/{room?.team_size || 5}명</span></div><div className="bar"><span style={{width:`${Math.min(100,(Number(room?.budget_per_team ?? 30)-Number(t.budget))/Math.max(1,Number(room?.budget_per_team ?? 30))*100)}%`}}/></div><p className="captain">팀장: {t.captain_name || '미지정'}</p><div className="roster-capacity"><span>팀 구성 현황</span><strong>{t.roster_count}/{room?.team_size || 5}명</strong><span>{Number(t.roster_count) >= Number(room?.team_size || 5) ? '정원 완료' : '추가 영입 가능'}</span></div><div className="team-roster-cards">{players.filter(p=>p.team_id===t.id||p.captain_team_id===t.id).map(p=><div className="roster-card" key={p.id}><span className={"grade "+(p.is_captain?"TL":p.grade)}>{p.is_captain?"TL":p.grade}</span><div><strong>{p.name}</strong><small>{p.is_captain?"팀장":p.status==="sold"?"낙찰 선수":p.status==="auctioning"?"경매 중":"등록 선수"}</small></div><b>{p.is_captain?"CAPTAIN":p.sold_price!=null?p.sold_price+"P":"—"}</b></div>)}</div></div>)}</div></aside></div>
    <DiscordTeamResults supabase={supabase} room={room} teams={teams} players={players} isAdmin={isAdmin} />
    <div className="columns lower"><section className="panel"><div className="panelhead"><h3>경매 대기 선수</h3><span className="pill">{activePlayers.length}명</span></div>{activePlayers.length ? <div className="playerlist">{activePlayers.map(p=><div className="playerrow" key={p.id}><div className={`grade ${p.grade}`}>{p.grade}</div><div className="grow"><strong>{p.name}</strong><small>시작가 {p.start_price}P</small></div>{isAdmin && <button className="btn ghost" onClick={()=>action('select_auction_player',{p_room_id:roomId,p_player_id:p.id})}>경매 선택</button>}</div>)}</div>:<div className="empty">대기 중인 선수가 없습니다.</div>}</section><section className="panel"><div className="panelhead"><h3>낙찰 기록</h3><span className="pill">{history.length}건</span></div>{history.length?<div className="playerlist">{history.map(h=><div className="playerrow" key={h.id}><div className={`grade ${h.grade}`}>{h.grade}</div><div className="grow"><strong>{h.player_name} → {h.team_name}</strong><small>{new Date(h.created_at).toLocaleString('ko-KR')}</small></div><strong className="winning">{h.price}P</strong></div>)}</div>:<div className="empty">아직 낙찰 기록이 없습니다.</div>}</section></div>
    {isAdmin && showAdmin && <div className="panel admin-panel"><div className="panelhead"><h3>관리자 설정</h3><button className="btn ghost" onClick={()=>setShowAdmin(false)}>닫기</button></div><div className="settings-section"><div className="panelhead"><h3>방 생성 및 관리</h3><span className="pill">{rooms.length}개 방</span></div><form onSubmit={createRoom} className="adminform"><label className="field">방 종류<select value={newRoomType} onChange={e=>setNewRoomType(e.target.value)}><option value="auction">선수 경매방</option><option value="balance">점수 팀배정방</option></select></label><label className="field">새 방 이름<input value={newRoomName} onChange={e=>setNewRoomName(e.target.value)} placeholder="예: 백야 롤 내전 2회차" maxLength={60} required /></label><label className="field">팀별 예산 (P)<input type="number" min="1" max="500" value={newRoomBudget} onChange={e=>setNewRoomBudget(e.target.value)} required /></label><label className="field">팀당 인원<input type="number" min="2" max="10" value={newRoomTeamSize} onChange={e=>setNewRoomTeamSize(e.target.value)} required /></label><label className="field">팀 수<input type="number" min="2" max="10" value={newRoomTeamCount} onChange={e=>setNewRoomTeamCount(e.target.value)} required /></label><button className="btn primary" disabled={busy}><Plus size={16}/> {newRoomType === 'balance' ? '새 점수 팀배정방 만들기' : '새 선수 경매방 만들기'}</button></form><p className="tiny">새 방은 준비 상태로 생성되며 설정한 팀 수만큼 팀이 자동으로 만들어집니다.</p><div className="settings-section"><div className="panelhead"><h3>종료된 경매방 삭제</h3><span className="pill">{rooms.filter(r=>r.status==='finished').length}개</span></div><p className="tiny">삭제하면 해당 방의 선수·팀·입찰·낙찰 기록도 모두 영구 삭제됩니다. 삭제 전 확인창이 표시됩니다.</p>{rooms.filter(r=>r.status==='finished').length ? <div className="playerlist">{rooms.filter(r=>r.status==='finished').map(r=><div className="playerrow" key={r.id}><div className="grow"><strong>{r.name}</strong><small>상태: 종료 · {new Date(r.created_at).toLocaleDateString('ko-KR')} 생성</small></div><button type="button" className="btn danger" disabled={busy} onClick={()=>deleteRoom(r)}>삭제</button></div>)}</div> : <div className="empty">삭제할 종료된 경매방이 없습니다.</div>}</div></div><p className="tiny">선수는 Discord 로그인으로 자동 등록됩니다. 수동 선수 등록은 비활성화되었습니다.</p><form onSubmit={assignCaptain} className="adminform"><label className="field">팀 선택<select value={captainTeamId} onChange={e=>setCaptainTeamId(e.target.value)} required><option value="">팀 선택</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name} · {t.captain_name||'팀장 미지정'}</option>)}</select></label><label className="field">디스코드 사용자<select value={captainUserId} onChange={e=>setCaptainUserId(e.target.value)} required><option value="">로그인한 사용자 선택</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.discord_username||p.id} · {p.role}</option>)}</select></label><button className="btn primary" disabled={busy}>팀장 지정</button></form><div className="settings-section"><div className="panelhead"><h3>팀 수 설정</h3><span className="pill">{teams.length}개 팀</span></div><p className="tiny">팀 수는 준비 상태이고 선수 배정·입찰·낙찰 기록이 없을 때만 변경할 수 있습니다.</p><label className="field">팀 수<select value={String(teams.length)} disabled={busy || room?.status!=='setup'} onChange={e=>{const count=Number(e.target.value);if(count===teams.length)return;if(window.confirm('팀 수를 '+count+'개로 변경할까요? 팀장 지정이나 선수 배정이 이미 있으면 변경할 수 없습니다.'))action('set_auction_team_count',{p_room_id:roomId,p_team_count:count});}}>{Array.from({length:9},(_,i)=>i+2).map(n=><option key={n} value={n}>{n}개 팀</option>)}</select></label></div><div className="settings-section"><div className="panelhead"><h3>팀 예산 · 등급별 시작가</h3><span className="pill">{room?.status === 'setup' ? '수정 가능' : '경매 설정 잠김'}</span></div>{room?.status !== 'setup' && <p className="tiny">현재 방은 준비 상태가 아니므로 기존 경매 기록 보호를 위해 예산과 시작가를 잠갔습니다. 새 경매 방을 준비 상태로 만들면 수정할 수 있습니다.</p>}<form onSubmit={saveSlidersHorizontal}><div className="settings-grid">{teams.map(t=><label className="field" key={t.id}>{t.name} 초기 예산 (P)<input type="number" min="0" max="500" value={budgetInputs[t.id] ?? ''} disabled={busy || room?.status !== 'setup'} onChange={e=>setBudgetInputs(v=>({...v,[t.id]:e.target.value}))} required /></label>)}</div><div className="settings-grid">{Object.keys(PRICE).map(g=><label className="field" key={g}>{g}급 시작가 (P)<input type="number" min="1" max="100" value={gradePrices[g] ?? PRICE[g]} disabled={busy || room?.status !== 'setup'} onChange={e=>setGradePrices(v=>({...v,[g]:e.target.value}))} required /></label>)}</div><button className="btn primary" disabled={busy || room?.status !== 'setup'}>예산·시작가 저장</button></form></div><div className="settings-section"><div className="panelhead"><h3>선수 닉네임 수정</h3><span className="pill">{players.length}명</span></div><div className="nickname-list">{players.map(p=><div className="nickname-editor" key={p.id}><span className={'grade ' + (p.is_captain ? 'TL' : p.grade)}>{p.is_captain ? 'TL' : p.grade}</span><input aria-label={p.name + ' 닉네임'} value={nicknameInputs[p.id] ?? p.name} onChange={e=>setNicknameInputs(v=>({...v,[p.id]:e.target.value}))} disabled={busy}/><button type="button" className="btn ghost" disabled={busy || !(nicknameInputs[p.id] || '').trim() || (nicknameInputs[p.id] || '').trim()===p.name} onClick={()=>saveNickname(p)}>저장</button><button type="button" className="btn danger" disabled={busy} onClick={()=>{if(window.confirm('「'+p.name+'」 선수를 삭제할까요? 입찰·낙찰 기록이 있는 선수는 삭제할 수 없습니다.')) action('delete_auction_player',{p_room_id:roomId,p_player_id:p.id});}}>삭제</button></div>)}</div></div><p className="tiny">중요: 관리자 권한은 profiles.role='admin'인 계정에만 부여됩니다. 처음 관리자는 Supabase SQL Editor에서 직접 지정하세요.</p></div>}
    </>}
    </div><footer>BAEKYA AUCTION · 실시간 데이터는 Supabase에서 동기화됩니다.</footer></main></div>;
}

function PublicDashboard({ room, rooms, teams, players, history, onNavigate }) {
  const sold = players.filter(p => p.status === 'sold').length;
  const waiting = players.filter(p => !p.is_captain && p.status === 'available').length;
  return <section className="admin-dashboard public-dashboard">
    <div className="dashboard-welcome panel">
      <div><p className="eyebrow">BAEKYA COMMUNITY · PLAYER HUB</p><h3>일반 이용 기능</h3><p className="muted">선수 프로필, 대회 전적, 대진표, 경매와 관전 이벤트를 이용할 수 있습니다.</p></div>
      <span className={'status ' + (room?.status === 'running' ? 'live' : '')}>{room?.status === 'running' ? '● 진행 중' : room?.status === 'paused' ? '● 일시정지' : room?.status === 'finished' ? '● 종료' : '● 준비 중'}</span>
    </div>
    <div className="dashboard-metrics">
      <div className="stat"><div className="stat-icon"><ContactRound/></div><small>현재 방 참가자</small><strong>{players.length}명</strong><span>팀장 포함</span></div>
      <div className="stat"><div className="stat-icon"><Zap/></div><small>경매 대기</small><strong>{waiting}명</strong><span>영입 대기 선수</span></div>
      <div className="stat"><div className="stat-icon"><BadgeCheck/></div><small>낙찰 완료</small><strong>{sold}명</strong><span>현재 방 기준</span></div>
      <div className="stat"><div className="stat-icon"><Crown/></div><small>구성된 팀</small><strong>{teams.length}팀</strong><span>현재 방 기준</span></div>
    </div>
    <div className="dashboard-grid">
      <button type="button" className="dashboard-action panel" onClick={() => onNavigate('auction')}><Zap/><strong>선수 경매</strong><span>실시간 입찰과 팀별 낙찰 현황</span></button>
      <button type="button" className="dashboard-action panel" onClick={() => onNavigate('balance')}><ContactRound/><strong>점수 팀배정</strong><span>선수 점수 확인 및 균형 팀 구성</span></button>
      <button type="button" className="dashboard-action panel" onClick={() => onNavigate('events')}><Gem/><strong>관전 이벤트</strong><span>승리 팀과 MVP를 예측하고 참여</span></button>
    </div>
    <div className="panel dashboard-recent">
      <div className="panelhead"><h3>최근 낙찰 기록</h3><button type="button" className="btn ghost" onClick={() => onNavigate('auction')}>경매 현황 보기</button></div>
      {history.length ? <div className="playerlist">{history.slice(0,4).map(h=><div className="playerrow" key={h.id}><div className={'grade ' + (h.grade || 'B')}>{h.grade || '—'}</div><div className="grow"><strong>{h.player_name} → {h.team_name}</strong><small>{new Date(h.created_at).toLocaleString('ko-KR')}</small></div><strong className="winning">{h.price}P</strong></div>)}</div> : <div className="empty">아직 낙찰 기록이 없습니다.</div>}
    </div>
    <div className="panel dashboard-recent">
      <div className="panelhead"><h3>현재 팀 구성</h3><span className="pill">{teams.length}개 팀</span></div>
      {teams.length ? <div className="teams">{teams.map((team,i)=><div className="team" key={team.id} style={{'--team':['#a69aff','#70a9ff','#e5a1ff'][i%3]}}><div className="teamtop"><strong><i/> {team.name}</strong><span className="pill">{players.filter(p=>p.team_id===team.id||p.captain_team_id===team.id).length}명</span></div><p className="captain">팀장: {team.captain_name || '미지정'}</p><div className="chips">{players.filter(p=>p.team_id===team.id||p.captain_team_id===team.id).map(p=><span key={p.id}>{p.name}{p.is_captain ? ' · 팀장' : p.sold_price != null ? ' · ' + p.sold_price + 'P' : ''}</span>)}</div></div>)}</div> : <div className="empty">아직 팀이 구성되지 않았습니다.</div>}
    </div>
  </section>;
}

function AdminDashboard({ room, rooms, teams, players, profiles, history, activePlayers, onNavigate }) {
  const sold = players.filter(p => p.status === 'sold').length;
  const finishedRooms = rooms.filter(r => r.status === 'finished').length;
  return <section className="admin-dashboard">
    <div className="dashboard-welcome panel">
      <div><p className="eyebrow">BAEKYA ADMIN CENTER</p><h3>백야 운영 현황</h3><p className="muted">현재 선택한 방: <strong>{room?.name || '선택된 방 없음'}</strong></p></div>
      <span className={'status ' + (room?.status === 'running' ? 'live' : '')}>{room?.status === 'running' ? '● 진행 중' : room?.status === 'paused' ? '● 일시정지' : room?.status === 'finished' ? '● 종료' : '● 준비 중'}</span>
    </div>
    <div className="dashboard-metrics">
      <div className="stat"><div className="stat-icon"><ContactRound/></div><small>현재 방 참가자</small><strong>{players.length}명</strong><span>팀장 포함</span></div>
      <div className="stat"><div className="stat-icon"><Zap/></div><small>경매 대기</small><strong>{activePlayers.length}명</strong><span>선수 선택 가능</span></div>
      <div className="stat"><div className="stat-icon"><BadgeCheck/></div><small>낙찰 완료</small><strong>{sold}명</strong><span>현재 방 기준</span></div>
      <div className="stat"><div className="stat-icon"><Shield/></div><small>등록 계정</small><strong>{profiles.length}명</strong><span>Discord 로그인 계정</span></div>
    </div>
    <div className="dashboard-grid">
      <button type="button" className="dashboard-action panel" onClick={() => onNavigate('auction')}><Zap/><strong>경매 관리</strong><span>경매 시작·일시정지·낙찰 기록</span></button>
      <button type="button" className="dashboard-action panel" onClick={() => onNavigate('members')}><ContactRound/><strong>멤버 관리</strong><span>닉네임과 등록 계정 확인</span></button>
      <button type="button" className="dashboard-action panel" onClick={() => onNavigate('balance')}><RefreshCw/><strong>팀 배정</strong><span>점수 기반 균형 팀 구성</span></button>
      <button type="button" className="dashboard-action panel" onClick={() => onNavigate('events')}><Gem/><strong>관전 이벤트</strong><span>예측 이벤트와 포인트 결과</span></button>
    </div>
    <div className="panel dashboard-recent"><div className="panelhead"><h3>최근 낙찰 기록</h3><button type="button" className="btn ghost" onClick={() => onNavigate('auction')}>전체 기록 보기</button></div>{history.length ? <div className="playerlist">{history.slice(0,5).map(h=><div className="playerrow" key={h.id}><div className={'grade ' + (h.grade || 'B')}>{h.grade || '—'}</div><div className="grow"><strong>{h.player_name} → {h.team_name}</strong><small>{new Date(h.created_at).toLocaleString('ko-KR')}</small></div><strong className="winning">{h.price}P</strong></div>)}</div> : <div className="empty">아직 낙찰 기록이 없습니다.</div>}</div>
    <div className="panel dashboard-recent"><div className="panelhead"><h3>경매방 현황</h3><span className="pill">{rooms.length}개 방 · 종료 {finishedRooms}개</span></div><div className="playerlist">{rooms.map(r=><div className="playerrow" key={r.id}><div className="grow"><strong>{r.name}</strong><small>{new Date(r.created_at).toLocaleDateString('ko-KR')} 생성</small></div><span className="pill">{r.status === 'setup' ? '준비' : r.status === 'running' ? '진행 중' : r.status === 'paused' ? '일시정지' : '종료'}</span></div>)}</div></div>
  </section>;
}
function MemberManagement({ players, allPlayers, profiles, teams, nicknameInputs, setNicknameInputs, saveNickname, saveGrade, saveGlobalGrade, unsetCaptain, busy, room }) {
  return <section className="member-management">
    <div className="panel"><div className="panelhead"><div><h3>통합 선수 닉네임 관리</h3><p className="tiny">Discord 계정이 연결된 선수는 모든 방의 닉네임이 함께 변경됩니다. · 현재 방 {players.length}명 표시</p></div></div>
      <div className="nickname-list">{players.length ? players.map(p=><div className="nickname-editor" key={p.id}><span className={'grade ' + (p.is_captain ? 'TL' : p.grade)}>{p.is_captain ? 'TL' : p.grade}</span><input aria-label={p.name + ' 닉네임'} value={nicknameInputs[p.id] ?? p.name} onChange={e=>setNicknameInputs(v=>({...v,[p.id]:e.target.value}))} disabled={busy}/><button type="button" className="btn primary" disabled={busy || !(nicknameInputs[p.id] || '').trim() || (nicknameInputs[p.id] || '').trim()===p.name} onClick={()=>saveNickname(p)}>닉네임 저장</button>{!p.is_captain && <label className="member-grade-control"><span className="tiny">등급</span><select aria-label={p.name + ' 등급'} value={p.grade} disabled={busy} onChange={e=>saveGrade(p,e.target.value)}>{['S','A','B','C','D'].map(g=><option key={g} value={g}>{g}급</option>)}</select></label>}</div>) : <div className="empty">현재 방에 등록된 선수가 없습니다.</div>}</div>
    </div>
    <div className="panel"><div className="panelhead"><div><h3>팀장 지정 관리</h3><p className="tiny">팀장 지정을 해제하면 해당 팀은 팀장 미지정 상태가 됩니다.</p></div></div><div className="playerlist">{teams.map(t=><div className="playerrow" key={t.id}><div className="grow"><strong>{t.name}</strong><small>팀장: {t.captain_name || '미지정'}</small></div>{t.captain_user_id ? <button type="button" className="btn danger" disabled={busy} onClick={()=>unsetCaptain(t)}>팀장 해제</button> : <span className="pill">미지정</span>}</div>)}</div></div>
    <div className="panel member-accounts"><div className="panelhead"><div><h3>Discord 로그인 계정</h3><p className="tiny">사이트에 로그인한 계정 목록입니다. 계정 권한은 관리자 설정에서 별도 관리됩니다.</p></div><span className="pill">{profiles.length}개 계정</span></div>
      {profiles.length ? <div className="playerlist">{profiles.map(p=><div className="playerrow" key={p.id}><div className="avatar" style={{width:36,height:36,fontSize:12,borderRadius:10}}><ContactRound size={16}/></div><div className="grow"><strong>{p.discord_username || '이름 미등록'}</strong><small>{p.role === 'admin' ? '관리자' : p.role === 'captain' ? '팀장' : '일반 멤버'} · 가입 {p.created_at ? new Date(p.created_at).toLocaleDateString('ko-KR') : '날짜 미상'} · {players.some(player => player.discord_user_id === p.id) ? '선수 등록 완료' : '선수 미등록'}</small></div>{(() => { const linkedPlayer = allPlayers.find(player => player.discord_user_id === p.id && !player.is_captain); return <label className="member-grade-control"><span className="tiny">{linkedPlayer ? '전체 방 등급' : '기본 등급'}</span><select aria-label={p.discord_username + ' 등급'} value={p.grade || linkedPlayer?.grade || 'C'} disabled={busy} onChange={e => saveGlobalGrade(p.id, e.target.value)}>{['S','A','B','C','D'].map(g => <option key={g} value={g}>{g}급</option>)}</select></label>; })()}</div>)}</div> : <div className="empty">등록된 Discord 계정이 없습니다.</div>}
    </div>
  </section>;
}

function Stat({icon,label,value,sub}) { return <div className="stat"><div className="stat-icon">{icon}</div><small>{label}</small><strong>{value}</strong><span>{sub}</span></div>; }
function Setup() { return <main className="setup"><div className="logo"><Orbit size={28}/></div><p className="eyebrow">BAEKYA AUCTION · SETUP REQUIRED</p><h1>사이트 연결 설정이 필요해요.</h1><p>프로젝트 폴더의 <code>.env.example</code>을 복사해 <code>.env</code> 파일을 만들고, Supabase 프로젝트 URL·anon key·경매 방 UUID를 입력한 뒤 실행하세요.</p><ol><li>Supabase 프로젝트 생성</li><li><code>supabase/migrations/001_schema.sql</code>을 SQL Editor에서 실행</li><li>Authentication → Providers에서 Discord 활성화</li><li>환경변수 입력 후 <code>npm install</code>, <code>npm run dev</code></li></ol><p className="tiny">이 미리보기는 실제 계정이나 서버에 아직 연결되지 않았습니다.</p></main>; }


class AppErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('BAEKYA_RENDER_ERROR', error, info); }
  render() {
    if (this.state.error) return <main style={{minHeight:'100vh',padding:'28px 20px',background:'#0b1020',color:'#f4f5ff',fontFamily:'system-ui,sans-serif'}}><h1 style={{color:'#aaa0ff'}}>BAEKYA AUCTION</h1><h2>화면을 불러오지 못했습니다.</h2><p>오류 내용</p><pre style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',padding:16,background:'#141b30',borderRadius:12}}>{String(this.state.error?.message || this.state.error)}</pre><button style={{padding:'12px 16px',borderRadius:10}} onClick={()=>window.location.reload()}>새로고침</button></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(<AppErrorBoundary><App/></AppErrorBoundary>);
