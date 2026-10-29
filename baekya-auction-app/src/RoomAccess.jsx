import React, { useEffect, useState } from 'react';
import { BadgeCheck, Clock, LockKeyhole, RefreshCw, ShieldCheck, Users } from 'lucide-react';

const partNames = { part1: '참여 신청', part2: '참여 신청', both: '참여 신청' };
const statusNames = { pending: '승인 대기', approved: '승인 완료', rejected: '반려' };

export default function RoomAccess({ supabase, session, isAdmin, rooms, onRefreshRooms }) {
  const part = 'both';
  const [mine, setMine] = useState(null);
  const [requests, setRequests] = useState([]);
  const [parts, setParts] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    if (!session?.user?.id) return;
    setBusy(true); setError('');
    try {
      const own = await supabase.from('room_access_requests').select('*').eq('user_id', session.user.id).maybeSingle();
      if (own.error) throw own.error;
      setMine(own.data || null);
      if (isAdmin) {
        const all = await supabase.from('room_access_requests').select('*').order('submitted_at', { ascending: false });
        if (all.error) throw all.error;
        const ids = [...new Set((all.data || []).map(x => x.user_id))];
        let names = {};
        if (ids.length) {
          const p = await supabase.from('profiles').select('id,discord_username').in('id', ids);
          if (!p.error) names = Object.fromEntries((p.data || []).map(x => [x.id, x.discord_username]));
        }
        setRequests((all.data || []).map(x => ({ ...x, discord_username: names[x.user_id] })));
        setParts(prev => Object.fromEntries((rooms || []).map(r => [r.id, prev[r.id] ?? r.event_part ?? ''])));
      }
    } catch (e) { setError(e.message || '신청 정보를 불러오지 못했습니다.'); }
    finally { setBusy(false); }
  }
  useEffect(() => { load(); }, [session?.user?.id, isAdmin, rooms?.length]);

  async function runRpc(fn, args, fallback) {
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc(fn, args);
      if (rpcError) throw rpcError;
      setNotice(typeof data === 'string' ? data : fallback);
      await load();
      await onRefreshRooms?.();
    } catch (e) { setError(e.message || fallback); }
    finally { setBusy(false); }
  }

  return <section className="panel access-panel">
    <div className="panelhead"><div><h3><LockKeyhole size={18} style={{verticalAlign:'-3px',marginRight:8}}/>참여 신청</h3><p className="tiny">참여 신청 후 관리자 승인 시 경매방과 점수 팀배정방을 이용할 수 있습니다.</p></div><button className="btn ghost" onClick={load} disabled={busy}><RefreshCw size={15}/></button></div>
    {error && <div className="alert">{error}</div>}{notice && <div className="success">{notice}</div>}
    {!isAdmin && <div className="access-application">
      <div className="access-status"><span className="access-status-icon"><Users size={20}/></span><div><strong>참여 신청</strong><p className="tiny">참여 신청 후 관리자의 승인을 받으면 이용할 수 있습니다.</p></div></div>
      {mine && <p className="access-current">신청 상태: <span className={'access-state '+mine.status}>{statusNames[mine.status] || mine.status}</span></p>}
      <form className="access-form" onSubmit={e=>{e.preventDefault();runRpc('submit_room_access_request',{p_requested_part:part},'참여 신청을 제출했습니다.')}}>
        <button className="btn primary" type="submit" disabled={busy}><ShieldCheck size={16}/>{mine?.status==='approved'?'신청 상태 확인':'참여 신청'}</button>
      </form>
      
    </div>}
    {isAdmin && <>
      <div className="access-admin-summary"><span><Users size={16}/> 신청 {requests.length}건</span><span><Clock size={16}/> 대기 {requests.filter(r=>r.status==='pending').length}건</span><span><BadgeCheck size={16}/> 부 구분된 방 {(rooms||[]).filter(r=>r.event_part).length}개</span></div>
      <h4 className="access-subtitle">참여 신청 검토</h4>
      {!requests.length ? <div className="empty">아직 참여 신청이 없습니다.</div> : <div className="access-request-list">{requests.map(req=><article className="access-request" key={req.id}>
        <div className="access-request-info"><strong>{req.discord_username || req.user_id}</strong><small>{partNames[req.requested_part] || req.requested_part} · {statusNames[req.status] || req.status}</small><small>{req.submitted_at ? new Date(req.submitted_at).toLocaleString('ko-KR') : ''}</small></div>
        {req.status==='pending' && <div className="access-request-actions"><button className="btn primary" disabled={busy} onClick={()=>runRpc('review_room_access_request',{p_request_id:req.id,p_status:'approved'},'신청을 승인했습니다.')}>승인</button><button className="btn ghost" disabled={busy} onClick={()=>runRpc('review_room_access_request',{p_request_id:req.id,p_status:'rejected'},'신청을 반려했습니다.')}>반려</button></div>}
      </article>)}</div>}
      <h4 className="access-subtitle">방별 참여 부 지정</h4><p className="tiny">1부·2부 경매방과 점수 팀배정방을 각각 지정해 주세요. 방 이름은 모두에게 표시되지만, 참여 부가 지정되지 않은 방은 관리자 외 이용할 수 없습니다.</p>
      <div className="access-room-list">{(rooms||[]).map(room=><div className="access-room-row" key={room.id}>
        <div><strong>{room.name}</strong><small>{room.room_type==='balance'?'점수 팀배정방':'경매방'} · {room.status==='finished'?'종료':room.status==='running'?'진행 중':room.status==='paused'?'일시정지':'준비'}</small></div>
        <select aria-label={room.name+' 참여 부'} value={parts[room.id] ?? room.event_part ?? ''} onChange={e=>setParts(prev=>({...prev,[room.id]:e.target.value}))}><option value="">미지정(기존 접근)</option><option value="part1">1부</option><option value="part2">2부</option></select>
        <button className="btn ghost" disabled={busy || (parts[room.id] ?? room.event_part ?? '')===(room.event_part||'')} onClick={()=>runRpc('set_room_event_part',{p_room_id:room.id,p_event_part:parts[room.id]||null},'방 구분을 저장했습니다.')}>저장</button>
      </div>)}</div>
    </>}
  </section>;
}
