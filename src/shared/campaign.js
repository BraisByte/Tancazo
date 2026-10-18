export const CAMPAIGN = Object.freeze([
  {
    id: 'green-line',
    title: 'A liña verde',
    briefing: 'Recupera a Ciudadela e mantén intacto o núcleo.',
    mapId: 'citadel',
    difficulty: 'easy',
    objective: 'eliminate',
  },
  {
    id: 'red-forge',
    title: 'A forxa vermella',
    briefing: 'Resiste tres minutos mentres a forxa evacúa o persoal.',
    mapId: 'foundry',
    difficulty: 'normal',
    objective: 'survive',
    duration: 180,
  },
  {
    id: 'iron-convoy',
    title: 'O corredor de ferro',
    briefing: 'Escolta o transporte blindado ata a saída norte.',
    mapId: 'foundry',
    difficulty: 'hard',
    objective: 'escort',
  },
  {
    id: 'cobalt-heart',
    title: 'O corazón de cobalto',
    briefing: 'Abre paso polo delta e destrúe o tanque fortaleza.',
    mapId: 'delta',
    difficulty: 'hard',
    objective: 'boss',
  },
]);

export const UPGRADES = Object.freeze({
  armor: { name: 'Blindaxe', description: '+1 de vida por nivel', max: 2 },
  engine: { name: 'Motor', description: '+8% de velocidade por nivel', max: 3 },
  reload: { name: 'Cargador', description: '-10% de recarga por nivel', max: 3 },
});

export function campaignMission(id) {
  return CAMPAIGN.find((mission) => mission.id === id) || null;
}

export function normalizeUpgrades(value = {}) {
  return Object.fromEntries(Object.entries(UPGRADES).map(([id, definition]) => [id, Math.max(0, Math.min(definition.max, Number(value[id]) || 0))]));
}
