import * as THREE from 'three';

/** GPU-batched lightweight pickup/deposit effects; deliberately no per-scrap rigid bodies. */
interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}
export class Effects {
  private readonly max = 144;
  private readonly particles: Particle[] = [];
  private readonly dummy = new THREE.Object3D();
  private readonly mesh: THREE.InstancedMesh;
  private next = 0;
  private activeBudget = this.max;
  private wasActive = true;
  getParticleBudget() { return this.activeBudget; }
  setQuality(q: 'eco' | 'balanced' | 'crisp') {
    this.activeBudget = q === 'eco' ? 48 : q === 'balanced' ? 96 : this.max;
    this.mesh.count = this.activeBudget;
  }
  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(.12, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .9, depthWrite: false, blending: THREE.AdditiveBlending }),
      this.max
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < this.max; i++) {
      this.particles.push({ position: new THREE.Vector3(), velocity: new THREE.Vector3(), life: 0, maxLife: 1, size: .05 });
      this.dummy.position.set(0, -100, 0);
      this.dummy.scale.setScalar(0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    scene.add(this.mesh);
  }

  burst(position: THREE.Vector3, color: number, count = 9, power = 1) {
    const tint = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.next++ % this.activeBudget;
      const p = this.particles[i];
      const phi = Math.random() * Math.PI * 2;
      const height = .2 + Math.random() * 1.4;
      const speed = (2 + Math.random() * 3) * power;
      p.position.copy(position);
      p.position.y += (Math.random() - .5) * .22;
      p.velocity.set(Math.cos(phi) * speed, height * speed, Math.sin(phi) * speed);
      p.maxLife = .28 + Math.random() * .5;
      p.life = p.maxLife;
      p.size = .55 + Math.random() * .9;
      this.mesh.setColorAt(i, tint);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number) {
    const step = Math.min(dt, .05);
    // Entirely idle effects need no per-frame matrix upload.
    let active = false;
    for (let i = 0; i < this.activeBudget; i++) {
      const p = this.particles[i];
      if (p.life > 0) {
        active = true;
        p.life = Math.max(0, p.life - step);
        p.position.addScaledVector(p.velocity, step);
        p.velocity.y -= 11 * step;
      }
      this.dummy.position.copy(p.position);
      const fraction = p.maxLife ? p.life / p.maxLife : 0;
      this.dummy.scale.setScalar(p.size * Math.min(1, fraction * 3) * (fraction > 0 ? 1 : 0));
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (active || this.wasActive) this.mesh.instanceMatrix.needsUpdate = true;
    this.wasActive = active;
  }
}
