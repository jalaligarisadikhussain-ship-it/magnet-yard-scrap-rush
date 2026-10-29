import * as THREE from 'three';

export type MaterialType = 'steel' | 'copper' | 'alloy' | 'gold';
export interface Scrap {
  mesh: THREE.Group;
  kind: MaterialType;
  mass: number;
  value: number;
  state: 'ground' | 'pull' | 'cargo' | 'dormant';
  bonus: number;
  phase: number;
}
export interface Crusher { x: number; z: number; phase: number; press: THREE.Mesh; warning: THREE.Mesh; }
export interface Yard {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  drone: THREE.Group;
  magnetRing: THREE.Mesh;
  recyclerRing: THREE.Mesh;
  scraps: Scrap[];
  goldCaches: Scrap[];
  crushers: Crusher[];
  random: () => number;
  scatter: (item: Scrap) => void;
}

// Reuse immutable material instances rather than compiling separate GPU shaders
// for repeated steel, copper, road and salvage color palettes.
const metalMaterials = new Map<string, THREE.MeshStandardMaterial>();
const matteMaterials = new Map<number, THREE.MeshStandardMaterial>();
const unitCube = new THREE.BoxGeometry(1, 1, 1);
const metal = (color: number, emissive = 0x000000) => {
  const key = color + ':' + emissive;
  let material = metalMaterials.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, metalness: .68, roughness: .34, emissive, emissiveIntensity: .42 });
    metalMaterials.set(key, material);
  }
  return material;
};
const matte = (color: number) => {
  let material = matteMaterials.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, metalness: .12, roughness: .8 });
    matteMaterials.set(color, material);
  }
  return material;
};

