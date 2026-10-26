export function buildOperationsChecks({ room, rooms = [], teams = [], players = [], history = [], profiles = [] }) {
  const checks = [];
  const add = (id, title, detail, level = 'ok') => checks.push({ id, title, detail, level });
  const nonCaptains = players.filter((player) => !player.is_captain);
  const unassigned = nonCaptains.filter((player) => !player.team_id && !player.captain_team_id && player.status === 'sold');
  const duplicateDiscordIds = Object.entries(nonCaptains.reduce((acc, player) => {
    if (player.discord_user_id) acc[player.discord_user_id] = (acc[player.discord_user_id] || 0) + 1;
    return acc;
  }, {})).filter(([, count]) => count > 1);
  const missingCaptains = teams.filter((team) => !team.captain_user_id);
  const rosterOverflow = teams.filter((team) => {
    const count = players.filter((player) => player.team_id === team.id || player.captain_team_id === team.id).length;
    return Number(room?.team_size) > 0 && count > Number(room.team_size);
  });
  const roomIds = new Set(rooms.map((item) => item.id));
  const selectedRoomKnown = !room?.id || roomIds.has(room.id);
  const currentPlayer = room?.current_player_id ? players.find((player) => player.id === room.current_player_id) : null;

  add('room', '선택한 방 데이터', room?.id && selectedRoomKnown ? '현재 방 정보가 목록과 일치합니다.' : room?.id ? '선택한 방이 방 목록에 없습니다. 새로고침 후 다시 확인하세요.' : '방 정보가 아직 로드되지 않았습니다.', room?.id && selectedRoomKnown ? 'ok' : 'warn');
  add('teams', '팀 구성', teams.length >= 2 ? teams.length + '개 팀이 등록되어 있습니다.' : '대회 진행 전 최소 2개 팀이 필요합니다.', teams.length >= 2 ? 'ok' : 'error');
  add('captains', '팀장 지정', missingCaptains.length ? '팀장 미지정: ' + missingCaptains.map((team) => team.name).join(', ') : '모든 팀에 팀장이 지정되어 있습니다.', missingCaptains.length ? 'warn' : 'ok');
  add('roster', '팀 인원 제한', rosterOverflow.length ? '팀당 인원 설정 초과: ' + rosterOverflow.map((team) => team.name).join(', ') : '설정된 팀당 인원 제한을 초과한 팀이 없습니다.', rosterOverflow.length ? 'error' : 'ok');
  add('unassigned', '낙찰 선수 소속', unassigned.length ? '낙찰됐지만 팀 연결이 없는 선수 ' + unassigned.length + '명: ' + unassigned.map((player) => player.name).join(', ') : '낙찰 완료 선수의 팀 연결에 이상이 없습니다.', unassigned.length ? 'error' : 'ok');
  add('duplicates', 'Discord 계정 중복', duplicateDiscordIds.length ? '같은 Discord 계정이 여러 선수로 등록된 항목이 ' + duplicateDiscordIds.length + '개 있습니다.' : '현재 방에서 Discord 연결 중복이 발견되지 않았습니다.', duplicateDiscordIds.length ? 'warn' : 'ok');
  add('auction', '현재 경매 선수', room?.status === 'running' && room?.current_player_id && !currentPlayer ? '진행 중으로 표시되지만 현재 경매 선수를 찾을 수 없습니다.' : room?.status === 'running' && currentPlayer ? '현재 경매 선수: ' + currentPlayer.name : room?.status === 'running' ? '진행 중 상태인지 확인하고 현재 선수를 선택하세요.' : '현재 방은 경매 진행 상태가 아닙니다.', room?.status === 'running' && room?.current_player_id && !currentPlayer ? 'error' : 'ok');
  add('history', '낙찰 기록', history.length ? '현재 방에서 ' + history.length + '개의 최근 낙찰 기록을 불러왔습니다.' : '최근 낙찰 기록이 없습니다. 신규 방이면 정상일 수 있습니다.', history.length ? 'ok' : 'warn');
  add('accounts', '로그인 계정 목록', profiles.length ? profiles.length + '개 계정이 조회되었습니다.' : '계정 목록이 비어 있습니다. 권한 또는 데이터 로드를 확인하세요.', profiles.length ? 'ok' : 'warn');
  add('rooms', '전체 방 상태', rooms.length ? rooms.length + '개 방 중 ' + rooms.filter((item) => item.status === 'running').length + '개가 진행 중입니다.' : '방이 아직 생성되지 않았습니다.', rooms.length ? 'ok' : 'warn');
  return checks;
}
