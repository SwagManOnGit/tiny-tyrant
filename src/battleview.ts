// Draws a Sim and turns taps into troop deployments.
import * as THREE from 'three';
import { SpellId, TTYPES } from './data';
import { Gfx, Pointer, Stage, animateUnit, driftClouds, makeStage } from './gfx';
import { C, TEAM, dragonMesh, flatToon, meadow, propMesh, scenery, unitMesh } from './models';
import type { UnitModel } from './models';
import { Ent, Proj, Sim, UnitKind } from './sim';

interface UnitView { mesh: THREE.Mesh; ent: Ent; phase: number }
interface Particle { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; color: number; grav: number }

const MAX_BARS = 900;
const MAX_FX = 500;
const STEP = 1 / 30;

export class BattleView {
  sim: Sim;
  stage: Stage;
  camera: THREE.PerspectiveCamera;
  selected: UnitKind = 'peasant';
  /** Spell armed for the next tap (null = deploying troops). */
  spell: SpellId | null = null;
  /** Asks the game to pay for a spell; returns false when there is not enough mana. */
  onCast: (id: SpellId) => boolean = () => false;
  paused = false;
  onSfx: (name: string) => void = () => {};
  onHint: (text: string) => void = () => {};
  onDone: () => void = () => {};

  private gfx: Gfx;
  private pointer: Pointer;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private units = new Map<number, UnitView>();
  private blds = new Map<number, THREE.Object3D>();
  private dying: { mesh: THREE.Object3D; t: number }[] = [];
  private projs = new Map<Proj, THREE.Mesh>();
  private bars: THREE.InstancedMesh;
  private fx: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private zone: THREE.Mesh;
  private zoneFlash = 0;
  private enemyColor: number;
  private acc = 0;
  private t = 0;
  private done = false;
  private shake = 0;
  private target = new THREE.Vector3();
  private dist: number;
  private intro = 0;
  private hold: { x: number; y: number; t: number; next: number } | null = null;
  private extent: number;
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private col = new THREE.Color();
  private projGeo: Record<Proj['kind'], THREE.BufferGeometry>;
  private projMat: Record<Proj['kind'], THREE.Material>;
  private sfxGate: Record<string, number> = {};
  private meteors: { mesh: THREE.Mesh; x: number; z: number; t: number; dur: number }[] = [];
  private dragon: THREE.Group;
  private frostT = 0;
  /** Buildings waiting to crumble in the shockwave after the keep falls. */
  private falling: { e: Ent; t: number }[] = [];