function block(parent: THREE.Object3D, x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(unitCube, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

// Repeat salvage is a common scene object: shared immutable geometry + materials
// reduces GPU upload/memory without changing an individual pickup's visibility.
const copperRingGeometry = new THREE.TorusGeometry(.3, .11, 7, 12);
const alloyCoreGeometry = new THREE.OctahedronGeometry(.42);
const alloyBandGeometry = new THREE.TorusGeometry(.48, .045, 6, 16);
const alloyHaloGeometry = new THREE.TorusGeometry(.63, .042, 6, 18);
const alloySignalGeometry = new THREE.CylinderGeometry(.04, .04, .85, 6);
const goldCoreGeometry = new THREE.DodecahedronGeometry(.52, 0);
const goldHaloGeometry = new THREE.TorusGeometry(.66, .07, 6, 18);
const goldStarGeometry = new THREE.ConeGeometry(.16, .55, 5);
const sharedAlloyHaloMaterial = new THREE.MeshBasicMaterial({ color: 0xd2a8ff, transparent: true, opacity: .88, depthWrite: false });
const sharedAlloySignalMaterial = new THREE.MeshBasicMaterial({ color: 0xa99aff, transparent: true, opacity: .34, depthWrite: false });
const sharedGoldCoreMaterial = new THREE.MeshStandardMaterial({ color: 0xffcb62, metalness: .7, roughness: .24, emissive: 0xc07816, emissiveIntensity: .7 });
const sharedGoldHaloMaterial = new THREE.MeshBasicMaterial({ color: 0xffe79c, transparent: true, opacity: .95, depthWrite: false });
const sharedGoldStarMaterial = new THREE.MeshBasicMaterial({ color: 0xffe8a2 });

function createScrap(kind: MaterialType): Scrap {
  const group = new THREE.Group();
  let mass = 1, value = 5;
  if (kind === 'steel') {
    const m = metal(0x8cb5c0, 0x16424d);
    block(group, 0, 0, 0, .7, .25, .42, m);
    block(group, .14, .2, 0, .3, .2, .42, m);
  } else if (kind === 'copper') {
    mass = 1.4; value = 9;
    const ring = new THREE.Mesh(copperRingGeometry, metal(0xe99552, 0x4a2108));
    ring.rotation.x = Math.PI / 2.4;
    ring.castShadow = true;
    group.add(ring);
    block(group, 0, 0, 0, .18, .3, .18, metal(0xf1bb7a));
  } else if (kind === 'gold') {
    mass = 2.6; value = 60;
    const core = new THREE.Mesh(
      goldCoreGeometry,
      sharedGoldCoreMaterial
    );
    core.castShadow = true;
    group.add(core);
    const halo = new THREE.Mesh(
      goldHaloGeometry,
      sharedGoldHaloMaterial
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -.29;
    group.add(halo);
    const star = new THREE.Mesh(
      goldStarGeometry,
      sharedGoldStarMaterial
    );
    star.position.y = .72;
    group.add(star);
  } else {
    mass = 2.4; value = 18;
    const core = new THREE.Mesh(alloyCoreGeometry, metal(0xc3b2f7, 0x4c229c));
    core.castShadow = true;
    group.add(core);
    const band = new THREE.Mesh(alloyBandGeometry, metal(0x99f7ed, 0x00d5cc));
    band.rotation.x = Math.PI / 2;
    group.add(band);
    const halo = new THREE.Mesh(alloyHaloGeometry, sharedAlloyHaloMaterial);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = -.24;
    group.add(halo);
    const signal = new THREE.Mesh(alloySignalGeometry, sharedAlloySignalMaterial);
    signal.position.y = .62;
    group.add(signal);
  }
  return { mesh: group, kind, mass, value, state: 'ground', bonus: 1, phase: 0 };
}

export function createYard(root: HTMLElement): Yard {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x102632);
  scene.fog = new THREE.Fog(0x102632, 30, 76);

  const camera = new THREE.PerspectiveCamera(51, 1, .1, 130);
  camera.position.set(17, 23, 24);

  const mobile = window.matchMedia('(pointer: coarse)').matches;
  const renderer = new THREE.WebGLRenderer({ antialias: !mobile, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.3 : 1.75));
  renderer.setSize(root.clientWidth, root.clientHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;
  renderer.shadowMap.enabled = !mobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  root.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xaedff3, 0x14232b, 2.2));
  const sun = new THREE.DirectionalLight(0xffd5a4, 3);
  sun.position.set(-16, 29, 15);
  sun.castShadow = !mobile;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -31;
  sun.shadow.camera.right = 31;
  sun.shadow.camera.top = 31;
  sun.shadow.camera.bottom = -31;
  scene.add(sun);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(50, 46), matte(0x29404a));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const grid = new THREE.GridHelper(46, 23, 0x42707a, 0x37545c);
  grid.position.y = .018;
  (grid.material as THREE.Material).transparent = true;
  (grid.material as THREE.Material).opacity = .3;
  scene.add(grid);

  // Roads and lane markings guide the player back to the recycler.
  const road = block(scene, -1, .022, 0, 36, .035, 5.4, matte(0x233640));
  road.receiveShadow = true;
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xf1bc60 });
  for (let x = -16; x < 19; x += 3.4) block(scene, x, .05, 0, 1.6, .015, .09, lineMat);

  const containerColors = [0x366274, 0x996242, 0x355762, 0x536478];
  for (let i = 0; i < 15; i++) {
    const x = -20 + (i % 5) * 9.5;
    const z = i < 5 ? -20 : i < 10 ? 20 : (i % 2 ? -19 : 19);
    const height = 2.4 + (i % 3) * .7;
    const box = block(scene, x, height / 2, z, 4.5, height, 2.7, metal(containerColors[i % 4]));
    box.rotation.y = (i % 4) * .04;
    for (let s = -1; s <= 1; s++) block(scene, x + s * 1.1, height / 2, z + 1.38, .055, height * .85, .04, matte(0x9eb2b3));
  }

  // Salvage stacks and small industrial details stay mostly outside driving lanes.
  for (let i = 0; i < 28; i++) {
    const angle = i * 2.399;
    const radius = 17.3 + (i % 4) * 1.15;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const h = .4 + (i % 4) * .25;
    const junk = block(scene, x, h / 2, z, .7 + (i % 3) * .4, h, .8, metal(i % 2 ? 0x577985 : 0x9b754d));
    junk.rotation.y = angle;
  }

  // Stylized gantry cranes and directional strips improve scene depth and orientation.
  const cranePaint = metal(0xf1a746, 0x43270a);
  const craneDark = metal(0x3b5a67);
  for (const [cx, cz] of [[-5, -18], [14, 18]] as [number, number][]) {
    block(scene, cx - 2.5, 3.05, cz, .45, 6.1, .5, cranePaint);
    block(scene, cx + 2.5, 3.05, cz, .45, 6.1, .5, cranePaint);
    block(scene, cx, 6.08, cz, 5.5, .47, .65, craneDark);
    block(scene, cx, 6.4, cz, 4.8, .12, .32, cranePaint);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(.22, .09, 7, 12), cranePaint);
    hook.position.set(cx + .6, 3.95, cz);
    scene.add(hook);
    block(scene, cx + .6, 5, cz, .07, 2.35, .07, craneDark);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x8ff9eb }));
    lamp.position.set(cx - 2.5, 6.25, cz);
    scene.add(lamp);
  }
  for (const ax of [-11, -7, -3]) {
    for (const offset of [-.33, .33]) {
      const mark = block(scene, ax + offset, .09, 0, .5, .025, .12,
        new THREE.MeshBasicMaterial({ color: 0x68ddd3 }));
      mark.rotation.y = offset < 0 ? -.48 : .48;
    }
  }

  const recycler = new THREE.Group();
  recycler.position.set(-15, 0, 0);
  scene.add(recycler);
  const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.15, 3.3, .35, 32), metal(0x284a54));
  platform.position.y = .12;
  platform.receiveShadow = true;
  recycler.add(platform);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.78, .12, 9, 48), new THREE.MeshStandardMaterial({ color: 0x5affdf, emissive: 0x12b6b0, emissiveIntensity: 2, metalness: .3, roughness: .3 }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .33;
  recycler.add(ring);
  for (let a = 0; a < 4; a++) {
    const theta = a * Math.PI / 2;
    const x = Math.cos(theta) * 2.6, z = Math.sin(theta) * 2.6;
    block(recycler, x, .9, z, .38, 1.7, .38, metal(0x5a7e89));
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.19, 10, 8), new THREE.MeshBasicMaterial({ color: 0x75ffe2 }));
    lamp.position.set(x, 1.82, z);
    recycler.add(lamp);
  }
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 5, 8), new THREE.MeshBasicMaterial({ color: 0x51f2e5, transparent: true, opacity: .42 }));
  beacon.position.set(0, 3.4, 0);
  recycler.add(beacon);
  const beaconCap = new THREE.Mesh(new THREE.OctahedronGeometry(.58), metal(0x8cfdeb, 0x2cddc5));
  beaconCap.position.y = 5.9;
  recycler.add(beaconCap);

  const drone = new THREE.Group();
  drone.position.set(-11, 0, -1);
  scene.add(drone);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(.8, 1.05, .55, 8), metal(0x335466));
  body.rotation.y = Math.PI / 8;
  body.position.y = 1.38;
  body.castShadow = true;
  drone.add(body);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(.55, 16, 12), metal(0x78a3b6, 0x123c50));
  dome.scale.y = .45;
  dome.position.y = 1.75;
  drone.add(dome);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(.65, .16, .13), new THREE.MeshBasicMaterial({ color: 0x83f6e5 }));
  eye.position.set(0, 1.45, -.84);
  drone.add(eye);
  for (let a = 0; a < 4; a++) {
    const t = a * Math.PI / 2;
    const x = Math.cos(t) * .9, z = Math.sin(t) * .9;
    const pod = new THREE.Mesh(new THREE.SphereGeometry(.29, 12, 8), metal(0x3a5966, 0x096a7a));
    pod.position.set(x, 1.25, z);
    drone.add(pod);
    const jet = new THREE.Mesh(new THREE.ConeGeometry(.12, .55, 9), new THREE.MeshBasicMaterial({ color: 0x53f4e5, transparent: true, opacity: .62 }));
    jet.rotation.z = Math.PI;
    jet.position.set(x, .78, z);
    drone.add(jet);
  }
  const magnetRing = new THREE.Mesh(new THREE.TorusGeometry(1.45, .055, 8, 60), new THREE.MeshBasicMaterial({ color: 0x56f7e5, transparent: true, opacity: .78 }));
  magnetRing.rotation.x = Math.PI / 2;
  magnetRing.position.y = 1.4;
  drone.add(magnetRing);

  const crushers: Crusher[] = [];
  for (const [i, point] of [[0, [10, -6]], [1, [14, 8]]] as [number, number[]][]) {
    const [x, z] = point;
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, .16, 24), metal(0x6b4237));
    pad.position.set(x, .12, z);
    scene.add(pad);
    const warning = new THREE.Mesh(new THREE.TorusGeometry(2.02, .12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff8a4d }));
    warning.rotation.x = Math.PI / 2;
    warning.position.set(x, .22, z);
    scene.add(warning);
    block(scene, x - 2.2, 2.1, z, .42, 4.2, .5, metal(0x596d70));
    block(scene, x + 2.2, 2.1, z, .42, 4.2, .5, metal(0x596d70));
    block(scene, x, 4.15, z, 4.7, .45, .7, metal(0x677a7d));
    const press = block(scene, x, 2.2, z, 3.2, .65, 2.8, metal(0xdf764f, 0x48170a));
    crushers.push({ x, z, phase: i * 2.4, press, warning });
  }

  let seed = 734261;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const scraps: Scrap[] = [];
  const scatter = (item: Scrap) => {
    let x = 0, z = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
      x = -12 + random() * 30;
      z = -15 + random() * 30;
      if (Math.hypot(x + 15, z) > 4.6 && Math.hypot(x - 10, z + 6) > 1.1) break;
    }
    item.mesh.position.set(x, .47, z);
    item.mesh.rotation.set(0, random() * Math.PI * 2, 0);
    item.state = 'ground';
    item.bonus = 1;
  };
  for (let i = 0; i < 65; i++) {
    const kind: MaterialType = i % 11 === 0 ? 'alloy' : i % 3 === 0 ? 'copper' : 'steel';
    const item = createScrap(kind);
    scatter(item);
    scene.add(item.mesh);
    scraps.push(item);
  }
  // Guaranteed nearby pickups in the first few seconds.
  for (let i = 0; i < 5; i++) {
    scraps[i].mesh.position.set(-8 + i * 1.15, .47, -1.5 + (i % 2) * 1.8);
  }

  // Three one-time golden salvage drops are activated only by timed shift waves.
  const goldCaches: Scrap[] = [];
  for (let i = 0; i < 3; i++) {
    const cache = createScrap('gold');
    cache.mesh.position.set(0, .65, 0);
    cache.mesh.visible = false;
    cache.state = 'dormant';
    scene.add(cache.mesh);
    goldCaches.push(cache);
    scraps.push(cache);
  }
  return { scene, camera, renderer, drone, magnetRing, recyclerRing: ring, scraps, goldCaches, crushers, random, scatter };
}
