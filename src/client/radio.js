const ITEMS = { freeze: 'Conxelador', bomb: 'Bomba', emp: 'Pulso electromagnético', mine: 'Mina', decoy: 'Engado', repair: 'Reparación', fortress: 'Fortaleza' };
export function radioMessage(effect, rank = 1) {
  const messages = {
    ultimate: 'Habilidade especial activada.', critical: 'Unidade danada. Protexe a parte traseira.',
    rescue: 'Supervivente localizado. Escolta ata a saída.', revive: 'Unidade recuperada.',
    boss: 'Alerta. O xefe cambia de fase.',
  };
  if (messages[effect.type]) return messages[effect.type];
  if (effect.type === 'rank') return `Ascenso ao rango ${rank}.`;
  if (effect.type === 'pickup') return ITEMS[effect.powerup] ? `${ITEMS[effect.powerup]} dispoñible.` : 'Armamento recollido.';
  return ITEMS[effect.type] ? `${ITEMS[effect.type]} en uso.` : '';
}

export function radioCatalog() {
  const catalog = { preview: 'Unidade danada. Busca cobertura.' };
  for (const type of ['ultimate', 'critical', 'rescue', 'revive', 'boss']) catalog[type] = radioMessage({ type });
  for (let rank = 1; rank <= 5; rank++) catalog[`rank-${rank}`] = radioMessage({ type: 'rank' }, rank);
  for (const type of Object.keys(ITEMS)) {
    catalog[`pickup-${type}`] = radioMessage({ type: 'pickup', powerup: type });
    catalog[`use-${type}`] = radioMessage({ type });
  }
  catalog.armament = radioMessage({ type: 'pickup', powerup: 'cannon' });
  return catalog;
}
