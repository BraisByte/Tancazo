export const CAMPAIGN = Object.freeze([
  {
    id: 'green-line',
    title: 'A liña verde',
    briefing: 'Recupera a Ciudadela e mantén intacto o núcleo.',
    mapId: 'citadel',
    difficulty: 'easy',
    objective: 'eliminate',
    enemies: 8,
    starScore: 900,
    sector: 'ORIXE',
    next: ['red-forge', 'silent-depot'],
    reward: { category: 'ultimate', id: 'artillery', name: 'Bombardeo orbital' },
  },
  {
    id: 'red-forge',
    title: 'A forxa vermella',
    briefing: 'Resiste tres minutos mentres a forxa evacúa o persoal.',
    mapId: 'foundry',
    difficulty: 'normal',
    objective: 'survive',
    duration: 90,
    starScore: 1800,
    sector: 'RUTA INDUSTRIAL',
    next: ['frozen-pass', 'iron-convoy'],
    reward: { category: 'turret', id: 'repeater', name: 'Torreta repetidora' },
  },
  {
    id: 'frozen-pass',
    title: 'O paso xeado',
    briefing: 'Atravesa o glaciar e emprega os novos dispositivos contra a vangarda.',
    mapId: 'glacier',
    difficulty: 'normal',
    objective: 'eliminate',
    enemies: 16,
    tutorialItem: 'freeze',
    itemDrop: [7.5, 11.5],
    starScore: 1800,
    sector: 'RUTA NORTE',
    next: ['emerald-marsh', 'broken-arsenal'],
    reward: { category: 'chassis', id: 'scout', name: 'Chasis Lince' },
  },
  {
    id: 'silent-depot',
    title: 'O depósito silencioso',
    briefing: 'Mantén a baliza central ata completar a transmisión.',
    mapId: 'citadel',
    difficulty: 'normal',
    objective: 'capture',
    duration: 35,
    target: [7.5, 8.5],
    starScore: 2400,
    sector: 'RUTA TÁCTICA',
    next: ['iron-convoy', 'frozen-pass'],
    reward: { category: 'engine', id: 'turbine', name: 'Motor turbina' },
  },
  {
    id: 'iron-convoy',
    title: 'O corredor de ferro',
    briefing: 'Escolta o transporte blindado ata a saída norte.',
    mapId: 'foundry',
    difficulty: 'hard',
    objective: 'escort',
    enemies: 22,
    starScore: 2700,
    sector: 'FRONTE MÓBIL',
    next: ['ghost-rescue', 'last-bastion'],
    reward: { category: 'chassis', id: 'bulwark', name: 'Chasis Baluarte' },
  },
  {
    id: 'emerald-marsh',
    title: 'A néboa esmeralda',
    briefing: 'Resiste no pantano mentres a néboa limita as rutas de escape.',
    mapId: 'marsh',
    difficulty: 'hard',
    objective: 'survive',
    duration: 105,
    starScore: 3200,
    sector: 'RUTA SALVAXE',
    next: ['ghost-rescue', 'command-gate'],
    reward: { category: 'engine', id: 'traction', name: 'Orugas de tracción' },
  },
  {
    id: 'broken-arsenal',
    title: 'O arsenal roto',
    briefing: 'Destrúe os tres xeradores que alimentan as defensas inimigas.',
    mapId: 'arsenal',
    difficulty: 'hard',
    objective: 'generators',
    enemies: 24,
    targets: [[3.5, 3.5], [11.5, 3.5], [7.5, 7.5]],
    starScore: 3800,
    sector: 'RUTA DE SABOTAXE',
    next: ['command-gate'],
    reward: { category: 'turret', id: 'siege', name: 'Torreta de asedio' },
  },
  {
    id: 'last-bastion',
    title: 'O último bastión',
    briefing: 'Defende o núcleo durante o asedio máis longo da campaña.',
    mapId: 'fortress',
    difficulty: 'hard',
    objective: 'survive',
    duration: 120,
    starScore: 4300,
    sector: 'LIÑA DE DEFENSA',
    next: ['command-gate'],
    reward: { category: 'ultimate', id: 'aegis', name: 'Protocolo Égida' },
  },
  {
    id: 'command-gate',
    title: 'A porta de mando',
    briefing: 'Rompe o cerco e elimina a garda de elite da fortaleza.',
    mapId: 'fortress',
    difficulty: 'hard',
    objective: 'eliminate',
    enemies: 32,
    starScore: 4600,
    sector: 'CERCO INTERIOR',
    next: ['cobalt-heart'],
    reward: { category: 'ultimate', id: 'overdrive', name: 'Sobrecarga' },
  },
  {
    id: 'cobalt-heart',
    title: 'O corazón de cobalto',
    briefing: 'Abre paso polo delta e destrúe o tanque fortaleza.',
    mapId: 'delta',
    difficulty: 'hard',
    objective: 'boss',
    enemies: 36,
    starScore: 5600,
    sector: 'NÚCLEO INIMIGO',
    next: [],
    reward: { category: 'paint', id: 'cobalt', name: 'Pintura Cobalto' },
  },
  {
    id: 'ghost-rescue',
    title: 'A columna fantasma',
    briefing: 'Localiza os superviventes, actívaos e escolta a columna ata a extracción.',
    mapId: 'marsh',
    difficulty: 'hard',
    objective: 'rescue',
    enemies: 24,
    targets: [[4.5, 7.5], [10.5, 7.5]],
    extraction: [5.5, 1.5],
    starScore: 3900,
    sector: 'OPERACIÓN OPCIONAL',
    next: ['command-gate'],
    reward: { category: 'turret', id: 'tesla', name: 'Torreta Tesla' },
  },
]);

