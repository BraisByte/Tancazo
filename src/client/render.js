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
      if (!mesh.position.y) mesh.position.y = tile === 'W' ? -.01 : .36;
      mesh.traverse((object) => { if (object.isMesh) { object.castShadow = tile !== 'W'; object.receiveShadow = true; } });
      this.tileGroup.add(mesh);
    }
    this.lookTarget.set(map.width / 2, 0, map.height / 2);
    this.camera.lookAt(this.lookTarget);
    this.setupWeather(map);
  }

  setupWeather(map) {
    this.weatherGroup.clear();
    const count = map.id === 'delta' ? 220 : map.id === 'foundry' ? 90 : 45;
    const positions = new Float32Array(count * 3);
    for (let index = 0; index < count; index++) {
      positions[index * 3] = Math.random() * map.width;
      positions[index * 3 + 1] = .4 + Math.random() * 10;
      positions[index * 3 + 2] = Math.random() * map.height;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const color = map.id === 'foundry' ? 0xff7b35 : map.id === 'delta' ? 0xa7e6ff : 0xc4e4d2;
    const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: map.id === 'delta' ? .045 : .065, transparent: true, opacity: .55 }));
    points.userData.mode = map.id === 'foundry' ? 'embers' : map.id === 'delta' ? 'rain' : 'dust';
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
      } else {
        positions[index] += dt * .12;
        if (positions[index] > 15) positions[index] = 0;
      }
    }
    points.geometry.attributes.position.needsUpdate = true;
  }

  makeTank(tank) {
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
    group.userData.barrel = barrel;
    group.userData.tracks = [leftTrack, rightTrack];
    group.traverse((object) => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } });
    group.userData.kind = tank.kind;
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
    const colors = { repair: 0x61e786, shield: 0x4cc9f0, rapid: 0xffd166, bomb: 0xff5d73, heavy: 0xff9f43, ricochet: 0x75d5ff, rocket: 0xff315c };
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
      if (object.userData.core) object.rotation.y += dt * 1.7;
    });
    this.renderer.render(this.scene, this.camera);
  }
}
