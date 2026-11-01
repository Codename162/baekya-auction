import React, { useEffect, useMemo, useState } from 'react';
import { Check, Clock, LockKeyhole, RefreshCw, X } from 'lucide-react';

export default function RoomAccess({ supabase, session, isAdmin, rooms = [], onRoomSelect }) {
  const [selectedRoom, setSelectedRoom] = useState('');
  const [requests, setRequests] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = rooms.find(room => room.id === selectedRoom) || null;
  const myRequests = useMemo(() => requests.filter(item => item.user_id === session?.user?.id), [requests, session]);
  const myRequest = myRequests.find(item => item.room_id === selectedRoom) || null;

  async function loadRequests() {
    if (!supabase || !session?.user?.id) return;
    const { data, error: requestError } = await supabase.from('room_access_requests').select('*').order('created_at', { ascending: false });
    if (requestError) throw requestError;
    const rows = data || [];
    setRequests(rows);
    const ids = [...new Set(rows.map(row => row.user_id))];
    if (ids.length) {
      const { data: profileRows, error: profileError } = await supabase.from('profiles').select('id,discord_username,avatar_url').in('id', ids);
      if (profileError) throw profileError;
      setProfiles(Object.fromEntries((profileRows || []).map(profile => [profile.id, profile])));
    } else setProfiles({});
  }

  useEffect(() => {
    if (!selectedRoom && rooms.length) setSelectedRoom(rooms[0].id);
  }, [rooms, selectedRoom]);

  useEffect(() => {
    loadRequests().catch(err => setError(err.message || '신청 내역을 불러오지 못했습니다.'));
  }, [session?.user?.id, isAdmin]);

  async function submitRequest() {
    if (!selectedRoom || !session?.user?.id) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const existing = requests.find(item => item.room_id === selectedRoom && item.user_id === session.user.id);
      if (existing?.status === 'approved') { setNotice('이미 승인된 방입니다.'); return; }
      if (existing?.status === 'pending') { setNotice('이미 승인 대기 중인 방입니다.'); return; }
      if (existing?.status === 'rejected') {
        const { error: updateError } = await supabase.from('room_access_requests').update({ status: 'pending', reviewed_at: null, reviewed_by: null }).eq('id', existing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase.from('room_access_requests').insert({ room_id: selectedRoom, user_id: session.user.id, status: 'pending' });
        if (insertError) throw insertError;
      }
      await loadRequests();
      setNotice('참여 신청이 접수되었습니다. 관리자 승인 후 해당 방을 이용할 수 있습니다.');
    } catch (err) { setError(err.message || '신청에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  async function reviewRequest(request, status) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { error: updateError } = await supabase.from('room_access_requests').update({ status, reviewed_at: new Date().toISOString(), reviewed_by: session.user.id }).eq('id', request.id);
      if (updateError) throw updateError;
      await loadRequests();
      setNotice(status === 'approved' ? '방 참여를 승인했습니다.' : '방 참여를 거절했습니다.');
    } catch (err) { setError(err.message || '승인 처리에 실패했습니다.'); }
    finally { setBusy(false); }
  }

  const statusText = status => ({ pending: '승인 대기', approved: '승인 완료', rejected: '거절됨' }[status] || '미신청');
  const statusClass = status => status || 'none';
  const pending = requests.filter(item => item.status === 'pending');

  return <section className="room-access-page">
    <div className="panel room-access-intro">
      <div className="panelhead"><div><p className="eyebrow">BAEKYA ROOM ACCESS</p><h3>{isAdmin ? '방 참여 승인 관리' : '참여할 방 선택'}</h3><p className="muted">{isAdmin ? '각 방에 들어오려는 멤버의 신청을 확인하고 승인할 수 있습니다.' : '참여할 방을 선택해 신청해 주세요. 승인되면 해당 방의 선수와 팀 정보를 이용할 수 있습니다.'}</p></div><span className="pill"><LockKeyhole size={14}/> 방별 승인</span></div>
      {!isAdmin && <>
        <label className="field">참여할 방<select value={selectedRoom} onChange={event => { setSelectedRoom(event.target.value); onRoomSelect?.(event.target.value); setError(''); setNotice(''); }}><option value="">방을 선택해 주세요</option>{rooms.map(room => <option key={room.id} value={room.id}>{room.name} · {room.room_type === 'balance' ? '점수 팀배정' : '선수 경매'}</option>)}</select></label>
        {selected && <div className="room-access-selected"><div><strong>{selected.name}</strong><small>{selected.room_type === 'balance' ? '점수 팀배정방' : '선수 경매방'} · {selected.status === 'finished' ? '종료' : selected.status === 'running' ? '진행 중' : selected.status === 'paused' ? '일시정지' : '준비'}</small></div><span className={'room-access-status ' + statusClass(myRequest?.status)}>{statusText(myRequest?.status)}</span></div>}
        <button type="button" className="btn primary" disabled={busy || !selectedRoom || myRequest?.status === 'approved' || myRequest?.status === 'pending'} onClick={submitRequest}>{busy ? '처리 중…' : myRequest?.status === 'rejected' ? '다시 신청하기' : myRequest?.status === 'approved' ? '승인 완료' : myRequest?.status === 'pending' ? '승인 대기 중' : '이 방 참여 신청'}</button>
        <div className="room-access-history"><h4>내 방 신청 현황</h4>{myRequests.length ? myRequests.map(item => { const room = rooms.find(row => row.id === item.room_id); return <div className="room-access-request-row" key={item.id}><div className="grow"><strong>{room?.name || '삭제된 방'}</strong><small>{new Date(item.created_at).toLocaleString('ko-KR')}</small></div><span className={'room-access-status ' + statusClass(item.status)}>{statusText(item.status)}</span></div>; }) : <div className="empty">아직 신청한 방이 없습니다.</div>}</div>
      </>}
      {isAdmin && <div className="room-access-admin-summary"><span><Clock size={15}/> 승인 대기 <strong>{pending.length}건</strong></span><button type="button" className="btn ghost" disabled={busy} onClick={() => loadRequests().catch(err => setError(err.message))}><RefreshCw size={15}/> 새로고침</button></div>}
    </div>
    {isAdmin && <div className="panel"><div className="panelhead"><div><h3>승인 대기 신청</h3><p className="tiny">신청한 방을 기준으로 승인 여부를 결정합니다.</p></div><span className="pill">{pending.length}건</span></div>
      {pending.length ? <div className="room-access-admin-list">{pending.map(request => { const room = rooms.find(item => item.id === request.room_id); const profile = profiles[request.user_id]; return <article className="room-access-admin-row" key={request.id}><div className="grow"><strong>{profile?.discord_username || '디스코드 사용자'}</strong><small>{room?.name || '삭제된 방'} · {room?.room_type === 'balance' ? '점수 팀배정' : '선수 경매'} · {new Date(request.created_at).toLocaleString('ko-KR')}</small></div><button type="button" className="btn primary" disabled={busy || !room} onClick={() => reviewRequest(request,'approved')}><Check size={15}/> 승인</button><button type="button" className="btn danger" disabled={busy} onClick={() => reviewRequest(request,'rejected')}><X size={15}/> 거절</button></article>; })}</div> : <div className="empty">현재 승인 대기 중인 신청이 없습니다.</div>}
      <div className="room-access-history"><h4>최근 처리된 신청</h4>{requests.filter(item => item.status !== 'pending').slice(0,12).map(item => { const room = rooms.find(row => row.id === item.room_id); const profile = profiles[item.user_id]; return <div className="room-access-request-row" key={item.id}><div className="grow"><strong>{profile?.discord_username || '디스코드 사용자'}</strong><small>{room?.name || '삭제된 방'}</small></div><span className={'room-access-status ' + statusClass(item.status)}>{statusText(item.status)}</span></div>; })}</div>
    </div>}
    {error && <div className="notice error">{error}</div>}
    {notice && <div className="notice success">{notice}</div>}
  </section>;
}