export const GARAGE_PARTS = Object.freeze({
  chassis: Object.freeze({
    vanguard: { name: 'Vangarda', description: 'Equilibrio, blindaxe reforzada.', hp: 1, speed: 1, scale: 1, color: '#3ddc97' },
    scout: { name: 'Lince', description: 'Moi veloz, menor blindaxe.', hp: -1, speed: 1.22, scale: .9, color: '#4cc9f0' },
    bulwark: { name: 'Baluarte', description: 'Blindaxe pesada e gran tamaño.', hp: 3, speed: .82, scale: 1.14, color: '#ffd166' },
  }),
  turret: Object.freeze({
    cannon: { name: 'Canón MK-II', description: 'Preciso e fiable.', weapon: 'cannon', reload: .9, damage: 0 },
    repeater: { name: 'Repetidora', description: 'Cadencia alta con proxectís lixeiros.', weapon: 'rapid', reload: .82, damage: 0 },
    siege: { name: 'Asedio', description: 'Munición pesada e recarga lenta.', weapon: 'heavy', reload: 1.15, damage: 1 },
    tesla: { name: 'Tesla', description: 'Descargas que saltan entre inimigos.', weapon: 'tesla', reload: 1.05, damage: 0 },
  }),
  engine: Object.freeze({
    standard: { name: 'Estándar', description: 'Resposta estable en todo terreo.', speed: 1, traction: 1, charge: 1 },
    turbine: { name: 'Turbina', description: 'Aceleración e velocidade superiores.', speed: 1.13, traction: .92, charge: 1 },
    traction: { name: 'Tracción', description: 'Ignora case toda penalización do terreo.', speed: 1.02, traction: .35, charge: 1 },
  }),
  ultimate: Object.freeze({
    artillery: { name: 'Bombardeo', description: 'Ataque masivo sobre todos os inimigos.' },
    aegis: { name: 'Égida', description: 'Escudos para o equipo e o núcleo.' },
    overdrive: { name: 'Sobrecarga', description: 'Velocidade e disparo extremos durante 10 s.' },
  }),
});

export const DEFAULT_LOADOUT = Object.freeze({ chassis: 'vanguard', turret: 'cannon', engine: 'standard', ultimate: 'artillery' });
export const STARTER_PARTS = Object.freeze({ chassis: ['vanguard'], turret: ['cannon'], engine: ['standard'], ultimate: ['artillery'], paint: ['standard'] });
export const RUN_PERKS = Object.freeze({
  warheads: { name: 'Ogivas reforzadas', description: '+1 de dano aos proxectís.' },
  fieldArmor: { name: 'Blindaxe de campaña', description: '+1 de vida durante esta ruta.' },
  cooling: { name: 'Refrixeración', description: '-12% de tempo de recarga.' },
  magnet: { name: 'Imán de recuperación', description: 'Recolle obxectos a maior distancia.' },
});

export function normalizeLoadout(value = {}, unlocked = STARTER_PARTS) {
  return Object.fromEntries(Object.entries(DEFAULT_LOADOUT).map(([category, fallback]) => {
    const selected = value?.[category];
    return [category, GARAGE_PARTS[category]?.[selected] && unlocked?.[category]?.includes(selected) ? selected : fallback];
  }));
}

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
