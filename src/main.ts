import * as THREE from 'three';
import { createYard, type MaterialType, type Scrap, type Yard } from './world';
import './style.css';
import { Effects } from './effects';
import { VisualPolish } from './visual-polish';
import { GamePlatform } from './platform';

type Upgrade = 'radius' | 'capacity' | 'handling';
type Levels = Record<Upgrade, number>;
const SAVE_KEY = 'magnet-yard-scrap-rush-save-v1';
type GraphicsQuality = 'eco' | 'balanced' | 'crisp';
const MAX_LEVEL = 5;
const RUSH_DURATION = 18;
const RUSH_BONUS = 70;
const CACHE_TIMES = [12, 40, 68];
const CACHE_DURATION = 16;
const CACHE_POSITIONS: [number, number][] = [[-4, -4], [7, 4], [3, -9]];
const UPGRADES: { id: Upgrade; title: string; icon: string; description: string; cost: number }[] = [
  { id: 'radius', title: 'Magnet Radius', icon: '\u{1F9F2}', description: 'Reach more scrap without getting close', cost: 45 },
  { id: 'capacity', title: 'Cargo Capacity', icon: '\u{1F4E6}', description: 'Carry more metal before banking', cost: 60 },
  { id: 'handling', title: 'Thruster Handling', icon: '\u{1F680}', description: 'Move faster with heavy cargo', cost: 55 },
];
type ContractMetric = 'deposits' | 'coins' | 'copper' | 'alloy';
const CONTRACTS: { name: string; metric: ContractMetric; target: number; bonus: number }[] = [
  { name: 'Recycle 2 cargo loads', metric: 'deposits', target: 2, bonus: 40 },
  { name: 'Bank 160 scrap coins', metric: 'coins', target: 160, bonus: 65 },
  { name: 'Recycle 8 copper pieces', metric: 'copper', target: 8, bonus: 80 },
  { name: 'Bank 4 rare alloy cores', metric: 'alloy', target: 4, bonus: 100 },
  { name: 'Recycle 5 cargo loads', metric: 'deposits', target: 5, bonus: 125 },
  { name: 'Bank 360 scrap coins', metric: 'coins', target: 360, bonus: 150 }
];
const element = <T extends HTMLElement>(id: string): T => {
  const result = document.getElementById(id);
  if (!result) throw new Error('Missing UI element: ' + id);
  return result as T;
};

class Sound {
  private ctx: AudioContext | null = null;
  muted = false;
  unlock() {
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state !== 'running' && this.ctx.state !== 'closed') void this.ctx.resume().catch(() => {});
    } catch { /* Audio is optional. */ }
  }
  play(kind: 'pickup' | 'bank' | 'hit' | 'upgrade' | 'end') {
    if (this.muted) return;
    try {
      this.ctx ??= new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      const ctx = this.ctx;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      const base = kind === 'pickup' ? 530 : kind === 'bank' ? 710 : kind === 'upgrade' ? 850 : kind === 'hit' ? 140 : 390;
      oscillator.type = kind === 'hit' ? 'sawtooth' : 'sine';
      oscillator.frequency.setValueAtTime(base, ctx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'hit' ? 65 : base * 1.45, ctx.currentTime + .13);
      gain.gain.setValueAtTime(.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(.07, ctx.currentTime + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + .19);
      oscillator.connect(gain).connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + .2);
    } catch { /* WebAudio is optional if blocked by browser policy. */ }
  }
}

class ScrapRush {
  private yard: Yard;
  private sound = new Sound();
  private effects: Effects;
  private visualPolish: VisualPolish;
  private platform = new GamePlatform();
  private contractIndex = 0;
  private contractProgress = 0;
  private instability = 0;
  private surgeRemaining = 0;
  private surgeCooldown = 0;
  private bestCoins = 0;
  private shifts = 0;
  private rushSeconds = 0;
  private rushAvailable = true;
  private sprintAnnounced = false;
  private nextCacheWave = 0;
  private cacheCountdown = 0;
  private activeCache: Scrap | null = null;
  private quality: GraphicsQuality = 'balanced';
  private fpsFrames = 0;
  private fpsTime = 0;
  private keys = new Set<string>();
  private velocity = new THREE.Vector3();
  private cargo: Scrap[] = [];
  private coins = 0;
  private levels: Levels = { radius: 0, capacity: 0, handling: 0 };
  private time = 90;
  private elapsed = 0;
  private runCoins = 0;
  private deposits = 0;
  private running = true;
  private paused = true;
  private started = false;
  private shopOpen = false;
  private shopFromEnd = false;
  private lastFrame = 0;
  private accumulator = 0;
  private depositCooldown = 0;
  private damageCooldown = 0;
  private lastKind: MaterialType | null = null;
  private streak = 0;
  private pointerTarget: THREE.Vector3 | null = null;
  private pointerActive = false;
  private stickX = 0;
  private stickY = 0;
  private toastUntil = 0;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private cameraDesired = new THREE.Vector3();
  private recyclerScreen = new THREE.Vector3();
  private droneScreen = new THREE.Vector3();

