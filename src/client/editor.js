const SIZE = 15;
export const EDITOR_TILES = Object.freeze({
  '.': 'Baleiro', B: 'Ladrillo', S: 'Aceiro', W: 'Auga', G: 'Herba', I: 'Xeo', M: 'Barro', X: 'Barril', D: 'Porta', R: 'Ponte', H: 'Núcleo', P: 'Xogador', E: 'Inimigo',
});

export function defaultDraft() {
  const cells = Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE }, (_, col) => row === 0 || col === 0 || row === SIZE - 1 || col === SIZE - 1 ? 'S' : '.'));
  cells[13][7] = 'H';
  cells[12][5] = 'P'; cells[12][9] = 'P';
  cells[1][1] = 'E'; cells[1][7] = 'E'; cells[1][13] = 'E';
  return cells;
}

export function validateDraft(cells) {
  if (!Array.isArray(cells) || cells.length !== SIZE || cells.some((row) => !Array.isArray(row) || row.length !== SIZE)) return 'O mapa debe medir 15 × 15.';
  const flat = cells.flat();
  if (flat.filter((tile) => tile === 'H').length !== 1) return 'Debe haber exactamente un núcleo.';
  if (!flat.includes('P')) return 'Engade polo menos unha aparición de xogador.';
  if (!flat.includes('E')) return 'Engade polo menos unha aparición inimiga.';
  if (flat.some((tile) => !EDITOR_TILES[tile])) return 'Hai celas cun tipo descoñecido.';
  return null;
}

export function draftToMap(cells, name = 'Campo personalizado') {
  const error = validateDraft(cells);
  if (error) throw new Error(error);
  const playerSpawns = [], enemySpawns = [];
  const rows = cells.map((row, rowIndex) => row.map((tile, colIndex) => {
    if (tile === 'P') { playerSpawns.push([colIndex + .5, rowIndex + .5]); return '.'; }
    if (tile === 'E') { enemySpawns.push([colIndex + .5, rowIndex + .5]); return '.'; }
    return tile;
  }).join(''));
  while (playerSpawns.length < 4) playerSpawns.push([...(playerSpawns[playerSpawns.length - 1] || [7.5, 12.5])]);
  while (enemySpawns.length < 3) enemySpawns.push([...(enemySpawns[enemySpawns.length - 1] || [7.5, 1.5])]);
  return { id: 'custom', name: String(name).slice(0, 30) || 'Campo personalizado', rows, playerSpawns: playerSpawns.slice(0, 4), enemySpawns: enemySpawns.slice(0, 3) };
}

export function mapToDraft(value) {
  const rows = value?.rows;
  if (!Array.isArray(rows) || rows.length !== SIZE || rows.some((row) => typeof row !== 'string' || row.length !== SIZE)) throw new Error('JSON de mapa non válido.');
  const cells = rows.map((row) => [...row]);
  for (const [x, z] of value.playerSpawns || []) cells[Math.floor(z)][Math.floor(x)] = 'P';
  for (const [x, z] of value.enemySpawns || []) cells[Math.floor(z)][Math.floor(x)] = 'E';
  const error = validateDraft(cells);
  if (error) throw new Error(error);
  return cells;
}
