import React, { useCallback, useEffect, useState } from 'react';
import { Archive, ClipboardList, Download, RefreshCw, RotateCcw, ShieldCheck } from 'lucide-react';
import './RoomTools.css';

function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function RoomTools({ supabase, roomId, room, isAdmin }) {
  const [backups, setBackups] = useState([]);
  const [logs, setLogs] = useState([]);
  const [label, setLabel] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!supabase || !roomId || !isAdmin) return;
    setLoading(true); setError('');
    const [b, a] = await Promise.all([
      supabase.from('room_backups').select('id,room_id,created_by,label,snapshot,created_at').eq('room_id', roomId).order('created_at', { ascending: false }).limit(30),
      supabase.from('room_audit_logs').select('id,actor_name,entity_type,entity_id,action,before_data,after_data,created_at').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100)
    ]);
    if (b.error) setError('백업 목록을 불러오지 못했습니다: ' + b.error.message);
    else setBackups(b.data || []);
    if (a.error) setError(v => v || ('변경 기록을 불러오지 못했습니다: ' + a.error.message));
    else setLogs(a.data || []);
    setLoading(false);
  }, [supabase, roomId, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function createBackup(e) {
    e.preventDefault();
    setBusy('create'); setError(''); setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('create_room_backup', { p_room_id: roomId, p_label: label.trim() || null });
      if (rpcError) throw rpcError;
      const { data: createdBackup, error: readError } = await supabase.from('room_backups').select('label,snapshot').eq('id', data).single();
      await load();
      setLabel('');
      setNotice('현재 방의 백업을 저장했습니다.');
      if (!readError && createdBackup?.snapshot) downloadJson('baekya-room-backup-' + roomId + '.json', createdBackup.snapshot);
    } catch (e) { setError(e.message || '백업을 만들지 못했습니다.'); }
    finally { setBusy(''); }
  }

  async function restoreBackup(item) {
    if (!window.confirm('「' + item.label + '」 백업으로 현재 방을 복구할까요? 현재 입찰·낙찰·대회 전적·공지 기록이 백업 시점의 내용으로 교체됩니다. 진행 중인 경매에서는 복구할 수 없습니다.')) return;
    setBusy(item.id); setError(''); setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('restore_room_backup', { p_backup_id: item.id });
      if (rpcError) throw rpcError;
      setNotice(typeof data === 'string' ? data : '백업 복구를 완료했습니다.');
      await load();
    } catch (e) { setError(e.message || '백업 복구에 실패했습니다.'); }
    finally { setBusy(''); }
  }

  if (!isAdmin) return <section className="panel"><div className="empty"><ShieldCheck size={22}/><p>관리자만 변경 기록과 백업을 확인할 수 있습니다.</p></div></section>;

  return <section className="room-tools">
    <div className="panel room-tools-intro"><div><p className="eyebrow">BAEKYA SAFETY CENTER</p><h3>변경 기록 · 데이터 백업</h3><p className="tiny">현재 선택한 방: {room?.name || '미선택'} · 백업과 복구는 방별로 분리됩니다.</p></div><button className="btn ghost" type="button" onClick={load} disabled={loading}><RefreshCw size={15}/>{loading ? '불러오는 중…' : '새로고침'}</button></div>
    {error && <div className="alert">{error}</div>}{notice && <div className="success">{notice}</div>}
    <div className="panel">
      <div className="panelhead"><div><h3><Archive size={17}/> 방 백업</h3><p className="tiny">선수·팀·예산·입찰·낙찰·대회 전적·이벤트 공지를 저장합니다.</p></div><span className="pill">{backups.length}개 백업</span></div>
      <form className="room-backup-form" onSubmit={createBackup}><label className="field">백업 이름<input value={label} onChange={e=>setLabel(e.target.value)} placeholder="예: 롤 내전 시작 전 백업" maxLength={100}/></label><button className="btn primary" type="submit" disabled={!!busy || !roomId || room?.status === 'running'}><Archive size={15}/>{busy === 'create' ? '백업 중…' : '지금 백업하기'}</button></form>
      {room?.status === 'running' && <p className="tiny room-tool-warning">경매 진행 중에는 백업할 수 없습니다. 먼저 경매를 일시정지하거나 종료해 주세요.</p>}
      <p className="tiny">백업은 서버에 저장되며, 저장된 스냅샷을 JSON 파일로 내려받을 수 있습니다. 최대 최근 30개 백업을 목록에 표시합니다.</p>
      <div className="room-tool-list">{backups.map(item=><article className="room-tool-row" key={item.id}><div className="grow"><strong>{item.label}</strong><small>{new Date(item.created_at).toLocaleString('ko-KR')}</small><small>{Array.isArray(item.snapshot?.players) ? item.snapshot.players.length : 0}명 · {Array.isArray(item.snapshot?.teams) ? item.snapshot.teams.length : 0}팀</small></div><div className="room-tool-actions"><button className="btn ghost" type="button" onClick={()=>downloadJson('baekya-backup-'+item.id+'.json',item.snapshot)}><Download size={14}/> JSON</button><button className="btn danger" type="button" disabled={!!busy || room?.status === 'running'} onClick={()=>restoreBackup(item)}><RotateCcw size={14}/>{busy===item.id?'복구 중…':'복구'}</button></div></article>)}
      {!backups.length && !loading && <div className="empty">저장된 백업이 없습니다.</div>}</div>
    </div>
    <div className="panel">
      <div className="panelhead"><div><h3><ClipboardList size={17}/> 변경 기록</h3><p className="tiny">팀장 지정·해제, 선수 점수·등급·닉네임 변경, 방 설정과 전적 변경 등을 기록합니다.</p></div><span className="pill">최근 {logs.length}건</span></div>
      <div className="room-tool-list">{logs.map(log=><article className="audit-row" key={log.id}><div className="audit-mark">{log.action === 'DELETE' ? '삭제' : log.action === 'INSERT' ? '추가' : log.action === 'RESTORE' ? '복구' : '수정'}</div><div className="grow"><strong>{({players:'선수',teams:'팀',rooms:'방 설정',tournament_results:'대회 전적',event_announcements:'이벤트 공지',spectator_events:'관전자 이벤트',room_backup:'백업'})[log.entity_type] || log.entity_type} · {log.entity_id?.slice(0,8) || '기록'}</strong><small>{log.actor_name || '시스템'} · {new Date(log.created_at).toLocaleString('ko-KR')}</small>{log.before_data && log.after_data && <small>{Object.keys(log.after_data).filter(k=>JSON.stringify(log.before_data[k])!==JSON.stringify(log.after_data[k]) && !['updated_at','last_bid_at'].includes(k)).slice(0,5).map(k=>k.replaceAll('_',' ')).join(' · ') || '변경 내용 기록됨'}</small>}</div><span className="pill">{log.action}</span></article>)}
      {!logs.length && !loading && <div className="empty">아직 기록이 없습니다. 앞으로의 변경 사항이 자동으로 기록됩니다.</div>}</div>
    </div>
  </section>;
}