  constructor() {
    this.yard = createYard(element('game'));
    this.effects = new Effects(this.yard.scene);
    this.visualPolish = new VisualPolish(this.yard);
    this.load();
    element('introBest').textContent = this.bestCoins.toLocaleString('en-IN');
    element('introShifts').textContent = String(this.shifts);
    element<HTMLSelectElement>('quality').value = this.quality;
    this.applyQuality();
    this.bindInput();
    this.bindUI();
    document.addEventListener('pointerup', () => this.sound.unlock());
    document.addEventListener('keydown', () => this.sound.unlock());
    this.refreshShop();
    this.refreshHUD();
    this.resize();
    // The SDK can initialize on the menu, but actual gameplay starts on user input.
    void this.platform.initialize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running && this.started && !this.paused && !this.shopOpen) this.pause();
    });
    // Only in local Vite development: deterministic navigation for real browser QA.
    // Vite removes this branch from the production build.
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __magnetYardQaWarp: (x: number, z: number) => {
          this.velocity.set(0, 0, 0);
          this.pointerTarget = null;
          this.yard.drone.position.set(x, 0, z);
        },
        __magnetYardQaSetTime: (seconds: number) => {
          // DEV-only deterministic boundary test; never included in production.
          this.time = Math.max(0, Math.min(90, seconds));
        },
        __magnetYardQaSetElapsed: (seconds: number) => {
          this.elapsed = Math.max(0, Math.min(90, seconds));
        },
        __magnetYardQaRenderStats: () => ({
          geometries: this.yard.renderer.info.memory.geometries,
          textures: this.yard.renderer.info.memory.textures,
          drawCalls: this.yard.renderer.info.render.calls,
          pixelRatio: this.yard.renderer.getPixelRatio(),
          particleInstances: this.effects.getParticleBudget()
        })
      });
    }
    requestAnimationFrame((time) => this.frame(time));
  }

  private get cargoMass() { return this.cargo.reduce((sum, item) => sum + item.mass, 0); }
  private get capacity() { return 18 + this.levels.capacity * 5; }
  private get radius() { return 3.7 + this.levels.radius * .72; }

  private load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data: unknown = JSON.parse(raw);
      if (!data || typeof data !== 'object') return;
      const record = data as { coins?: unknown; levels?: Partial<Record<Upgrade, unknown>>; contractIndex?: unknown; contractProgress?: unknown; bestCoins?: unknown; shifts?: unknown; quality?: unknown };
      if (typeof record.coins === 'number' && Number.isFinite(record.coins)) this.coins = Math.max(0, Math.floor(record.coins));
      if (typeof record.contractIndex === 'number' && Number.isFinite(record.contractIndex)) this.contractIndex = Math.max(0, Math.floor(record.contractIndex));
      if (typeof record.contractProgress === 'number' && Number.isFinite(record.contractProgress)) this.contractProgress = Math.max(0, record.contractProgress);
      if (typeof record.bestCoins === 'number' && Number.isFinite(record.bestCoins)) this.bestCoins = Math.max(0, Math.floor(record.bestCoins));
      if (typeof record.shifts === 'number' && Number.isFinite(record.shifts)) this.shifts = Math.max(0, Math.floor(record.shifts));
      if (record.quality === 'eco' || record.quality === 'balanced' || record.quality === 'crisp') this.quality = record.quality;
      for (const upgrade of UPGRADES) {
        const level = record.levels?.[upgrade.id];
        if (typeof level === 'number' && Number.isFinite(level)) this.levels[upgrade.id] = Math.max(0, Math.min(MAX_LEVEL, Math.floor(level)));
      }
    } catch { /* Browser storage may be unavailable in privacy modes. */ }
  }

  private save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ coins: this.coins, levels: this.levels, contractIndex: this.contractIndex, contractProgress: this.contractProgress, bestCoins: this.bestCoins, shifts: this.shifts, quality: this.quality })); }
    catch { /* Keep the game playable even when storage is blocked. */ }
  }

  private bindInput() {
    window.addEventListener('keydown', (event) => {
      const key = event.key.toLowerCase();
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
      if (!this.started) return;
      this.keys.add(key);
      if (key === 'escape') this.togglePause();
      if (key === 'u' && !this.shopOpen) this.openShop();
      if (key === 'r' && !this.shopOpen) this.restart();
      if (key === ' ' && !event.repeat) this.activateSurge();
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.stickX = 0;
      this.stickY = 0;
      if (this.running && !this.shopOpen) this.pause();
    });

    const canvas = this.yard.renderer.domElement;
    const setTarget = (event: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouse = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      this.raycaster.setFromCamera(mouse, this.yard.camera);
      const target = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.groundPlane, target)) this.pointerTarget = target;
    };
    canvas.addEventListener('pointerdown', (event) => {
      if (this.paused || !this.running) return;
      this.pointerActive = true;
      canvas.setPointerCapture(event.pointerId);
      setTarget(event);
    });
    canvas.addEventListener('pointermove', (event) => { if (this.pointerActive) setTarget(event); });
    const release = () => { this.pointerActive = false; };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    const joystick = element('joystick');
    const stick = element('stick');
    let activeId: number | null = null;
    const moveStick = (event: PointerEvent) => {
      const rect = joystick.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      const max = rect.width * .34;
      const length = Math.max(1, Math.hypot(dx, dy));
      const ratio = Math.min(1, max / length);
      this.stickX = dx * ratio / max;
      this.stickY = dy * ratio / max;
      stick.style.transform = 'translate(' + dx * ratio + 'px,' + dy * ratio + 'px)';
      this.pointerTarget = null;
    };
    joystick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      activeId = event.pointerId;
      joystick.setPointerCapture(event.pointerId);
      moveStick(event);
    });
    joystick.addEventListener('pointermove', (event) => { if (activeId === event.pointerId) moveStick(event); });
    const stopStick = (event: PointerEvent) => {
      if (activeId !== event.pointerId) return;
      activeId = null;
      this.stickX = 0;
      this.stickY = 0;
      stick.style.transform = '';
    };
    joystick.addEventListener('pointerup', stopStick);
    joystick.addEventListener('pointercancel', stopStick);
  }

  private bindUI() {
    element('playGame').addEventListener('click', () => this.startGame());
    element('pause').addEventListener('click', () => this.togglePause());
    element('mute').addEventListener('click', () => {
      this.sound.muted = !this.sound.muted;
      element('mute').textContent = this.sound.muted ? '✕' : '♫';
      element('mute').setAttribute('aria-label', this.sound.muted ? 'Unmute game sounds' : 'Mute game sounds');
    });
    element('resume').addEventListener('click', () => this.resume());
    element<HTMLSelectElement>('quality').addEventListener('change', () => {
      const next = element<HTMLSelectElement>('quality').value;
      if (next !== 'eco' && next !== 'balanced' && next !== 'crisp') return;
      this.quality = next;
      this.applyQuality();
      this.save();
    });
    element('restartPause').addEventListener('click', () => this.restart());
    element('upgrades').addEventListener('click', () => this.openShop());
    element('closeShop').addEventListener('click', () => this.closeShop());
    element('playAgain').addEventListener('click', () => this.restart());
    element('endShop').addEventListener('click', () => this.openShop());
    element('surge').addEventListener('click', () => this.activateSurge());
  }

  private startGame() {
    if (this.started || !this.running) return;
    this.started = true;
    this.paused = false;
    element('introOverlay').classList.add('hidden');
    this.platform.play();
    this.refreshHUD();
  }

  private activateSurge() {
    if (!this.running || this.paused || this.shopOpen || this.surgeCooldown > 0 || this.surgeRemaining > 0) return;
    this.surgeRemaining = 3.5;
    this.surgeCooldown = 16.5;
    this.sound.play('upgrade');
    this.effects.burst(this.yard.drone.position.clone().add(new THREE.Vector3(0, 1.35, 0)), 0x75f5ff, 36, 1.8);
    this.showToast('MAGNET SURGE! Greater pull range for 3.5 seconds.');
    this.refreshHUD();
  }

  private pause() {
    if (!this.started || !this.running || this.shopOpen) return;
    this.paused = true;
    this.platform.stop();
    element('pauseOverlay').classList.remove('hidden');
  }
  private resume() {
    if (!this.started || !this.running) return;
    this.paused = false;
    this.platform.play();
    element('pauseOverlay').classList.add('hidden');
  }
  private togglePause() {
    if (!this.started) return;
    if (this.paused && !this.shopOpen && this.running) this.resume();
    else this.pause();
  }

  private openShop() {
    if (this.shopOpen) return;
    this.shopFromEnd = !this.running;
    this.shopOpen = true;
    this.paused = true;
    this.platform.stop();
    element('pauseOverlay').classList.add('hidden');
    element('endOverlay').classList.add('hidden');
    element('shopOverlay').classList.remove('hidden');
    this.refreshShop();
  }
  private closeShop() {
    this.shopOpen = false;
    element('shopOverlay').classList.add('hidden');
    if (this.shopFromEnd) element('endOverlay').classList.remove('hidden');
    else { this.paused = false; this.platform.play(); }
  }
  private refreshShop() {
    const parent = element('shopItems');
    parent.replaceChildren();
    for (const upgrade of UPGRADES) {
      const level = this.levels[upgrade.id];
      const cost = Math.round(upgrade.cost * Math.pow(1.7, level));
      const row = document.createElement('div');
      row.className = 'shop-item';
      const symbol = document.createElement('div');
      symbol.className = 'shop-symbol';
      symbol.textContent = upgrade.icon;
      const detail = document.createElement('div');
      detail.className = 'shop-detail';
      const name = document.createElement('strong');
      name.textContent = upgrade.title + ' - LV ' + level + '/' + MAX_LEVEL;
      const description = document.createElement('small');
      description.textContent = upgrade.description;
      detail.append(name, description);
      const button = document.createElement('button');
      button.textContent = level === MAX_LEVEL ? 'MAXED' : cost + ' COINS';
      button.disabled = level === MAX_LEVEL || this.coins < cost;
      button.addEventListener('click', () => {
        if (this.coins < cost || this.levels[upgrade.id] >= MAX_LEVEL) return;
        this.coins -= cost;
        this.levels[upgrade.id]++;
        this.save();
        this.sound.play('upgrade');
        this.refreshShop();
        this.refreshHUD();
      });
      row.append(symbol, detail, button);
      parent.appendChild(row);
    }
  }

  private restart() {
    this.running = true;
    this.started = true;
    this.paused = false;
    element('introOverlay').classList.add('hidden');
    this.platform.play();
    this.shopOpen = false;
    this.shopFromEnd = false;
    this.time = 90;
    this.elapsed = 0;
    this.runCoins = 0;
    this.deposits = 0;
    this.depositCooldown = 0;
    this.damageCooldown = 0;
    this.streak = 0;
    this.lastKind = null;
    this.instability = 0;
    this.surgeRemaining = 0;
    this.surgeCooldown = 0;
    this.rushSeconds = 0;
    this.rushAvailable = true;
    this.sprintAnnounced = false;
    this.nextCacheWave = 0;
    this.cacheCountdown = 0;
    this.activeCache = null;
    this.cargo = [];
    this.velocity.set(0, 0, 0);
    this.pointerTarget = null;
    this.yard.drone.position.set(-11, 0, -1);
    for (const scrap of this.yard.scraps) {
      if (scrap.kind === 'gold') {
        scrap.state = 'dormant';
        scrap.mesh.visible = false;
      } else this.yard.scatter(scrap);
    }
    for (let i = 0; i < 5; i++) this.yard.scraps[i].mesh.position.set(-8 + i * 1.15, .47, -1.5 + (i % 2) * 1.8);
    for (const id of ['endOverlay', 'pauseOverlay', 'shopOverlay']) element(id).classList.add('hidden');
    this.showToast('New shift! Collect, bank, upgrade.');
    this.refreshHUD();
  }

  private frame(timeMs: number) {
    const dt = Math.min(.05, this.lastFrame ? (timeMs - this.lastFrame) / 1000 : 1 / 60);
    this.lastFrame = timeMs;
    // Do not burn mobile GPU cycles when the user backgrounds the browser.
    // The visibility-change listener pauses the shift and requires manual resume.
    if (document.hidden) {
      this.accumulator = 0;
      requestAnimationFrame((time) => this.frame(time));
      return;
    }
    if (this.running && !this.paused) {
      this.accumulator = Math.min(.12, this.accumulator + dt);
      let steps = 0;
      while (this.running && !this.paused && this.accumulator >= 1 / 60 && steps++ < 5) {
        this.step(1 / 60);
        this.accumulator -= 1 / 60;
      }
    } else this.accumulator = 0;
    this.animateScene(dt);
    this.effects.update(dt);
    this.visualPolish.update(dt, this.velocity, this.surgeRemaining > 0 || this.finalSprint);
    this.yard.renderer.render(this.yard.scene, this.yard.camera);
    if (this.running && !this.paused) {
      this.fpsFrames++;
      this.fpsTime += dt;
      if (this.fpsTime >= 1) {
        const fps = Math.round(this.fpsFrames / this.fpsTime);
        element('fps').textContent = fps + ' FPS';
        this.fpsFrames = 0;
        this.fpsTime = 0;
      }
    } else {
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    requestAnimationFrame((t) => this.frame(t));
  }

  private get finalSprint() {
    return this.started && this.running && this.time > 0 && this.time <= 20;
  }

  private step(dt: number) {
    this.elapsed += dt;
    this.time = Math.max(0, this.time - dt);
    this.depositCooldown = Math.max(0, this.depositCooldown - dt);
    this.damageCooldown = Math.max(0, this.damageCooldown - dt);
    this.surgeRemaining = Math.max(0, this.surgeRemaining - dt);
    this.surgeCooldown = Math.max(0, this.surgeCooldown - dt);
    if (this.rushSeconds > 0) {
      this.rushSeconds = Math.max(0, this.rushSeconds - dt);
      if (this.rushSeconds === 0) this.showToast('PRIORITY EXPIRED. Normal recycling still pays.');
    }
    if (this.time <= 0) { this.endRun(); return; }
    if (this.finalSprint && !this.sprintAnnounced) {
      this.sprintAnnounced = true;
      this.showToast('FINAL SPRINT! 20 seconds of stronger magnet and 25% bank bonus!');
      this.effects.burst(this.yard.drone.position, 0xffd47b, 35, 1.2);
    }
    // Each timed salvage drop appears once per shift. Existing cargo and the
    // recycler remain unchanged. Expiration never removes already collected cargo.
    if (this.activeCache !== null) {
      this.cacheCountdown = Math.max(0, this.cacheCountdown - dt);
      if (this.cacheCountdown === 0) {
        if (this.activeCache.state === 'ground' || this.activeCache.state === 'pull') {
          this.activeCache.state = 'dormant';
          this.activeCache.mesh.visible = false;
          this.showToast('GOLD DROP EXPIRED - another chance later in this shift.');
        }
        this.activeCache = null;
      }
    }
    if (!this.activeCache && this.nextCacheWave < CACHE_TIMES.length &&
        this.elapsed >= CACHE_TIMES[this.nextCacheWave]) {
      const index = this.nextCacheWave++;
      const cache = this.yard.goldCaches[index];
      cache.mesh.position.set(CACHE_POSITIONS[index][0], .65, CACHE_POSITIONS[index][1]);
      cache.mesh.visible = true;
      cache.state = 'ground';
      this.activeCache = cache;
      this.cacheCountdown = CACHE_DURATION;
      this.showToast('GOLDEN SALVAGE DROP! Find the glowing core!');
      this.effects.burst(cache.mesh.position, 0xffd87a, 28, 1.4);
    }

    const x = Number(this.keys.has('d') || this.keys.has('arrowright')) - Number(this.keys.has('a') || this.keys.has('arrowleft'));
    const z = Number(this.keys.has('s') || this.keys.has('arrowdown')) - Number(this.keys.has('w') || this.keys.has('arrowup'));
    const input = new THREE.Vector3(x, 0, z);
    if (input.lengthSq() > .001) this.pointerTarget = null;
    else if (Math.hypot(this.stickX, this.stickY) > .1) input.set(this.stickX, 0, this.stickY);
    else if (this.pointerTarget) {
      input.subVectors(this.pointerTarget, this.yard.drone.position);
      input.y = 0;
      if (input.length() < .35) { input.set(0, 0, 0); this.pointerTarget = null; }
    }
    if (input.lengthSq() > 1) input.normalize();
    const speed = (8.8 + this.levels.handling * 1.25) / (1 + this.cargoMass * .023) *
      (this.surgeRemaining > 0 ? 1.14 : this.finalSprint ? 1.08 : 1);
    const desired = input.multiplyScalar(speed);
    // Fully loaded cargo becomes unstable during abrupt reversing or sharp turns.
    if (this.cargoMass > this.capacity * .7 && this.velocity.lengthSq() > 5 && desired.lengthSq() > 5) {
      const alignment = this.velocity.clone().normalize().dot(desired.clone().normalize());
      this.instability = Math.max(0, Math.min(1, this.instability + dt * (alignment < -.25 ? 1.9 : alignment < .25 ? .55 : -.3)));
    } else this.instability = Math.max(0, this.instability - dt * .32);
    if (this.instability > .98 && this.cargo.length > 2) {
      const loose = this.cargo.pop()!;
      loose.state = 'ground';
      loose.mesh.position.set(this.yard.drone.position.x + 1.1, .47, this.yard.drone.position.z + 1.2);
      this.instability = .38;
      this.streak = 0;
      this.lastKind = null;
      this.showToast('CARGO UNSTABLE! Ease into sharp turns.');
      this.sound.play('hit');
      this.effects.burst(loose.mesh.position, 0xffb066, 16);
    }
    this.velocity.lerp(desired, Math.min(1, dt * (7 + this.levels.handling * .8)));
    this.yard.drone.position.addScaledVector(this.velocity, dt);
    this.yard.drone.position.x = THREE.MathUtils.clamp(this.yard.drone.position.x, -21, 21);
    this.yard.drone.position.z = THREE.MathUtils.clamp(this.yard.drone.position.z, -18, 18);
    if (this.velocity.lengthSq() > .5) {
      const targetYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
      let delta = (targetYaw - this.yard.drone.rotation.y + Math.PI * 3) % (Math.PI * 2) - Math.PI;
      this.yard.drone.rotation.y += delta * Math.min(1, dt * 7);
    }

    const magnetTarget = new THREE.Vector3(this.yard.drone.position.x, 1.4, this.yard.drone.position.z);
    let freeMass = this.capacity - this.cargoMass;
    for (const scrap of this.yard.scraps) {
      if (scrap.state === 'cargo' || scrap.state === 'dormant') continue;
      const distance = scrap.mesh.position.distanceTo(magnetTarget);
      if (distance < this.radius * (this.surgeRemaining > 0 ? 1.55 : this.finalSprint ? 1.25 : 1) && scrap.mass <= freeMass + .001) {
        scrap.state = 'pull';
        const step = Math.min(1, dt * (6.2 + this.levels.radius * 1.1) * (this.surgeRemaining > 0 ? 1.6 : 1) / Math.max(.7, distance));
        scrap.mesh.position.lerp(magnetTarget, step);
        scrap.mesh.rotation.y += dt * 6;
        if (scrap.mesh.position.distanceTo(magnetTarget) < .75) {
          this.capture(scrap);
          freeMass -= scrap.mass;
        }
      } else if (scrap.state === 'pull') {
        scrap.state = 'ground';
        scrap.mesh.position.y = .47;
      }
    }

    if (this.yard.drone.position.distanceTo(new THREE.Vector3(-15, 0, 0)) < 3.05 && this.cargo.length && this.depositCooldown === 0) this.deposit();
    for (const crusher of this.yard.crushers) {
      if (crusher.press.position.y < 2.1 && Math.hypot(this.yard.drone.position.x - crusher.x, this.yard.drone.position.z - crusher.z) < 1.8 && this.damageCooldown === 0) {
        this.damageCooldown = 2.2;
        this.time = Math.max(0, this.time - 4);
        const lost = this.cargo.splice(Math.max(0, this.cargo.length - 3), 3);
        for (const item of lost) {
          item.state = 'ground';
          item.mesh.position.set(this.yard.drone.position.x + (this.yard.random() - .5) * 5, .47, this.yard.drone.position.z + (this.yard.random() - .5) * 5);
        }
        this.streak = 0;
        this.lastKind = null;
        this.sound.play('hit');
        this.effects.burst(this.yard.drone.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xff8e50, 36, 1.6);
        this.showToast('CRUSHER HIT! Lost ' + lost.length + ' scrap, -4 sec');
      }
    }
    if (this.elapsed > this.toastUntil) element('toast').classList.remove('show');
    this.refreshHUD();
  }

  private capture(scrap: Scrap) {
    scrap.state = 'cargo';
    if (scrap.kind === 'gold' && this.activeCache === scrap) {
      this.activeCache = null;
      this.cacheCountdown = 0;
      this.showToast('GOLD CORE SECURED! Bank safely for 60+ coins.');
    }
    this.effects.burst(scrap.mesh.position, scrap.kind === 'alloy' ? 0xc5a4ff : scrap.kind === 'copper' || scrap.kind === 'gold' ? 0xffb865 : 0x80eff1, scrap.kind === 'alloy' || scrap.kind === 'gold' ? 12 : 6);
    scrap.phase = this.cargo.length * 2.399;
    this.cargo.push(scrap);
    if (this.lastKind === scrap.kind) this.streak++;
    else { this.lastKind = scrap.kind; this.streak = 1; }
    scrap.bonus = 1 + Math.min(4, this.streak - 1) * .2;
    if (this.streak >= 3) this.showToast('MAGNET CHAIN x' + scrap.bonus.toFixed(1));
    else if (this.cargo.length === 1) this.showToast('Scrap captured! Bank it at the blue station.');
    // First banking teaches the loop, then rare alloy activates an optional risk/reward delivery.
    if (scrap.kind === 'alloy' && this.deposits >= 1 && this.rushAvailable && this.rushSeconds === 0) {
      this.rushAvailable = false;
      this.rushSeconds = RUSH_DURATION;
      this.showToast('PRIORITY LOAD! Bank rare alloy within 18 seconds!');
    }
    this.sound.play('pickup');
  }

  private deposit() {
    const baseReward = Math.round(this.cargo.reduce((sum, item) => sum + item.value * item.bonus, 0));
    const sprintBonus = this.finalSprint ? Math.round(baseReward * .25) : 0;
    const reward = baseReward + sprintBonus;
    const rushAwarded = this.rushSeconds > 0 && this.cargo.some((item) => item.kind === 'alloy');
    const rushBonus = rushAwarded ? RUSH_BONUS : 0;
    if (rushAwarded) this.rushSeconds = 0;
    this.coins += reward + rushBonus;
    this.runCoins += reward + rushBonus;
    this.effects.burst(new THREE.Vector3(-15, 1.3, 0), 0x5affdb, 45, 1.45);
    const currentContract = CONTRACTS[this.contractIndex % CONTRACTS.length];
    const increment = currentContract.metric === 'deposits' ? 1 :
      currentContract.metric === 'coins' ? reward :
      this.cargo.filter((item) => item.kind === currentContract.metric).length;
    this.contractProgress += increment;
    const contractComplete = this.contractProgress >= currentContract.target;
    if (contractComplete) {
      this.coins += currentContract.bonus;
      this.contractIndex++;
      this.contractProgress = 0;
    }
    this.deposits++;
    for (const scrap of this.cargo) {
      if (scrap.kind === 'gold') {
        scrap.state = 'dormant';
        scrap.mesh.visible = false;
      } else this.yard.scatter(scrap);
    }
    this.cargo = [];
    this.streak = 0;
    this.lastKind = null;
    this.instability = 0;
    this.depositCooldown = 1.3;
    this.save();
    this.sound.play('bank');
    this.showToast(
      contractComplete ?
        'CONTRACT DONE! +' + currentContract.bonus + (rushAwarded ? ' | PRIORITY +' + rushBonus : '') :
        rushAwarded ? 'PRIORITY DELIVERED! +' + (reward + rushBonus) + ' COINS' :
          '+' + reward + ' COINS SECURED!' + (sprintBonus ? ' | FINAL SPRINT +' + sprintBonus : '')
    );
    this.refreshShop();
  }

  private endRun() {
    // Once the shift closes, later frame callbacks must not award extra shifts.
    if (!this.running) return;
    this.running = false;
    this.paused = true;
    this.shifts++;
    const newRecord = this.runCoins > this.bestCoins;
    if (newRecord) this.bestCoins = this.runCoins;
    element('bestCoins').textContent = this.bestCoins.toLocaleString('en-IN') + (newRecord ? ' NEW!' : '');
    element('shiftCount').textContent = String(this.shifts);
    const rank = this.runCoins >= 400 ? 'GOLD' : this.runCoins >= 170 ? 'SILVER' : this.runCoins >= 60 ? 'BRONZE' : 'TRAINEE';
    element('rank').textContent = rank;
    element('rank').setAttribute('data-grade', rank.toLowerCase());
    this.platform.stop();
    const unbanked = this.cargo.length;
    element('runCoins').textContent = String(this.runCoins);
    element('runSummary').textContent = this.deposits + ' deposits completed. ' + unbanked + ' unbanked scrap lost. Your permanent upgrades carry over.';
    element('endOverlay').classList.remove('hidden');
    this.sound.play('end');
    this.save();
  }

  private showToast(message: string) {
    const toast = element('toast');
    toast.textContent = message;
    toast.classList.add('show');
    this.toastUntil = this.elapsed + 2;
  }

  private refreshHUD() {
    element('coins').textContent = this.coins.toLocaleString('en-IN');
    const cachePanel = element('cachePanel');
    const goldCargo = this.cargo.filter((s) => s.kind === 'gold').length;
    cachePanel.classList.toggle('hidden', this.activeCache === null && goldCargo === 0);
    if (this.activeCache) {
      element('cacheState').textContent = 'DROP ACTIVE';
      element('cacheTime').textContent = Math.ceil(this.cacheCountdown) + 's';
      const dx = this.activeCache.mesh.position.x - this.yard.drone.position.x;
      const dz = this.activeCache.mesh.position.z - this.yard.drone.position.z;
      element('cacheHint').textContent = Math.round(Math.hypot(dx, dz)) + 'm away - collect before time runs out';
    } else if (goldCargo) {
      element('cacheState').textContent = 'CORE LOADED';
      element('cacheTime').textContent = 'x' + goldCargo;
      element('cacheHint').textContent = 'Return to the recycler to secure your gold!';
    }
    const rushPanel = element('rushPanel');
    rushPanel.classList.toggle('hidden', this.rushSeconds <= 0);
    if (this.rushSeconds > 0) {
      element('rushTimer').textContent = Math.ceil(this.rushSeconds) + 's';
      element('rushFill').style.width = (this.rushSeconds / RUSH_DURATION * 100).toFixed(1) + '%';
    }
    const surge = element<HTMLButtonElement>('surge');
    surge.disabled = !this.running || this.paused || this.surgeCooldown > 0;
    surge.classList.toggle('active', this.surgeRemaining > 0);
    surge.textContent = this.surgeRemaining > 0 ? 'SURGE ' + Math.ceil(this.surgeRemaining) + 's' :
      this.surgeCooldown > 0 ? 'RECHARGE ' + Math.ceil(this.surgeCooldown) + 's' : 'MAGNET SURGE';
    surge.setAttribute('aria-label', this.surgeRemaining > 0 ? 'Magnet Surge active' :
      this.surgeCooldown > 0 ? 'Magnet Surge recharging' : 'Activate Magnet Surge');
    element('timer').textContent = String(Math.ceil(this.time));
    element('timer').parentElement?.classList.toggle('sprint-active', this.finalSprint);
    element('capacity').textContent = this.cargoMass.toFixed(1) + ' / ' + this.capacity;
    element('cargoBar').style.width = Math.min(100, this.cargoMass / this.capacity * 100) + '%';
    const combo = this.cargo.length ? this.cargo[this.cargo.length - 1].bonus : 1;
    element('combo').textContent = 'x' + combo.toFixed(1);
    element('comboBar').style.width = Math.min(100, this.streak / 5 * 100) + '%';
    element('cargoHint').textContent = this.instability > .55 ? 'WARNING: Sharp turns spill cargo!' : this.cargoMass > this.capacity * .65 ? 'Heavy cargo slows your thrusters' : 'Light cargo = faster drone';
    element('riskBar').style.width = (this.instability * 100).toFixed(0) + '%';
    const currentContract = CONTRACTS[this.contractIndex % CONTRACTS.length];
    element('contractName').textContent = currentContract.name;
    element('contractProgress').textContent = Math.min(currentContract.target, Math.floor(this.contractProgress)) + '/' + currentContract.target;
    element('contractBar').style.width = Math.min(100, this.contractProgress / currentContract.target * 100) + '%';
    element('contractReward').textContent = '+' + currentContract.bonus;
    const dx = -15 - this.yard.drone.position.x;
    const dz = -this.yard.drone.position.z;
    element('beaconDistance').textContent = Math.round(Math.hypot(dx, dz)) + 'm';
    this.recyclerScreen.set(-15, 0, 0).project(this.yard.camera);
    this.droneScreen.copy(this.yard.drone.position).project(this.yard.camera);
    element('beaconArrow').style.transform = 'rotate(' + Math.atan2(this.recyclerScreen.x - this.droneScreen.x, this.recyclerScreen.y - this.droneScreen.y) + 'rad)';
    this.yard.magnetRing.scale.setScalar((1 + this.levels.radius * .12) * (this.surgeRemaining > 0 ? 1.55 : this.finalSprint ? 1.25 : 1));
    element('objectiveText').textContent = this.finalSprint ?
      'FINAL SPRINT: stronger magnet, +25% recycling value! Bank now!' :
      this.cargoMass > this.capacity * .65 ? 'Heavy cargo! Return to the blue recycler.' :
        this.cargo.length ? 'Collect more, or bank your cargo at the blue recycler' :
          'Fly near scrap to attract it with your magnet';
  }

  private animateScene(dt: number) {
    const t = this.elapsed;
    this.yard.drone.position.y = Math.sin(t * 4) * .075;
    this.yard.drone.rotation.z = THREE.MathUtils.lerp(this.yard.drone.rotation.z, -this.velocity.x * .018, Math.min(1, dt * 6));
    this.yard.drone.rotation.x = THREE.MathUtils.lerp(this.yard.drone.rotation.x, this.velocity.z * .016, Math.min(1, dt * 6));
    this.yard.magnetRing.rotation.z += dt * .65;
    const material = this.yard.magnetRing.material as THREE.MeshBasicMaterial;
    material.color.setHex(this.surgeRemaining > 0 ? 0xffd67d : 0x56f7e5);
    material.opacity = .5 + Math.sin(t * 5) * .2;
    this.yard.recyclerRing.rotation.z += dt * .28;
    for (let i = 0; i < this.yard.goldCaches.length; i++) {
      const cache = this.yard.goldCaches[i];
      if (cache.mesh.visible && cache.state === 'ground') {
        cache.mesh.rotation.y += dt * 2.1;
        cache.mesh.position.y = .67 + Math.sin(t * 4.3 + i * 2) * .12;
      }
    }
    for (const crusher of this.yard.crushers) {
      crusher.press.position.y = 2.25 + Math.sin(t * 3 + crusher.phase) * .9;
      const danger = crusher.press.position.y < 2.1;
      (crusher.warning.material as THREE.MeshBasicMaterial).color.setHex(danger ? 0xff3b31 : 0xffcd54);
      crusher.warning.scale.setScalar(danger ? 1 + .045 * Math.sin(t * 17) : 1);
    }
    for (let i = 0; i < this.cargo.length; i++) {
      const item = this.cargo[i];
      const angle = t * (1.8 + i % 3 * .12) + item.phase;
      const radius = 1.6 + Math.floor(i / 8) * .5;
      item.mesh.position.set(this.yard.drone.position.x + Math.cos(angle) * radius, 1.5 + Math.sin(t * 3 + item.phase) * .22, this.yard.drone.position.z + Math.sin(angle) * radius);
      item.mesh.rotation.y += dt * 2;
    }
    // More legible in both recorded desktop and portrait mobile views.
    const portrait = window.innerHeight > window.innerWidth;
    this.cameraDesired.set(
      this.yard.drone.position.x + (portrait ? 9.2 : 12.2),
      17,
      this.yard.drone.position.z + (portrait ? 18.3 : 20.6)
    );
    this.yard.camera.position.lerp(this.cameraDesired, Math.min(1, dt * 3.5));
    this.yard.camera.lookAt(this.yard.drone.position.x, 0, this.yard.drone.position.z);
  }

  private applyQuality() {
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const cap = this.quality === 'eco' ? 1 : this.quality === 'balanced' ? (coarse ? 1.25 : 1.5) : (coarse ? 1.65 : 2);
    this.yard.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.visualPolish.setQuality(this.quality);
    // Lower background particle overdraw and ensure an appropriate mobile pixel budget.
    this.effects.setQuality(this.quality);
    this.resize();
  }

  private resize() {
    const root = element('game');
    const width = Math.max(1, root.clientWidth);
    const height = Math.max(1, root.clientHeight);
    this.yard.camera.aspect = width / height;
    this.yard.camera.fov = width < height ? 59 : 47;
    this.yard.camera.updateProjectionMatrix();
    this.yard.renderer.setSize(width, height);
  }
}

try {
  new ScrapRush();
} catch (error) {
  console.error('Game startup failed', error);
  const intro = element('introOverlay');
  intro.replaceChildren();
  const title = document.createElement('h1');
  title.textContent = '3D graphics unavailable';
  const message = document.createElement('p');
  message.textContent = 'This game needs WebGL2. Enable graphics acceleration in your browser settings, then reload. You can also try a current Chrome or Edge browser on another device. Your saved progress has not been reset.';
  intro.append(title, message);
}