  constructor(gfx: Gfx, sim: Sim) {
    this.gfx = gfx;
    this.sim = sim;
    const plan = sim.plan;
    this.extent = plan.fieldR + 8;
    this.enemyColor = plan.final ? TEAM.rebel : TEAM.enemy;
    this.stage = makeStage(gfx, this.extent, plan.final ? 0x93cf5a : C.grass);
    const scene = this.stage.scene;
    this.camera = new THREE.PerspectiveCamera(42, gfx.w / gfx.h, 0.5, 1200);
    this.dist = (plan.deployR + 9) * 1.5;
    this.target.set(0, 0, plan.baseR * 0.35);

    const yard = new THREE.Mesh(new THREE.CircleGeometry(plan.baseR, 40), flatToon(C.dirt));
    yard.rotation.x = -Math.PI / 2;
    yard.position.y = 0.02;
    yard.receiveShadow = true;
    scene.add(yard);
    this.zone = new THREE.Mesh(
      new THREE.RingGeometry(plan.baseR, plan.deployR, 56),
      new THREE.MeshBasicMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.26, depthWrite: false }),
    );
    this.zone.rotation.x = -Math.PI / 2;
    this.zone.position.y = 0.04;
    scene.add(this.zone);
    const rim = new THREE.Mesh(
      new THREE.RingGeometry(plan.deployR - 0.28, plan.deployR, 64),
      new THREE.MeshBasicMaterial({ color: 0xe23030, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = 0.05;
    scene.add(rim);
    const edge = new THREE.Mesh(
      new THREE.RingGeometry(plan.fieldR, plan.fieldR + 0.35, 72),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.04;
    scene.add(edge);
    scene.add(meadow(sim.cfg.terr + 40, plan.fieldR + 20, 240, (x, z) => Math.hypot(x, z) < plan.deployR));
    scene.add(scenery(sim.cfg.terr + 70, plan.fieldR + 3, plan.fieldR + 60, 150));

    for (const e of sim.ents) {
      if (e.unit) continue;
      const m = e.type === 'keep' ? propMesh('enemykeep', e.variant, this.enemyColor)
        : e.type === 'tower' ? propMesh('tower', 0, this.enemyColor)
        : e.type === 'camp' ? propMesh('rebelcamp', 0, this.enemyColor)
        : propMesh('hut', e.variant % 2, this.enemyColor);
      m.position.set(e.x, 0, e.z);
      m.rotation.y = e.type === 'keep' ? 0 : Math.atan2(e.x, e.z);
      scene.add(m);
      this.blds.set(e.id, m);
    }
    for (const e of sim.ents) if (e.unit) this.addUnit(e);

    const barMat = new THREE.MeshBasicMaterial({ depthTest: false, transparent: true, fog: false });
    this.bars = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), barMat, MAX_BARS);
    this.bars.renderOrder = 10;
    this.bars.frustumCulled = false;
    this.bars.count = 0;
    this.bars.setColorAt(0, this.col.set(0xffffff));
    scene.add(this.bars);
    this.fx = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ fog: false }), MAX_FX);
    this.fx.frustumCulled = false;
    this.fx.count = 0;
    this.fx.setColorAt(0, this.col.set(0xffffff));
    scene.add(this.fx);

    this.projGeo = {
      arrow: new THREE.BoxGeometry(0.09, 0.09, 1.0),
      bolt: new THREE.IcosahedronGeometry(0.28, 1),
      rock: new THREE.IcosahedronGeometry(0.42, 0),
    };
    this.projMat = {
      arrow: new THREE.MeshBasicMaterial({ color: 0x6b4423 }),
      bolt: new THREE.MeshBasicMaterial({ color: 0x7ef0ff }),
      rock: flatToon(C.stoneD),
    };

    this.dragon = dragonMesh();
    this.dragon.rotation.y = Math.PI / 2;
    this.dragon.scale.setScalar(1.15);
    this.dragon.visible = false;
    scene.add(this.dragon);

    this.pointer = new Pointer(gfx.canvas);
    this.pointer.onTap = (x, y) => { if (this.spell) this.tryCast(x, y); else this.tryDeploy(x, y, true); };
    this.pointer.onHold = (x, y, down) => { this.hold = down ? { x, y, t: 0, next: 0.32 } : null; };
    this.pointer.onDrag = (dx, dy) => {
      const k = this.dist * 0.0016;
      this.target.x -= dx * k;
      this.target.z -= dy * k * 1.3;
      const d = Math.hypot(this.target.x, this.target.z);
      const max = plan.fieldR;
      if (d > max) { this.target.x *= max / d; this.target.z *= max / d; }
    };
    this.pointer.onZoom = f => { this.dist = Math.max(16, Math.min(plan.fieldR * 2.4, this.dist * f)); };
    this.pickFirst();
    this.placeCamera();
  }

  /** Selects the first troop type that still has reserves. */
  pickFirst(): void {
    if (this.sim.reserve[this.selected] > 0) return;
    const order: UnitKind[] = [...TTYPES, 'king'];
    const next = order.find(t => this.sim.reserve[t] > 0);
    if (next) this.selected = next;
  }

  private addUnit(e: Ent): void {
    const mesh = unitMesh(e.type as UnitModel, e.team === 0 ? TEAM.player : this.enemyColor, e.variant, e.type === 'king' || e.type === 'boss' || !this.gfx.lowPower);
    // Troops are drawn a little oversized so they read from the battle camera.
    const big = (mesh.userData.baseScale as number) * 1.22;
    mesh.userData.baseScale = big;
    mesh.scale.setScalar(big);
    mesh.position.set(e.x, 0, e.z);
    mesh.rotation.y = e.face;
    this.stage.scene.add(mesh);
    this.units.set(e.id, { mesh, ent: e, phase: Math.random() * 6 });
  }

  private ground(x: number, y: number): { x: number; z: number } | null {
    this.ndc.set((x / this.gfx.w) * 2 - 1, -(y / this.gfx.h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const d = this.ray.ray.direction, o = this.ray.ray.origin;
    if (d.y >= -0.01) return null;
    const k = -o.y / d.y;
    return { x: o.x + d.x * k, z: o.z + d.z * k };
  }

  private tryDeploy(x: number, y: number, warn: boolean): void {
    if (this.sim.over || this.paused) return;
    const p = this.ground(x, y);
    if (!p) return;
    this.pickFirst();
    if (this.sim.reserve[this.selected] <= 0) {
      if (warn) this.onHint('No troops left to deploy');
      return;
    }
    if (!this.sim.canDeployAt(p.x, p.z)) {
      if (warn) {
        this.zoneFlash = 0.5;
        this.onHint(Math.hypot(p.x, p.z) < this.sim.plan.deployR ? 'Too close! Deploy outside the red zone' : 'Deploy inside the white circle');
        this.onSfx('deny');
      }
      return;
    }
    if (this.sim.deploy(this.selected, p.x, p.z)) {
      this.onSfx('deploy');
      this.pickFirst();
    }
  }

  private tryCast(x: number, y: number): void {
    const spell = this.spell;
    if (!spell || this.sim.over || this.paused) return;
    const p = this.ground(x, y);
    if (!p) return;
    const d = Math.hypot(p.x, p.z);
    const max = this.sim.plan.fieldR;
    const k = d > max ? max / d : 1;
    if (!this.onCast(spell)) { this.onSfx('deny'); return; }
    this.sim.cast(spell, p.x * k, p.z * k);
    this.spell = null;
  }

  private spellEvent(ev: { kind: SpellId; x: number; z: number; r: number; dur?: number }, impact: boolean): void {
    if (!impact) {
      if (ev.kind === 'fireball') {
        const m = new THREE.Mesh(this.projGeo.rock, new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
        m.scale.setScalar(2.2);
        this.stage.scene.add(m);
        this.meteors.push({ mesh: m, x: ev.x, z: ev.z, t: 0, dur: ev.dur || 0.6 });
        this.onSfx('spell');
      } else if (ev.kind === 'heal') {
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2;
          this.puff(ev.x + Math.sin(a) * ev.r * 0.8, 0.4, ev.z + Math.cos(a) * ev.r * 0.8, 1, 0x7dff9a, 1.2, 0.5, 1.0, -5);
        }
        this.puff(ev.x, 1, ev.z, 14, 0xd6ffd9, 3, 0.4, 0.8, -3);
        this.onSfx('heal');
      } else if (ev.kind === 'freeze') {
        this.puff(ev.x, 1, ev.z, 34, 0xbdf3ff, 9, 0.45, 0.9);
        this.puff(ev.x, 1, ev.z, 12, 0xffffff, 5, 0.3, 0.7);
        this.onSfx('freeze');
      } else {
        this.dragon.visible = true;
        this.onSfx('dragon');
      }
      return;
    }
    if (ev.kind === 'fireball') {
      this.puff(ev.x, 0.8, ev.z, 26, 0xff8a2a, 9, 0.7, 0.7);
      this.puff(ev.x, 0.8, ev.z, 14, 0xffd84d, 6, 0.45, 0.5);
      this.puff(ev.x, 0.6, ev.z, 12, 0x6b5a55, 4, 0.9, 1.1);
      this.shake = Math.max(this.shake, 0.7);
      const scorch = new THREE.Mesh(new THREE.CircleGeometry(ev.r, 20), new THREE.MeshBasicMaterial({ color: 0x2b2018, transparent: true, opacity: 0.4, depthWrite: false }));
      scorch.rotation.x = -Math.PI / 2;
      scorch.position.set(ev.x, 0.06, ev.z);
      this.stage.scene.add(scorch);
      this.sfx('boom', 0.1);
    } else {
      for (let i = 0; i < 3; i++) this.puff(ev.x + (Math.random() - 0.5) * 2, 0.5, ev.z + (Math.random() - 0.5) * ev.r * 2, 3, i ? 0xff8a2a : 0xffd84d, 4, 0.55, 0.6);
      this.shake = Math.max(this.shake, 0.18);
      this.sfx('boom', 0.3);
    }
  }

  private updateSpells(dt: number): void {
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      m.mesh.position.set(m.x + (1 - k) * 9, (1 - k) * 22 + 0.5, m.z - (1 - k) * 7);
      m.mesh.rotation.x += dt * 9;
      this.puff(m.mesh.position.x, m.mesh.position.y, m.mesh.position.z, 1, 0xffc04d, 1, 0.5, 0.35);
      if (k >= 1) { this.stage.scene.remove(m.mesh); this.meteors.splice(i, 1); }
    }
    const d = this.sim.dragon;
    if (d) {
      this.dragon.visible = true;
      this.dragon.position.set(d.x, 7.5 + Math.sin(this.t * 3) * 0.5, d.z);
      for (const w of this.dragon.children) {
        const side = w.userData.wing as number | undefined;
        if (side) w.rotation.z = side * (Math.sin(this.t * 9) * 0.55 - 0.1);
      }
      // Fire breath pours down ahead of the dragon.
      for (let i = 0; i < 2; i++) this.puff(d.x + 3.5 + Math.random() * 1.5, 5.5 - Math.random() * 4.5, d.z + (Math.random() - 0.5) * 3, 1, Math.random() < 0.5 ? 0xff8a2a : 0xffd84d, 2, 0.6, 0.4, 14);
    } else if (this.dragon.visible) {
      this.dragon.visible = false;
    }
    // Frozen enemies glitter.
    this.frostT -= dt;
    if (this.frostT <= 0) {
      this.frostT = 0.3;
      for (const e of this.sim.ents) if (e.alive && e.stun > 0) this.puff(e.x, e.unit ? 1.3 : 3, e.z, 1, 0xbdf3ff, 0.8, 0.28, 0.5);
    }
  }

  private puff(x: number, y: number, z: number, n: number, color: number, speed: number, size: number, life = 0.6, grav = 0): void {
    for (let i = 0; i < n && this.parts.length < MAX_FX; i++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      this.parts.push({
        x, y, z, vx: Math.sin(a) * speed * (0.4 + Math.random()), vy: speed * (0.3 + up), vz: Math.cos(a) * speed * (0.4 + Math.random()),
        life, max: life, size: size * (0.6 + Math.random() * 0.8), color, grav,
      });
    }
  }
  private sfx(name: string, gap = 0.07): void {
    if ((this.sfxGate[name] || 0) > this.t) return;
    this.sfxGate[name] = this.t + gap;
    this.onSfx(name);
  }

  private consumeEvents(): void {
    for (const ev of this.sim.events) {
      switch (ev.t) {
        case 'spawn':
          this.addUnit(ev.e);
          this.puff(ev.e.x, 0.5, ev.e.z, 5, 0xffffff, 2.5, 0.35, 0.4);
          break;
        case 'hit':
          this.puff(ev.x, 1.1, ev.z, ev.heavy ? 4 : 2, 0xffe27a, 3, 0.22, 0.25);
          this.sfx(ev.heavy ? 'thud' : 'hit');
          break;
        case 'shoot':
          this.sfx(ev.kind === 'arrow' ? 'arrow' : ev.kind === 'bolt' ? 'magic' : 'launch', 0.09);
          break;
        case 'boom':
          this.puff(ev.x, 0.6, ev.z, 10, ev.kind === 'bolt' ? 0x9af4ff : 0xffa64d, 5, 0.5, 0.45);
          this.puff(ev.x, 0.4, ev.z, 5, 0xddd6c8, 3, 0.6, 0.6);
          this.sfx('boom', 0.12);
          if (ev.kind === 'rock') this.shake = Math.max(this.shake, 0.2);
          break;
        case 'die': {
          const e = ev.e;
          if (e.unit) {
            const u = this.units.get(e.id);
            if (u) { this.units.delete(e.id); this.dying.push({ mesh: u.mesh, t: 0 }); }
            this.puff(e.x, 0.8, e.z, 6, 0xffffff, 2.5, 0.4, 0.55);
            this.sfx(e.team === 0 ? 'oof' : 'pop', 0.08);
          } else if (this.sim.win && e !== this.sim.enemyKeep) {
            // Ripple outwards from the fallen keep.
            this.falling.push({ e, t: 0.3 + Math.hypot(e.x, e.z) * 0.075 });
          } else {
            this.collapse(e);
          }
          break;
        }
        case 'cast':
          this.spellEvent(ev, false);
          break;
        case 'impact':
          this.spellEvent(ev, true);
          break;
        case 'rally':
          for (const u of this.units.values()) if (u.ent.team === 0) this.puff(u.ent.x, 1.6, u.ent.z, 4, 0xffd84d, 2.5, 0.3, 0.7);
          this.onSfx('horn');
          break;
        case 'keepFall':
          for (let i = 0; i < 8; i++) {
            const col = [0xff5a5a, 0xffd84d, 0x58d66b, 0x5cc8f5, 0xc98bdb][i % 5];
            this.puff((Math.random() - 0.5) * 10, 5 + Math.random() * 3, (Math.random() - 0.5) * 10, 12, col, 9, 0.35, 1.8, 10);
          }
          this.onSfx('victory');
          break;
      }
    }
    this.sim.events.length = 0;
  }

  /** Swaps a building for rubble with dust, debris and a camera shake. */
  private collapse(e: Ent): void {
    const scene = this.stage.scene;
    const m = this.blds.get(e.id);
    if (m) { scene.remove(m); this.blds.delete(e.id); }
    const rubble = propMesh('rubble', e.id % 5);
    rubble.position.set(e.x, 0, e.z);
    rubble.scale.setScalar(e.type === 'keep' ? 1.6 : e.type === 'tower' ? 0.75 : 1);
    scene.add(rubble);
    this.puff(e.x, 1.5, e.z, 18, 0xd8cfc0, 6, 0.8, 0.9);
    this.puff(e.x, 1.5, e.z, 12, C.woodD, 8, 0.4, 1.0, 16);
    this.shake = Math.max(this.shake, e.type === 'keep' ? 0.9 : 0.35);
    this.sfx('crumble', 0.15);
  }

  private placeCamera(): void {
    const aspect = this.gfx.w / this.gfx.h;
    const dist = this.dist * (aspect < 1 ? Math.min(1.9, 0.7 + 0.42 / aspect) : 1);
    const pitch = 0.92;
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.5) * this.shake : 0;
    this.camera.position.set(this.target.x + sx, Math.sin(pitch) * dist + sy, this.target.z + Math.cos(pitch) * dist);
    this.camera.lookAt(this.target.x + sx, 1, this.target.z);
    this.stage.sun.target.position.set(0, 0, 0);
    this.stage.sun.position.set(this.extent * 0.6, this.extent * 1.3, this.extent * 0.5);
  }

  update(dt: number): void {
    this.t += dt;
    const sim = this.sim;
    if (!this.paused) {
      // Opening camera move: glide from the enemy keep back to the deploy side.
      if (this.intro < 1) {
        this.intro = Math.min(1, this.intro + dt / 1.3);
        const want = sim.plan.deployR * 0.75;
        this.target.z += (want - this.target.z) * Math.min(1, dt * 3) * (this.intro < 1 ? 1 : 0);
      }
      if (this.hold && !sim.over && !this.spell) {
        this.hold.t += dt;
        if (this.hold.t >= this.hold.next) {
          this.hold.next = this.hold.t + 0.09;
          this.tryDeploy(this.hold.x, this.hold.y, false);
        }
      }
      this.acc = Math.min(0.25, this.acc + dt);
      while (this.acc >= STEP) {
        sim.step(STEP);
        this.acc -= STEP;
      }
      this.consumeEvents();
      this.updateSpells(dt);
    }

    for (const u of this.units.values()) {
      const e = u.ent;
      u.mesh.position.set(e.x, 0, e.z);
      let dy = e.face - u.mesh.rotation.y;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      u.mesh.rotation.y += dy * Math.min(1, dt * 12);
      const cheer = sim.over && sim.win === (e.team === 0);
      animateUnit(u.mesh, this.t, e.moving || cheer, e.atkT, u.phase);
      if (cheer) u.mesh.position.y = Math.abs(Math.sin(this.t * 9 + u.phase)) * 0.5;
    }
    for (let i = this.dying.length - 1; i >= 0; i--) {
      const d = this.dying[i];
      d.t += dt;
      const k = Math.min(1, d.t / 0.55);
      d.mesh.rotation.x = -k * 1.5;
      d.mesh.scale.multiplyScalar(1 - dt * 1.6);
      d.mesh.position.y = -k * 0.2;
      if (k >= 1) { this.stage.scene.remove(d.mesh); this.dying.splice(i, 1); }
    }

    // Projectiles.
    for (const [p, m] of this.projs) {
      if (!p.alive) { this.stage.scene.remove(m); this.projs.delete(p); }
    }
    for (const p of sim.projs) {
      let m = this.projs.get(p);
      if (!m) {
        m = new THREE.Mesh(this.projGeo[p.kind], this.projMat[p.kind]);
        m.position.set(p.x, p.y, p.z);
        this.stage.scene.add(m);
        this.projs.set(p, m);
      }
      this.v3.set(p.x, p.y, p.z);
      if (p.kind === 'arrow' && m.position.distanceToSquared(this.v3) > 0.0001) m.lookAt(this.v3);
      else if (p.kind !== 'arrow') { m.rotation.x += dt * 7; m.rotation.y += dt * 5; }
      m.position.copy(this.v3);
    }

    // Health bars (two instances each: dark backing + coloured fill).
    let n = 0;
    this.q.copy(this.camera.quaternion);
    const bar = (x: number, y: number, z: number, w: number, frac: number, color: number) => {
      if (n + 2 > MAX_BARS) return;
      this.m4.compose(this.v3.set(x, y, z), this.q, this.s3.set(w + 0.12, 0.3, 1));
      this.bars.setMatrixAt(n, this.m4);
      this.bars.setColorAt(n++, this.col.set(0x2b2233));
      // Shift the fill so it shrinks towards the left edge.
      this.v3.set(-(1 - frac) * w * 0.5, 0, 0.01).applyQuaternion(this.q).add(this.s3.set(x, y, z));
      this.m4.compose(this.v3, this.q, this.s3.set(Math.max(0.02, w * frac), 0.18, 1));
      this.bars.setMatrixAt(n, this.m4);
      this.bars.setColorAt(n++, this.col.set(color));
    };
    for (const e of sim.ents) {
      if (!e.alive) continue;
      const frac = e.hp / e.maxHp;
      if (e.unit) {
        if (frac >= 0.999 && e.type !== 'king' && e.type !== 'boss') continue;
        const big = e.type === 'king' || e.type === 'boss';
        bar(e.x, e.type === 'boss' ? 5 : e.type === 'king' ? 2.7 : 2.1, e.z, big ? 2 : 1, frac, e.team === 0 ? 0x58d66b : 0xff5a5a);
      } else if (frac < 0.999 || e.type === 'keep') {
        bar(e.x, e.type === 'keep' ? [7.6, 8.6, 10.2, 13.6][Math.min(3, e.variant)] : 6.2, e.z, e.type === 'keep' ? 4 : 2, frac, e.type === 'keep' ? 0xffc83d : 0xff8a4d);
      }
    }
    this.bars.count = n;
    this.bars.instanceMatrix.needsUpdate = true;
    if (this.bars.instanceColor) this.bars.instanceColor.needsUpdate = true;

    // Particles.
    let k = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2;
      if (p.y < 0.1 && p.grav >= 0) { p.y = 0.1; p.vy = 0; }
      const s = p.size * (p.life / p.max) * 2;
      this.m4.compose(this.v3.set(p.x, p.y, p.z), this.q, this.s3.set(s, s, s));
      this.fx.setMatrixAt(k, this.m4);
      this.fx.setColorAt(k++, this.col.set(p.color));
    }
    this.fx.count = k;
    this.fx.instanceMatrix.needsUpdate = true;
    if (this.fx.instanceColor) this.fx.instanceColor.needsUpdate = true;

    if (this.zoneFlash > 0) this.zoneFlash = Math.max(0, this.zoneFlash - dt);
    (this.zone.material as THREE.MeshBasicMaterial).opacity = 0.24 + this.zoneFlash * 0.6 + Math.sin(this.t * 2.5) * 0.04;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 1.8);
    driftClouds(this.stage, dt, this.extent);
    this.placeCamera();

    for (let i = this.falling.length - 1; i >= 0; i--) {
      this.falling[i].t -= dt;
      if (this.falling[i].t <= 0) { this.collapse(this.falling[i].e); this.falling.splice(i, 1); }
    }

    if (sim.over && !this.done && sim.overT > (sim.win ? 3.2 : 1.4)) {
      this.done = true;
      this.onDone();
    }
    // The losing side has nothing to animate once it is over, so advance the clock for the result screen.
    if (sim.over && this.paused) sim.overT += dt;
  }

  resize(): void {
    this.camera.aspect = this.gfx.w / this.gfx.h;
    this.camera.updateProjectionMatrix();
  }
  render(): void {
    this.gfx.renderer.render(this.stage.scene, this.camera);
  }
  dispose(): void {
    this.pointer.dispose();
    this.bars.dispose();
    this.fx.dispose();
    this.bars.geometry.dispose();
    this.fx.geometry.dispose();
    for (const k of Object.keys(this.projGeo) as Proj['kind'][]) this.projGeo[k].dispose();
  }
}
