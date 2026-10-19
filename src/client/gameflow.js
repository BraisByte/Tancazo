import { CAMPAIGN } from '../shared/campaign.js?v=22';
import { MAPS } from '../shared/maps.js?v=22';

export function nextBattle(game, { training = false, missionId = null } = {}) {
  if (game.status !== 'victory') return null;
  if (training) return { missionId: CAMPAIGN[0].id };
  if (missionId) {
    const next = CAMPAIGN.find((mission) => mission.id === missionId)?.next?.[0];
    return next ? { missionId: next } : null;
  }
  const maps = Object.keys(MAPS);
  const index = maps.indexOf(game.map.id);
  return index < 0 ? null : { mapId: maps[(index + 1) % maps.length], difficulty: game.difficulty };
}
