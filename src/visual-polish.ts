import * as THREE from 'three';
import type { Yard } from './world';

/**
 * Original low-poly visual polish.
 * All moving effects are batched and share geometry/materials; no image textures
 * or external copyrighted assets are introduced.
 */
export class VisualPolish {
  private readonly yard: Yard;
  private readonly fins: THREE.Mesh[] = [];
  private readonly fieldRings: THREE.Mesh[] = [];
  private readonly recyclerHalo: THREE.Mesh;
  private readonly dust: THREE.Points;
  private readonly trail: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly hoverLight: THREE.PointLight;
  private readonly history: THREE.Vector3[] = [];
  private readonly motion = new THREE.Vector3();
  private lastPointTime = 0;
  private clock = 0;
  private quality: 'eco' | 'balanced' | 'crisp' = 'balanced';

  constructor(yard: Yard) {
    this.yard = yard;
    const drone = yard.drone;
    const glow = (color: number, opacity = .85) => new THREE.MeshBasicMaterial({
      color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const hull = new THREE.MeshStandardMaterial({
      color: 0x486f89, metalness: .7, roughness: .24, emissive: 0x093d52, emissiveIntensity: .65
    });
    const motor = new THREE.MeshStandardMaterial({
      color: 0x152d3c, metalness: .6, roughness: .35
    });

    // Segmented illuminated armored top and under-chassis scanner.
    const top = new THREE.Mesh(new THREE.TorusGeometry(.67, .07, 8, 32), glow(0x61ebfb, .7));
    top.rotation.x = Math.PI / 2;
    top.position.y = 1.76;
    drone.add(top);
    const underglow = new THREE.Mesh(new THREE.CylinderGeometry(.7, 1, .085, 12), glow(0x41dcca, .26));
    underglow.position.y = .83;
    drone.add(underglow);

    const rotorGeometry = new THREE.BoxGeometry(.62, .035, .13);
    const rotorMaterial = glow(0x86f7dc, .74);
    for (let i = 0; i < 4; i++) {
      const angle = i * Math.PI / 2;
      const px = Math.cos(angle) * .98;
      const pz = Math.sin(angle) * .98;
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, .13, 10), hull);
      cup.position.set(px, 1.39, pz);
      drone.add(cup);
      const fan = new THREE.Mesh(rotorGeometry, rotorMaterial);
      fan.position.set(px, 1.50, pz);
      drone.add(fan);
      this.fins.push(fan);
    }
    const visor = new THREE.Mesh(new THREE.BoxGeometry(.65, .11, .11), glow(0x6ef7f5));
    visor.position.set(0, 1.48, -.93);
    drone.add(visor);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .4, 6), motor);
    antenna.position.set(.39, 2.02, .2);
    drone.add(antenna);
    const signal = new THREE.Mesh(new THREE.IcosahedronGeometry(.13, 0), glow(0xffd99b));
    signal.position.set(.39, 2.26, .2);
    drone.add(signal);

    // Animated transparent geometry indicates magnetic range and power state.
    const ringGeo = new THREE.TorusGeometry(1.84, .025, 4, 54, Math.PI * 1.8);
    for (let i = 0; i < 2; i++) {
      const ring = new THREE.Mesh(ringGeo, glow(i === 0 ? 0x56efe3 : 0x92c5ff, .38));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 1.1 + i * .38;
      ring.rotation.z = i * Math.PI;
      drone.add(ring);
      this.fieldRings.push(ring);
    }

    // Recycler's concentric halo is distinguishable from scrap pickup rings.
    this.recyclerHalo = new THREE.Mesh(
      new THREE.TorusGeometry(3.23, .06, 6, 48, Math.PI * 1.7),
      glow(0x7feee6, .55)
    );
    this.recyclerHalo.rotation.x = Math.PI / 2;
    this.recyclerHalo.position.set(-15, .43, 0);
    yard.scene.add(this.recyclerHalo);

    // Soft dust motes in a single draw call. Hidden for Eco mode.
    const pointCount = 64;
    const vertices = new Float32Array(pointCount * 3);
    for (let i = 0; i < pointCount; i++) {
      const a = i * 2.39996;
      const r = 2.5 + (i * 17 % 43) / 43 * 22;
      vertices[i * 3] = Math.cos(a) * r;
      vertices[i * 3 + 1] = .32 + (i * 37 % 61) / 61 * 4.1;
      vertices[i * 3 + 2] = Math.sin(a) * r;
    }
    const dustGeom = new THREE.BufferGeometry();
    dustGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    this.dust = new THREE.Points(dustGeom, new THREE.PointsMaterial({
      color: 0x8bbdbf, size: .06, transparent: true, opacity: .33,
      depthWrite: false, sizeAttenuation: true
    }));
    yard.scene.add(this.dust);

    // Persistent instanced afterburner particles avoid per-frame mesh creation.
    const count = 13;
    this.trail = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(.16, 0),
      glow(0x60f4d9, .55),
      count
    );
    this.trail.frustumCulled = false;
    this.trail.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < count; i++) {
      const pos = new THREE.Vector3(drone.position.x, -30, drone.position.z);
      this.history.push(pos);
      this.dummy.position.copy(pos);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.trail.setMatrixAt(i, this.dummy.matrix);
    }
    this.trail.instanceMatrix.needsUpdate = true;
    yard.scene.add(this.trail);

    // Tiny localized dynamic light; disable in Eco to reduce mobile shader cost.
    this.hoverLight = new THREE.PointLight(0x6be7f1, 1.25, 3.8);
    this.hoverLight.position.set(0, 1.05, 0);
    drone.add(this.hoverLight);
  }

  setQuality(quality: 'eco' | 'balanced' | 'crisp') {
    this.quality = quality;
    this.dust.visible = quality !== 'eco';
    this.hoverLight.visible = quality === 'crisp';
    this.fieldRings[1].visible = quality !== 'eco';
    this.trail.visible = quality !== 'eco';
  }

  update(dt: number, velocity: THREE.Vector3, surgeActive: boolean) {
    const step = Math.min(.05, Math.max(0, dt));
    this.clock += step;
    const speed = Math.hypot(velocity.x, velocity.z);
    for (let i = 0; i < this.fins.length; i++) {
      this.fins[i].rotation.y += step * (13 + speed * .65) * (i % 2 ? 1 : -1);
    }
    for (let i = 0; i < this.fieldRings.length; i++) {
      const ring = this.fieldRings[i];
      ring.rotation.z += step * (i ? -.8 : 1.1);
      const pulse = 1 + Math.sin(this.clock * 4 + i * 1.4) * .047;
      ring.scale.setScalar(pulse * (surgeActive ? 1.25 : 1));
      (ring.material as THREE.MeshBasicMaterial).color.setHex(
        surgeActive ? 0xffd88e : (i ? 0x92c5ff : 0x56efe3)
      );
    }
    this.recyclerHalo.rotation.z -= step * .36;
    const recyclerMat = this.recyclerHalo.material as THREE.MeshBasicMaterial;
    recyclerMat.opacity = .38 + Math.sin(this.clock * 2.8) * .17;
    if (this.quality !== 'eco') this.dust.rotation.y += step * .002;

    if (this.quality === 'eco') return;
    if (speed > .8) {
      this.lastPointTime += step;
      if (this.lastPointTime >= .04) {
        this.lastPointTime = 0;
        this.motion.copy(velocity).normalize().multiplyScalar(-.62);
        const newPoint = new THREE.Vector3(
          this.yard.drone.position.x + this.motion.x,
          .72,
          this.yard.drone.position.z + this.motion.z
        );
        this.history.pop();
        this.history.unshift(newPoint);
      }
    }
    for (let i = 0; i < this.history.length; i++) {
      const pos = this.history[i];
      this.dummy.position.copy(pos);
      const alpha = 1 - i / this.history.length;
      this.dummy.scale.setScalar(speed > .8 ? .55 * alpha * alpha : 0);
      this.dummy.updateMatrix();
      this.trail.setMatrixAt(i, this.dummy.matrix);
    }
    this.trail.instanceMatrix.needsUpdate = true;
  }
}
