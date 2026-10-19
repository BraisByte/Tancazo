const held = new Set();
const pressed = new Set();
const touch = new Set();
const pointer = { x: 0, y: 0, active: false, fire: false };
let pointerEnabled = false;
const battlefield = document.querySelector('#game');
export function enablePointer(enabled) {
  pointerEnabled = enabled;
  battlefield.classList.toggle('mouse-aim', enabled);
  if (!enabled) { pointer.active = false; pointer.fire = false; }
}
battlefield.addEventListener('pointermove', (event) => {
  if (!pointerEnabled || event.pointerType !== 'mouse') return;
  pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true;
});
battlefield.addEventListener('pointerdown', (event) => {
  if (!pointerEnabled || event.pointerType !== 'mouse' || event.button !== 0) return;
  pointer.x = event.clientX; pointer.y = event.clientY; pointer.active = true; pointer.fire = true;
});
addEventListener('pointerup', () => { pointer.fire = false; });
battlefield.addEventListener('pointerleave', () => { pointer.active = false; pointer.fire = false; });
addEventListener('pointercancel', () => { pointer.active = false; pointer.fire = false; touch.clear(); });
let bindings = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space', switch: 'KeyQ', use: 'KeyE', ultimate: 'KeyF', touch: true },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Enter', switch: 'ShiftRight', use: 'Slash', ultimate: 'Numpad0' },
];

export function setBindings(next) {
  if (!Array.isArray(next) || next.length < 2) return;
  bindings = next.map((entry, index) => ({ ...bindings[index], ...entry, touch: index === 0 }));
}

export function getBindings() { return bindings.map((entry) => ({ ...entry })); }

addEventListener('keydown', (event) => {
  if (event.target?.matches?.('input, textarea, select')) return;
  if (document.body.classList.contains('playing') && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
  if (!held.has(event.code)) pressed.add(event.code);
  held.add(event.code);
});
addEventListener('keyup', (event) => held.delete(event.code));
addEventListener('blur', () => { held.clear(); pressed.clear(); touch.clear(); pointer.active = false; pointer.fire = false; });

function keyboard(codes) {
  return {
    x: (held.has(codes.right) || codes.touch && touch.has('right') ? 1 : 0) - (held.has(codes.left) || codes.touch && touch.has('left') ? 1 : 0),
    z: (held.has(codes.down) || codes.touch && touch.has('down') ? 1 : 0) - (held.has(codes.up) || codes.touch && touch.has('up') ? 1 : 0),
    fire: held.has(codes.fire) || codes.touch && touch.has('fire'),
    switch: held.has(codes.switch) || codes.touch && touch.has('switch'),
    use: held.has(codes.use) || codes.touch && touch.has('use'),
    ultimate: held.has(codes.ultimate) || codes.touch && touch.has('ultimate'),
    aimX: 0, aimZ: 0,
  };
}

function gamepad(index) {
  const pad = navigator.getGamepads?.()[index];
  if (!pad) return null;
  const dead = (value) => Math.abs(value) > 0.25 ? value : 0;
  const input = {
    x: dead(pad.axes[0] || 0), z: dead(pad.axes[1] || 0),
    aimX: dead(pad.axes[2] || 0), aimZ: dead(pad.axes[3] || 0),
    fire: !!(pad.buttons[0]?.pressed || pad.buttons[7]?.pressed),
    switch: !!pad.buttons[3]?.pressed,
    use: !!pad.buttons[1]?.pressed,
    ultimate: !!pad.buttons[4]?.pressed,
  };
  return Object.values(input).some(Boolean) ? input : null;
}

export function readLocalInputs(playerIds, pointerAim) {
  const controls = [
    keyboard(bindings[0]),
    keyboard(bindings[1]),
  ];
  if (pointerEnabled && pointer.active && pointerAim) {
    const aim = pointerAim(pointer.x, pointer.y);
    if (aim) Object.assign(controls[0], aim, { fire: controls[0].fire || pointer.fire });
  }
  for (let index = 0; index < playerIds.length; index++) controls[index] = gamepad(index) || controls[index] || controls[0];
  return Object.fromEntries(playerIds.map((id, index) => [id, controls[index]]));
}

for (const button of document.querySelectorAll('[data-control]')) {
  const control = button.dataset.control;
  const on = (event) => { event.preventDefault(); touch.add(control); };
  const off = (event) => { event.preventDefault(); touch.delete(control); };
  button.addEventListener('pointerdown', on);
  button.addEventListener('pointerup', off);
  button.addEventListener('pointercancel', off);
  button.addEventListener('pointerleave', off);
}

export function consume(code) {
  const found = pressed.has(code);
  pressed.delete(code);
  return found;
}
