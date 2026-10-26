import React, { useMemo } from 'react';
import { Activity, AlertTriangle, ArrowRight, BadgeCheck, CalendarDays, CheckCircle2, ClipboardCheck, Crown, ShieldCheck, Users, Zap } from 'lucide-react';
import { buildOperationsChecks } from './operationsChecks.js';

const statusLabel = (status) => ({ setup: '준비', running: '진행 중', paused: '일시정지', finished: '종료' }[status] || status || '미확인');

export default function OperationsCenter({ room, rooms = [], teams = [], players = [], history = [], profiles = [], onNavigate = () => {} }) {
  const checks = useMemo(() => buildOperationsChecks({ room, rooms, teams, players, history, profiles }), [room, rooms, teams, players, history, profiles]);
  const issues = checks.filter((item) => item.level !== 'ok');
  const runningRooms = rooms.filter((item) => item.status === 'running').length;
  const sold = players.filter((item) => !item.is_captain && item.status === 'sold').length;
  const pending = players.filter((item) => !item.is_captain && item.status === 'available').length;

  return <section className="ops-center">
    <div className="ops-hero panel">
      <div className="ops-hero-icon"><Activity size={24}/></div>
      <div className="ops-hero-copy">
        <p className="eyebrow">BAEKYA OPERATIONS · READINESS CHECK</p>
        <h3>대회 진행 통합 대시보드</h3>
        <p className="muted">운영 상태를 한곳에서 확인하고, 시작 전 누락된 설정을 점검합니다. 이 화면은 진단 전용이며 데이터를 변경하지 않습니다.</p>
      </div>
      <div className={'ops-health ' + (issues.length ? 'needs-attention' : 'healthy')}>
        {issues.length ? <AlertTriangle size={17}/> : <CheckCircle2 size={17}/>}
        <strong>{issues.length ? '확인 필요' : '점검 통과'}</strong>
        <span>{issues.length}개 항목</span>
      </div>
    </div>

    <div className="ops-metrics">
      <div className="stat"><div className="stat-icon"><ClipboardCheck/></div><small>전체 방</small><strong>{rooms.length}개</strong><span>{runningRooms}개 진행 중</span></div>
      <div className="stat"><div className="stat-icon"><Users/></div><small>현재 방 선수</small><strong>{players.length}명</strong><span>팀장 포함</span></div>
      <div className="stat"><div className="stat-icon"><Zap/></div><small>경매 진행</small><strong>{sold}명 낙찰</strong><span>{pending}명 대기</span></div>
      <div className="stat"><div className="stat-icon"><Crown/></div><small>팀 구성</small><strong>{teams.length}팀</strong><span>{teams.filter((team) => team.captain_user_id).length}팀 팀장 지정</span></div>
    </div>

    <div className="panel ops-check-panel">
      <div className="panelhead"><div><h3><ShieldCheck size={18}/> 운영 전 점검</h3><p className="tiny">현재 선택한 방: {room?.name || '방 미선택'} · {statusLabel(room?.status)}</p></div><span className="pill">{checks.length - issues.length}/{checks.length} 통과</span></div>
      <div className="ops-check-list">
        {checks.map((item) => <article className={'ops-check-row ' + item.level} key={item.id}>
          <span className="ops-check-icon">{item.level === 'ok' ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>}</span>
          <div className="grow"><strong>{item.title}</strong><p>{item.detail}</p></div>
          <span className={'ops-check-status ' + item.level}>{item.level === 'ok' ? '정상' : item.level === 'warn' ? '확인' : '주의'}</span>
        </article>)}
      </div>
      <p className="tiny ops-disclaimer">자동 점검은 화면에 로드된 데이터 기준입니다. 계정별 권한, 실제 동시 입찰, DB 트랜잭션 및 저장 지속성은 이 화면만으로 보증하지 않습니다.</p>
    </div>

    <div className="panel ops-rooms-panel">
      <div className="panelhead"><div><h3>방별 진행 상황</h3><p className="tiny">각 방의 상태를 확인하고 필요한 관리 화면으로 이동하세요.</p></div><span className="pill">{rooms.length}개 방</span></div>
      {rooms.length ? <div className="ops-room-list">{rooms.map((item) => <article className="ops-room-row" key={item.id}>
        <div className="ops-room-type">{item.room_type === 'balance' ? <Users size={18}/> : <Zap size={18}/>}</div>
        <div className="grow"><strong>{item.name}</strong><small>{item.room_type === 'balance' ? '점수 팀배정' : '선수 경매'} · {item.created_at ? new Date(item.created_at).toLocaleDateString('ko-KR') + ' 생성' : '생성일 미상'}</small></div>
        <span className={'ops-room-status ' + item.status}>{statusLabel(item.status)}</span>
        <button type="button" className="btn ghost" onClick={() => onNavigate(item.room_type === 'balance' ? 'balance' : 'auction', item.id)}>열기 <ArrowRight size={15}/></button>
      </article>)}</div> : <div className="empty">등록된 방이 없습니다.</div>}
    </div>

    <div className="ops-shortcuts">
      <button className="panel ops-shortcut" type="button" onClick={() => onNavigate('rooms')}><ClipboardCheck/><strong>방 관리</strong><span>방 생성·이름·상태 확인</span><ArrowRight size={16}/></button>
      <button className="panel ops-shortcut" type="button" onClick={() => onNavigate('auction')}><Zap/><strong>경매 관리</strong><span>입찰·낙찰·잔여 선수</span><ArrowRight size={16}/></button>
      <button className="panel ops-shortcut" type="button" onClick={() => onNavigate('tournament')}><Crown/><strong>대회 전적</strong><span>경기 결과·순위·MVP</span><ArrowRight size={16}/></button>
      <button className="panel ops-shortcut" type="button" onClick={() => onNavigate('tools')}><BadgeCheck/><strong>기록·백업</strong><span>변경 이력과 복구 관리</span><ArrowRight size={16}/></button>
      <button className="panel ops-shortcut" type="button" onClick={() => onNavigate('members')}><Users/><strong>멤버 관리</strong><span>선수·계정·팀장 관리</span><ArrowRight size={16}/></button>
      <button className="panel ops-shortcut" type="button" onClick={() => onNavigate('events')}><CalendarDays/><strong>관전자 이벤트</strong><span>예측·보상 현황</span><ArrowRight size={16}/></button>
    </div>
  </section>;
}
