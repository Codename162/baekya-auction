import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOperationsChecks } from './operationsChecks.js';

test('reports missing teams and captains before event starts', () => {
  const checks = buildOperationsChecks({ room: { id: 'r1', status: 'setup', team_size: 5 }, rooms: [{ id: 'r1' }], teams: [{ id: 't1', name: '1팀' }], players: [], history: [], profiles: [] });
  assert.equal(checks.find((item) => item.id === 'teams').level, 'error');
  assert.equal(checks.find((item) => item.id === 'captains').level, 'warn');
});

test('detects overfilled roster and duplicate linked Discord accounts', () => {
  const checks = buildOperationsChecks({
    room: { id: 'r1', status: 'setup', team_size: 2 }, rooms: [{ id: 'r1' }],
    teams: [{ id: 't1', name: '1팀', captain_user_id: 'u1' }],
    players: [
      { id: 'p1', name: '가', team_id: 't1', discord_user_id: 'u2' },
      { id: 'p2', name: '나', team_id: 't1', discord_user_id: 'u2' },
      { id: 'p3', name: '다', team_id: 't1', discord_user_id: 'u3' }
    ], history: [], profiles: []
  });
  assert.equal(checks.find((item) => item.id === 'roster').level, 'error');
  assert.equal(checks.find((item) => item.id === 'duplicates').level, 'warn');
});

test('detects sold players without a team and missing active auction player', () => {
  const checks = buildOperationsChecks({
    room: { id: 'r1', status: 'running', current_player_id: 'missing', team_size: 5 },
    rooms: [{ id: 'r1' }], teams: [{ id: 't1', name: '1팀', captain_user_id: 'u1' }],
    players: [{ id: 'p1', name: '미배정', status: 'sold', is_captain: false }], history: [], profiles: [{ id: 'u1' }]
  });
  assert.equal(checks.find((item) => item.id === 'unassigned').level, 'error');
  assert.equal(checks.find((item) => item.id === 'auction').level, 'error');
});
