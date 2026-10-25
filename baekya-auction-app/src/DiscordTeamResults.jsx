import React, { useMemo, useState } from 'react';
import { Send, CheckCircle2, AlertCircle } from 'lucide-react';

export default function DiscordTeamResults({ supabase, room, teams, players, isAdmin }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const teamSize = Number(room?.team_size || 5);

  const resultTeams = useMemo(() => teams.map(team => ({
    id: team.id,
    name: team.name,
    captain: team.captain_name || '',
    players: players
      .filter(player => player.team_id === team.id || player.captain_team_id === team.id)
      .map(player => ({
        name: player.name,
        isCaptain: Boolean(player.is_captain),
        grade: player.is_captain ? 'TL' : player.grade,
        score: player.skill_score == null ? null : Number(player.skill_score),
        soldPrice: player.sold_price == null ? null : Number(player.sold_price)
      }))
  })), [teams, players]);

  const complete = resultTeams.length >= 2 &&
    resultTeams.every(team => team.players.length === teamSize) &&
    players.filter(player => !player.is_captain).every(player => resultTeams.some(team => team.players.some(member => member.name === player.name)));

  async function sendResults() {
    if (!isAdmin || !complete || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData?.session?.access_token;
      if (!token) throw new Error('로그인 세션이 만료됐습니다. 다시 로그인해 주세요.');

      const response = await fetch('/api/discord-team-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({
          roomName: room?.name || '백야 내전',
          teamSize,
          teams: resultTeams
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || '디스코드 전송에 실패했습니다.');
      setNotice('팀 편성 결과를 디스코드에 전송했습니다.');
    } catch (e) {
      setError(e.message || '디스코드 전송에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) return null;

  return <section className="panel discord-results-panel">
    <div className="panelhead">
      <div><h3>디스코드 팀 결과 전송</h3><p className="tiny">팀 편성이 끝나면 지정된 백야 채널에 결과를 올립니다.</p></div>
      <span className="pill">관리자 전용</span>
    </div>
    <p className="tiny">{complete ? `팀별 ${teamSize}명 배정이 완료됐습니다. 전송 전에 명단을 확인해 주세요.` : `전송하려면 모든 팀에 정확히 ${teamSize}명씩 배정되어야 합니다. 현재: ${resultTeams.map(team => `${team.name} ${team.players.length}/${teamSize}명`).join(' · ')}`}</p>
    {error && <div className="alert"><AlertCircle size={16}/>{error}</div>}
    {notice && <div className="success"><CheckCircle2 size={16}/>{notice}</div>}
    <button type="button" className="btn primary full" disabled={!complete || busy} onClick={sendResults}>
      <Send size={16}/>{busy ? '디스코드 전송 중…' : '📢 디스코드에 팀 결과 올리기'}
    </button>
  </section>;
}
