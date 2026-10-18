import { CAMPAIGN, UPGRADES, normalizeUpgrades } from '../shared/campaign.js';

const KEY = 'tancazo.campaign.v1';

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      unlocked: Math.max(1, Math.min(CAMPAIGN.length, Number(saved.unlocked) || 1)),
      stars: saved.stars && typeof saved.stars === 'object' ? saved.stars : {},
      medals: Math.max(0, Number(saved.medals) || 0),
      upgrades: normalizeUpgrades(saved.upgrades),
    };
  } catch {
    return { unlocked: 1, stars: {}, medals: 0, upgrades: normalizeUpgrades() };
  }
}

export function saveProgress(progress) {
  localStorage.setItem(KEY, JSON.stringify(progress));
}

export function completeMission(progress, missionId, game) {
  const index = CAMPAIGN.findIndex((mission) => mission.id === missionId);
  if (index < 0 || game.status !== 'victory') return 0;
  let stars = 1;
  if (game.score >= (index + 1) * 900) stars++;
  const survivors = game.tanks.filter((tank) => tank.kind === 'player' && tank.alive && tank.hp >= Math.ceil(tank.maxHp / 2));
  if (survivors.length) stars++;
  const previous = progress.stars[missionId] || 0;
  progress.stars[missionId] = Math.max(previous, stars);
  progress.medals += Math.max(0, stars - previous);
  progress.unlocked = Math.max(progress.unlocked, Math.min(CAMPAIGN.length, index + 2));
  saveProgress(progress);
  return stars;
}

export function buyUpgrade(progress, id) {
  const definition = UPGRADES[id];
  const level = progress.upgrades[id] || 0;
  const cost = level + 1;
  if (!definition || level >= definition.max || progress.medals < cost) return false;
  progress.medals -= cost;
  progress.upgrades[id] = level + 1;
  saveProgress(progress);
  return true;
}
