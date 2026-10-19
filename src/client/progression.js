import { CAMPAIGN, DEFAULT_LOADOUT, GARAGE_PARTS, STARTER_PARTS, UPGRADES, normalizeLoadout, normalizeUpgrades } from '../shared/campaign.js?v=22';

const KEY = 'tancazo.campaign.v1';

export function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const stars = saved.stars && typeof saved.stars === 'object' ? saved.stars : {};
    const completedIndex = CAMPAIGN.reduce((furthest, mission, index) => Number(stars[mission.id]) > 0 ? Math.max(furthest, index) : furthest, -1);
    const unlockedFromStars = completedIndex >= 0 ? completedIndex + 2 : 1;
    const unlockedParts = Object.fromEntries(Object.entries(STARTER_PARTS).map(([category, defaults]) => [category, [...new Set([...(defaults || []), ...(saved.unlockedParts?.[category] || [])])]]));
    for (const mission of CAMPAIGN) if (Number(stars[mission.id]) > 0 && mission.reward) {
      const list = unlockedParts[mission.reward.category] || (unlockedParts[mission.reward.category] = []);
      if (!list.includes(mission.reward.id)) list.push(mission.reward.id);
    }
    const unlockedMissions = new Set(['green-line', ...(saved.unlockedMissions || [])]);
    CAMPAIGN.slice(0, Math.max(1, Number(saved.unlocked) || 1)).forEach((mission) => unlockedMissions.add(mission.id));
    for (const mission of CAMPAIGN) if (Number(stars[mission.id]) > 0) for (const next of mission.next || []) unlockedMissions.add(next);
    return {
      unlocked: Math.min(CAMPAIGN.length, Math.max(1, Number(saved.unlocked) || 1, unlockedFromStars)),
      unlockedMissions: [...unlockedMissions],
      stars,
      medals: Math.max(0, Number(saved.medals) || 0),
      upgrades: normalizeUpgrades(saved.upgrades),
      unlockedParts,
      loadout: normalizeLoadout(saved.loadout || DEFAULT_LOADOUT, unlockedParts),
    };
  } catch {
    const unlockedParts = structuredClone(STARTER_PARTS);
    return { unlocked: 1, unlockedMissions: ['green-line'], stars: {}, medals: 0, upgrades: normalizeUpgrades(), unlockedParts, loadout: normalizeLoadout(DEFAULT_LOADOUT, unlockedParts) };
  }
}

export function saveProgress(progress) {
  localStorage.setItem(KEY, JSON.stringify(progress));
}

export function completeMission(progress, missionId, game) {
  const index = CAMPAIGN.findIndex((mission) => mission.id === missionId);
  if (index < 0 || game.status !== 'victory') return 0;
  let stars = 1;
  if (game.score >= (CAMPAIGN[index].starScore || (index + 1) * 900)) stars++;
  const survivors = game.tanks.filter((tank) => tank.kind === 'player' && tank.alive && tank.hp >= Math.ceil(tank.maxHp / 2));
  if (survivors.length) stars++;
  const previous = progress.stars[missionId] || 0;
  progress.stars[missionId] = Math.max(previous, stars);
  progress.medals += Math.max(0, stars - previous);
  progress.unlocked = Math.max(progress.unlocked, Math.min(CAMPAIGN.length, index + 2));
  progress.unlockedMissions ||= ['green-line'];
  for (const next of CAMPAIGN[index].next || []) if (!progress.unlockedMissions.includes(next)) progress.unlockedMissions.push(next);
  const reward = CAMPAIGN[index].reward;
  if (reward) {
    const list = progress.unlockedParts[reward.category] || (progress.unlockedParts[reward.category] = []);
    if (!list.includes(reward.id)) list.push(reward.id);
  }
  saveProgress(progress);
  return stars;
}

export function equipPart(progress, category, id) {
  if (!GARAGE_PARTS[category]?.[id] || !progress.unlockedParts?.[category]?.includes(id)) return false;
  progress.loadout = normalizeLoadout({ ...progress.loadout, [category]: id }, progress.unlockedParts);
  saveProgress(progress);
  return true;
}

export function fabricatePart(progress, category, id, cost = 4) {
  if (!GARAGE_PARTS[category]?.[id] || progress.unlockedParts?.[category]?.includes(id) || progress.medals < cost) return false;
  progress.medals -= cost;
  (progress.unlockedParts[category] ||= []).push(id);
  saveProgress(progress);
  return true;
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
