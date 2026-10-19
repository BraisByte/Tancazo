import * as THREE from '/vendor/three/build/three.module.js';

const palette = {
  ground: 0x132d3c,
  grid: 0x1b4150,
  brick: 0xd66b3d,
  brickTop: 0xff9f5b,
  steel: 0x7598a6,
  water: 0x138da5,
  grass: 0x37a866,
  base: 0xffdc73,
  ice: 0x9edff2,
  mud: 0x5b4631,
  bridge: 0xa87546,
};

function material(color, roughness = .72, metalness = .05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

export class GameRenderer {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08131f);
    this.scene.fog = new THREE.Fog(0x08131f, 18, 29);
    this.camera = new THREE.OrthographicCamera(-9, 9, 9, -9, .1, 60);
    this.camera.position.set(12, 18, 17);
    this.camera.lookAt(7.5, 0, 7.5);
    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.tileGroup = new THREE.Group();
    this.entityGroup = new THREE.Group();
    this.weatherGroup = new THREE.Group();
    this.world.add(this.tileGroup, this.entityGroup, this.weatherGroup);
    this.meshes = new Map();
    this.effects = [];
    this.seenEffects = new Set();
    this.shake = 0;
    this.shakeEnabled = true;
    this.lookTarget = new THREE.Vector3(7.5, 0, 7.5);
    this.cameraHome = this.camera.position.clone();
    this.fxGeometry = new THREE.BoxGeometry(.11, .11, .11);
    this.fxMaterials = {
      brick: new THREE.MeshBasicMaterial({ color: 0xffa15c }),
      spark: new THREE.MeshBasicMaterial({ color: 0xdffaff }),
      hit: new THREE.MeshBasicMaterial({ color: 0xffee88 }),
      boom: new THREE.MeshBasicMaterial({ color: 0xff593f }),
      base: new THREE.MeshBasicMaterial({ color: 0x7fffd4 }),
      pickup: new THREE.MeshBasicMaterial({ color: 0x8dffbd }),
      boss: new THREE.MeshBasicMaterial({ color: 0xff315c }),
      rank: new THREE.MeshBasicMaterial({ color: 0xffdc73 }),
      freeze: new THREE.MeshBasicMaterial({ color: 0x8fe7ff }),
      emp: new THREE.MeshBasicMaterial({ color: 0xc69cff }),
      mine: new THREE.MeshBasicMaterial({ color: 0xff733d }),
      decoy: new THREE.MeshBasicMaterial({ color: 0xffdc73 }),
      repair: new THREE.MeshBasicMaterial({ color: 0x61e786 }),
      fortress: new THREE.MeshBasicMaterial({ color: 0x73e8ff }),
      shield: new THREE.MeshBasicMaterial({ color: 0x73e8ff }),
      critical: new THREE.MeshBasicMaterial({ color: 0xff341f }),
      tesla: new THREE.MeshBasicMaterial({ color: 0xc69cff }),
      ultimate: new THREE.MeshBasicMaterial({ color: 0xffdc73 }),
      artillery: new THREE.MeshBasicMaterial({ color: 0xff4d35 }),
      rescue: new THREE.MeshBasicMaterial({ color: 0xf8f2d7 }),
      revive: new THREE.MeshBasicMaterial({ color: 0x47e6a4 }),
      door: new THREE.MeshBasicMaterial({ color: 0xc68b59 }),
      collapse: new THREE.MeshBasicMaterial({ color: 0x8fe7ff }),
    };
    this.mapSignature = '';
    this.predictedInputs = {};
    this.clock = 0;
    this.addLights();
    container.appendChild(this.renderer.domElement);
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  addLights() {
    this.scene.add(new THREE.HemisphereLight(0xc7f5ff, 0x102019, 2.2));
    const sun = new THREE.DirectionalLight(0xfff1cf, 3.1);
    sun.position.set(-7, 18, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -12;
    sun.shadow.camera.right = sun.shadow.camera.top = 12;
    this.scene.add(sun);
  }

  resize() {
    const width = innerWidth;
    const height = innerHeight;
    const aspect = width / height;
    const size = 9.3;
    this.camera.left = -size * aspect;
    this.camera.right = size * aspect;
    this.camera.top = size;
    this.camera.bottom = -size;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  setShakeEnabled(enabled) { this.shakeEnabled = !!enabled; }
  setPredictedInputs(inputs) { this.predictedInputs = inputs || {}; }

  buildMap(map) {
    this.tileGroup.clear();
    const biomes = {
      citadel: { background: 0x08131f, ground: palette.ground, fog: 0x08131f },
      foundry: { background: 0x180d17, ground: 0x38222d, fog: 0x180d17 },
      delta: { background: 0x071927, ground: 0x17394a, fog: 0x071927 },
      glacier: { background: 0x0a1d2d, ground: 0x31566a, fog: 0x9bcde0 },
      marsh: { background: 0x071712, ground: 0x173b2c, fog: 0x193d31 },
      arsenal: { background: 0x190d12, ground: 0x3c2023, fog: 0x190d12 },
      fortress: { background: 0x0c0c16, ground: 0x242637, fog: 0x0c0c16 },
    };
    const biome = biomes[map.id] || biomes.citadel;
    this.scene.background.setHex(biome.background);
    this.scene.fog.color.setHex(biome.fog);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(map.width, .32, map.height), material(biome.ground));
    floor.position.set(map.width / 2, -.2, map.height / 2);
    floor.receiveShadow = true;
    this.tileGroup.add(floor);
    const grid = new THREE.GridHelper(map.width, map.width, palette.grid, palette.grid);
    grid.position.set(map.width / 2, -.025, map.height / 2);
    this.tileGroup.add(grid);
    for (let row = 0; row < map.height; row++) for (let col = 0; col < map.width; col++) {
      const tile = map.tiles[row][col];
      if (tile === '.') continue;
      let mesh;
      if (tile === 'B') {
        const side = material(palette.brick);
        const top = material(palette.brickTop);
        mesh = new THREE.Group();
        const mask = map.brickMasks?.[`${row}:${col}`] ?? 15;
        for (let quadrant = 0; quadrant < 4; quadrant++) if (mask & (1 << quadrant)) {
          const block = new THREE.Mesh(new THREE.BoxGeometry(.42, .72, .42), [side, side, top, side, side, side]);
          block.position.set(quadrant % 2 ? .23 : -.23, 0, quadrant > 1 ? .23 : -.23);
          const edges = new THREE.LineSegments(new THREE.EdgesGeometry(block.geometry), new THREE.LineBasicMaterial({ color: 0x6d2d27, transparent: true, opacity: .45 }));
          block.add(edges); mesh.add(block);
        }
      } else if (tile === 'S') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(.94, .92, .94), material(palette.steel, .26, .75));
      } else if (tile === 'W') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(.96, .08, .96), new THREE.MeshStandardMaterial({ color: palette.water, roughness: .2, metalness: .1, transparent: true, opacity: .86 }));
        mesh.userData.water = true;
      } else if (tile === 'G') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(.9, .13, .9), material(palette.grass));
        mesh.position.y = .08;
      } else if (tile === 'I') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(.96, .06, .96), new THREE.MeshPhysicalMaterial({ color: palette.ice, roughness: .08, metalness: .05, transparent: true, opacity: .72 }));
        mesh.position.y = .02;
      } else if (tile === 'M') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(.96, .08, .96), material(palette.mud, .95));
        mesh.position.y = .02;
      } else if (tile === 'R') {
        mesh = new THREE.Group();
        for (let plank = -2; plank <= 2; plank++) {
          const board = new THREE.Mesh(new THREE.BoxGeometry(.92, .1, .15), material(palette.bridge, .8));
          board.position.set(0, .05, plank * .18); mesh.add(board);
        }
      } else if (tile === 'X') {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(.28, .3, .62, 12), material(0xc94434, .35, .5));
        mesh.userData.barrel = true;
      } else if (tile === 'D') {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(.94, .72, .3), material(0x93633d, .55, .25));
      } else if (tile === 'H') {
        mesh = new THREE.Group();
        const pad = new THREE.Mesh(new THREE.CylinderGeometry(.42, .48, .25, 8), material(palette.base, .4, .4));
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(.27), material(0x7fffd4, .2, .25));
        core.position.y = .42;
        core.userData.core = true;
        mesh.add(pad, core);
      }
      if (!mesh) continue;
      mesh.position.x = col + .5;
      mesh.position.z = row + .5;
      if (!mesh.position.y) mesh.position.y = tile === 'W' ? -.01 : ['I', 'M', 'R'].includes(tile) ? 0 : .36;
      mesh.traverse((object) => { if (object.isMesh) { object.castShadow = tile !== 'W'; object.receiveShadow = true; } });
      this.tileGroup.add(mesh);
    }
    this.lookTarget.set(map.width / 2, 0, map.height / 2);
    this.camera.lookAt(this.lookTarget);
    this.setupWeather(map);
  }

  setupWeather(map) {
    this.weatherGroup.clear();
    const count = map.id === 'delta' ? 220 : map.id === 'glacier' ? 180 : map.id === 'foundry' || map.id === 'arsenal' ? 90 : 45;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = Math.random() * map.width;
      positions[index * 3 + 1] = .4 + Math.random() * 10;
      positions[index * 3 + 2] = Math.random() * map.height;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const color = map.id === 'foundry' || map.id === 'arsenal' ? 0xff7b35 : map.id === 'delta' || map.id === 'glacier' ? 0xa7e6ff : 0xc4e4d2;
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: map.id === 'delta' ? .045 : .065, transparent: true, opacity: .55 }));
    points.userData.mode = map.id === 'foundry' || map.id === 'arsenal' ? 'embers' : map.id === 'delta' ? 'rain' : map.id === 'glacier' ? 'snow' : 'dust';
    points.userData.height = 10;
    this.weatherGroup.add(points);
  }

  updateWeather(dt) {
    const points = this.weatherGroup.children[0];
    if (!points) return;
    const positions = points.geometry.attributes.position.array;
    for (let index = 0; index < positions.length; index += 3) {
      if (points.userData.mode === 'rain') {
        positions[index + 1] -= dt * 8;
        positions[index] -= dt * .8;
        if (positions[index + 1] < .1) positions[index + 1] = points.userData.height;
      } else if (points.userData.mode === 'embers') {
        positions[index + 1] += dt * .7;
        positions[index] += Math.sin(this.clock + index) * dt * .08;
        if (positions[index + 1] > points.userData.height) positions[index + 1] = .1;
      } else if (points.userData.mode === 'snow') {
        positions[index + 1] -= dt * 1.2;
        positions[index] += Math.sin(this.clock + index) * dt * .25;
        if (positions[index + 1] < .1) positions[index + 1] = points.userData.height;
      } else {
        positions[index] += dt * .12;
        if (positions[index] > 15) positions[index] = 0;
      }
    }
    points.geometry.attributes.position.needsUpdate = true;
  }

  makeTank(tank) {
    if (tank.kind === 'weakpoint') {
      const weakpoint = new THREE.Mesh(new THREE.OctahedronGeometry(.25), new THREE.MeshStandardMaterial({ color: 0xffcf56, emissive: 0xff5d31, emissiveIntensity: .85, roughness: .2 }));
      weakpoint.add(new THREE.PointLight(0xff5d31, 1.8, 2.2));
      weakpoint.userData.tracks = [];
      return weakpoint;
    }
    if (tank.kind === 'generator') {
      const group = new THREE.Group();
      const base = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, .35, 10), material(0x68243b, .35, .65));
      base.position.y = .18;
      const coil = new THREE.Mesh(new THREE.TorusGeometry(.25, .07, 8, 20), new THREE.MeshStandardMaterial({ color: 0xff5d73, emissive: 0xff315c, emissiveIntensity: .7 }));
      coil.position.y = .55; coil.rotation.x = Math.PI / 2;
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(.18), new THREE.MeshBasicMaterial({ color: 0xffb0bc }));
      core.position.y = .55;
      group.add(base, coil, core);
      group.userData.tracks = [];
      group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
      return group;
    }
    const group = new THREE.Group();
    const color = new THREE.Color(tank.color);
    const bodyMat = material(color, .48, .28);
    const dark = material(color.clone().multiplyScalar(.42), .72, .2);
    const body = new THREE.Mesh(new THREE.BoxGeometry(.62, .25, .72), bodyMat);
    body.position.y = .25;
    const leftTrack = new THREE.Mesh(new THREE.BoxGeometry(.16, .2, .82), dark);
    const rightTrack = leftTrack.clone();
    leftTrack.position.set(-.36, .2, 0); rightTrack.position.set(.36, .2, 0);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(.22, .27, .18, 10), bodyMat);
    turret.position.y = .45;
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, .52), dark);
    barrel.position.set(0, .47, -.34);
    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(.56, 16, 10),
      new THREE.MeshBasicMaterial({ color: 0x73e8ff, wireframe: true, transparent: true, opacity: .32 }),
    );
    shield.position.y = .28;
    shield.userData.shield = true;
    shield.visible = false;
    group.add(body, leftTrack, rightTrack, turret, barrel, shield);
    if (tank.turret === 'repeater') {
      barrel.position.x = -.09;
      const secondBarrel = barrel.clone(); secondBarrel.position.x = .09; group.add(secondBarrel);
    } else if (tank.turret === 'siege') {
      barrel.scale.set(1.35, 1.35, 1.35);
      turret.scale.set(1.18, 1, 1.18);
    } else if (tank.turret === 'tesla') {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 7, 16), new THREE.MeshBasicMaterial({ color: 0xc69cff }));
      coil.position.y = .58; coil.rotation.x = Math.PI / 2; group.add(coil);
    }
    group.userData.barrel = barrel;
    group.userData.bodyMaterial = bodyMat;
    group.userData.tracks = [leftTrack, rightTrack];
    group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    group.userData.kind = tank.kind;
    group.userData.baseScale = tank.chassisScale || 1;
    if (tank.kind === 'boss') group.scale.setScalar(1.55);
    else if (tank.kind === 'convoy') group.scale.set(1.15, 1.08, 1.45);
    else if (tank.role === 'heavy') group.scale.setScalar(1.12);
    return group;
  }

  makeBullet(bullet) {
    const color = new THREE.Color(bullet.color || (bullet.team === 'players' ? 0x91ffe0 : 0xff6f59));
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(.11, 10, 8), new THREE.MeshBasicMaterial({ color }));
    mesh.add(new THREE.PointLight(color, 1.4, 2));
    return mesh;
  }

  makePowerup(powerup) {
    const colors = { repair: 0x61e786, shield: 0x4cc9f0, rapid: 0xffd166, bomb: 0xff5d73, heavy: 0xff9f43, ricochet: 0x75d5ff, rocket: 0xff315c, freeze: 0x8fe7ff, emp: 0xc69cff, mine: 0xff733d, decoy: 0xffdc73, fortress: 0x73e8ff };
    const group = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(.25, .055, 8, 18),
      new THREE.MeshStandardMaterial({ color: colors[powerup.type], emissive: colors[powerup.type], emissiveIntensity: .45, roughness: .25 }),
    );
    ring.rotation.x = Math.PI / 2;
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(.14), new THREE.MeshBasicMaterial({ color: colors[powerup.type] }));
    group.add(ring, core);
    group.userData.powerup = true;
    group.userData.phase = Math.random() * Math.PI * 2;
    return group;
  }

  makeDeployable(type) {
    if (type === 'mine') {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(.24, .3, .1, 10), material(0xff733d, .4, .65));
      mesh.position.y = .06;
      return mesh;
    }
    const group = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, .55, 8), material(0xffdc73, .5, .45));
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(.16), new THREE.MeshBasicMaterial({ color: 0xffdc73 }));
    beacon.position.y = .38;
    group.add(pole, beacon);
    return group;
  }

  updateEntities(state, dt) {
    const aliveIds = new Set();
    for (const tank of state.tanks.filter((item) => item.alive)) {
      aliveIds.add(tank.id);
      let mesh = this.meshes.get(tank.id);
      if (!mesh) { mesh = this.makeTank(tank); this.meshes.set(tank.id, mesh); this.entityGroup.add(mesh); mesh.position.set(tank.x, 0, tank.z); }
      const input = this.predictedInputs[tank.id];
      const lead = input ? .1 * (tank.speed || 3) : 0;
      const targetX = tank.x + (input?.x || 0) * lead;
      const targetZ = tank.z + (input?.z || 0) * lead;
      mesh.position.x += (targetX - mesh.position.x) * Math.min(1, dt * (input ? 25 : 18));
      mesh.position.z += (targetZ - mesh.position.z) * Math.min(1, dt * (input ? 25 : 18));
      mesh.rotation.y = Math.atan2(-tank.dx, -tank.dz);
      mesh.position.y = Math.sin(this.clock * 5 + tank.x) * .015;
      const shield = mesh.children.find((child) => child.userData.shield);
      if (shield) { shield.visible = tank.shield > 0; shield.rotation.y += dt * 1.8; }
      if (mesh.userData.barrel) mesh.userData.barrel.position.z = -.34 + (tank.recoil || 0) * .1;
      const movement = Math.hypot(tank.vx || 0, tank.vz || 0);
      for (const track of mesh.userData.tracks || []) track.position.y = .2 + Math.sin(this.clock * 18 * movement) * .012;
      if (tank.kind === 'player') mesh.scale.setScalar((mesh.userData.baseScale || 1) * (1 + ((tank.rank || 1) - 1) * .035));
      if (mesh.userData.bodyMaterial) {
        mesh.userData.bodyMaterial.emissive.setHex(tank.burningTimer > 0 ? 0xb52d18 : tank.overdriveTimer > 0 ? 0xf3b61f : tank.frozenTimer > 0 ? 0x258eb5 : tank.empTimer > 0 ? 0x6e32a8 : 0x000000);
        mesh.userData.bodyMaterial.emissiveIntensity = tank.burningTimer > 0 || tank.overdriveTimer > 0 || tank.frozenTimer > 0 || tank.empTimer > 0 ? .7 : 0;
      }
    }
    for (const bullet of state.bullets) {
      aliveIds.add(bullet.id);
      let mesh = this.meshes.get(bullet.id);
      if (!mesh) { mesh = this.makeBullet(bullet); this.meshes.set(bullet.id, mesh); this.entityGroup.add(mesh); }
      mesh.position.set(bullet.x, .34, bullet.z);
    }
    for (const powerup of state.powerups || []) {
      aliveIds.add(powerup.id);
      let mesh = this.meshes.get(powerup.id);
      if (!mesh) { mesh = this.makePowerup(powerup); this.meshes.set(powerup.id, mesh); this.entityGroup.add(mesh); }
      mesh.position.set(powerup.x, .35 + Math.sin(this.clock * 3 + mesh.userData.phase) * .1, powerup.z);
      mesh.rotation.y += dt * 1.9;
    }
    for (const mine of state.mines || []) {
      aliveIds.add(mine.id);
      let mesh = this.meshes.get(mine.id);
      if (!mesh) { mesh = this.makeDeployable('mine'); this.meshes.set(mine.id, mesh); this.entityGroup.add(mesh); }
      mesh.position.x = mine.x; mesh.position.z = mine.z;
    }
    for (const decoy of state.decoys || []) {
      aliveIds.add(decoy.id);
      let mesh = this.meshes.get(decoy.id);
      if (!mesh) { mesh = this.makeDeployable('decoy'); this.meshes.set(decoy.id, mesh); this.entityGroup.add(mesh); }
      mesh.position.set(decoy.x, .05, decoy.z); mesh.rotation.y += dt * 2.8;
    }
    for (const hazard of state.hazards || []) {
      aliveIds.add(hazard.id);
      let mesh = this.meshes.get(hazard.id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.RingGeometry(hazard.radius * .72, hazard.radius, 36), new THREE.MeshBasicMaterial({ color: 0xff315c, side: THREE.DoubleSide, transparent: true, opacity: .72 }));
        mesh.rotation.x = -Math.PI / 2; this.meshes.set(hazard.id, mesh); this.entityGroup.add(mesh);
      }
      mesh.position.set(hazard.x, .035, hazard.z);
      mesh.material.opacity = .28 + Math.abs(Math.sin(this.clock * 9)) * .5;
    }
    if (state.capture) {
      const id = 'capture-marker'; aliveIds.add(id);
      let mesh = this.meshes.get(id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.RingGeometry(.85, 1.05, 32), new THREE.MeshBasicMaterial({ color: 0x47e6a4, side: THREE.DoubleSide, transparent: true, opacity: .65 }));
        mesh.rotation.x = -Math.PI / 2; this.meshes.set(id, mesh); this.entityGroup.add(mesh);
      }
      mesh.position.set(state.capture.x, .025, state.capture.z);
      mesh.material.opacity = .35 + state.capture.progress / state.capture.goal * .55;
    }
    if (state.rescue) {
      const id = 'rescue-marker'; aliveIds.add(id);
      let mesh = this.meshes.get(id);
      if (!mesh) {
        mesh = new THREE.Mesh(new THREE.RingGeometry(.65, .9, 32), new THREE.MeshBasicMaterial({ color: 0xffd166, side: THREE.DoubleSide, transparent: true, opacity: .72 }));
        mesh.rotation.x = -Math.PI / 2; this.meshes.set(id, mesh); this.entityGroup.add(mesh);
      }
      mesh.position.set(state.rescue.extraction[0], .03, state.rescue.extraction[1]);
      mesh.rotation.z += dt * .7;
    }
    for (const [id, mesh] of this.meshes) if (!aliveIds.has(id)) {
      mesh.removeFromParent();
      this.meshes.delete(id);
    }
  }

  spawnEffect(effect, key) {
    if (this.seenEffects.has(key)) return;
    this.seenEffects.add(key);
    const count = effect.type === 'boom' || effect.type === 'base' ? 18 : effect.type === 'brick' ? 9 : 5;
    const material = this.fxMaterials[effect.type] || this.fxMaterials.spark;
    const particles = [];
    for (let index = 0; index < count; index++) {
      const mesh = new THREE.Mesh(this.fxGeometry, material);
      mesh.position.set(effect.x, .28, effect.z);
      const angle = Math.random() * Math.PI * 2;
      const force = .7 + Math.random() * (effect.type === 'boom' ? 2.8 : 1.6);
      particles.push({
        mesh,
        velocity: new THREE.Vector3(Math.cos(angle) * force, .8 + Math.random() * 2.8, Math.sin(angle) * force),
        spin: (Math.random() - .5) * 12,
      });
      this.entityGroup.add(mesh);
    }
    const life = effect.type === 'boom' || effect.type === 'base' ? .7 : .4;
    this.effects.push({ particles, life, maxLife: life });
    if (effect.type === 'boom') this.shake = Math.max(this.shake, .18);
    if (effect.type === 'base') this.shake = Math.max(this.shake, .42);
    if (this.seenEffects.size > 500) this.seenEffects.clear();
  }

  updateEffects(state, dt) {
    (state.effects || []).forEach((effect, index) => this.spawnEffect(effect, `${effect.tick}:${effect.type}:${effect.x}:${effect.z}:${index}`));
    for (const effect of this.effects) {
      effect.life -= dt;
      for (const particle of effect.particles) {
        particle.velocity.y -= 5.8 * dt;
        particle.mesh.position.addScaledVector(particle.velocity, dt);
        particle.mesh.rotation.x += particle.spin * dt;
        particle.mesh.rotation.z += particle.spin * .7 * dt;
        particle.mesh.scale.setScalar(Math.max(.05, effect.life / effect.maxLife));
      }
    }
    for (const effect of this.effects.filter((item) => item.life <= 0)) for (const particle of effect.particles) particle.mesh.removeFromParent();
    this.effects = this.effects.filter((effect) => effect.life > 0);
    this.shake = Math.max(0, this.shake - dt);
    this.camera.position.copy(this.cameraHome);
    if (this.shakeEnabled && this.shake > 0) {
      this.camera.position.x += (Math.random() - .5) * this.shake;
      this.camera.position.z += (Math.random() - .5) * this.shake;
    }
    this.camera.lookAt(this.lookTarget);
  }

  render(state, dt) {
    this.clock += dt;
    const signature = state.map.tiles.map((row) => row.join('')).join('') + JSON.stringify(state.map.brickMasks || {});
    if (signature !== this.mapSignature) {
      this.mapSignature = signature;
      this.buildMap(state.map);
    }
    this.updateEntities(state, dt);
    this.updateEffects(state, dt);
    this.updateWeather(dt);
    this.tileGroup.traverse((object) => {
      if (object.userData.water) object.position.y = -.01 + Math.sin(this.clock * 2.2 + object.position.x) * .025;
      if (object.userData.core) {
        object.rotation.y += dt * 1.7;
        object.scale.setScalar(.72 + Math.max(0, state.baseHp || 0) / Math.max(1, state.baseMaxHp || 3) * .28);
        object.material.emissive.setHex(state.baseShieldTimer > 0 ? 0x2fbfff : 0x000000);
        object.material.emissiveIntensity = state.baseShieldTimer > 0 ? .8 : 0;
      }
    });
    this.renderer.render(this.scene, this.camera);
  }
}
