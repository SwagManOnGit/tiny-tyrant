// The home village: a Clash-style tile grid you build on, a third-person king, and plenty of things to tap.
import * as THREE from 'three';
import { BType, BUILDINGS, GRID, KEEP_TILE, TILE, fmt, fmtTime, sizeOf, tileCentre } from './data';
import { Gfx, Particles, Pointer, Stage, animateUnit, driftClouds, makeStage } from './gfx';
import { IC, resIcon } from './icons';
import { C, TEAM, WALL_NAMES, buildingMesh, flatToon, meadow, obstacleMesh, outskirts, propMesh, scenery, unitMesh, walls } from './models';
import type { UnitModel } from './models';
import type { Building, Game } from './state';

export interface PlaceInfo { name: string; valid: boolean; moving: boolean; type: BType }
export interface VillageHooks {
  pickBuilding(b: Building): void;
  pickMerchant(): void;
  float(x: number, y: number, html: string, cls?: string): void;
  sfx(name: string): void;
  toast(html: string, kind?: string): void;
  placing(info: PlaceInfo | null): void;
}

interface BEntry {
  id: number;
  type: BType;
  group: THREE.Group;
  key: string;
  scaffold: THREE.Mesh | null;
  label: HTMLElement;
  pop: number;
  pulse: number;
  x: number;
  z: number;
  r: number;
  autoT: number;
  smokeT: number;
}
interface OEntry { mesh: THREE.Mesh; x: number; z: number; wob: number; kind: number }
interface Walker {
  mesh: THREE.Mesh;
  x: number; z: number; tx: number; tz: number;
  wait: number; phase: number; moving: boolean; speed: number;
  homeX: number; homeZ: number; range: number; kind: UnitModel;
}
interface Placing { type: BType; id: number; size: number; gx: number; gz: number; valid: boolean; ghost: THREE.Group }

const HALF = (GRID * TILE) / 2;
const WALL = HALF + 2.4;
const GATE = 3.2;
const ROAM_R = 56;
const KING_SPEED = 9.5;
const OB_COLORS = [0x6fbf5a, 0x3f9a50, 0xb8bcc8, 0xe86a5a, 0x8fe9ff];

function checkerTexture(): THREE.CanvasTexture {
  const px = 20;
  const c = document.createElement('canvas');
  c.width = c.height = GRID * px;
  const g = c.getContext('2d')!;
  let seed = 11;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let x = 0; x < GRID; x++) {
    for (let z = 0; z < GRID; z++) {
      g.fillStyle = (x + z) % 2 ? '#8fdc62' : '#80d155';
      g.fillRect(x * px, z * px, px, px);
      for (let k = 0; k < 3; k++) {
        g.fillStyle = r() < 0.5 ? 'rgba(255,255,210,0.28)' : 'rgba(60,140,60,0.22)';
        g.fillRect(x * px + r() * (px - 3), z * px + r() * (px - 4), 1.5, 3 + r() * 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function linesTexture(): THREE.CanvasTexture {
  const px = 32;
  const c = document.createElement('canvas');
  c.width = c.height = GRID * px;
  const g = c.getContext('2d')!;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 2;
  for (let i = 0; i <= GRID; i++) {
    g.beginPath(); g.moveTo(i * px, 0); g.lineTo(i * px, GRID * px); g.stroke();
    g.beginPath(); g.moveTo(0, i * px); g.lineTo(GRID * px, i * px); g.stroke();
  }
  return new THREE.CanvasTexture(c);
}
const short = (n: number) => (n < 10 ? String(Math.round(n * 10) / 10) : fmt(n));

export class VillageView {
  active = true;
  stage: Stage;
  camera: THREE.PerspectiveCamera;
  private gfx: Gfx;
  private game: Game;
  private hooks: VillageHooks;
  private labels: HTMLElement;
  private pointer: Pointer;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private entries = new Map<number, BEntry>();
  private obs = new Map<number, OEntry>();
  private pickables: THREE.Object3D[] = [];
  private rev = -1;
  private fx: Particles;

  private king: THREE.Mesh;
  private kingPos = new THREE.Vector3(0, 0, tileCentre(KEEP_TILE + 4, 1) + 2);
  private kingGoal: THREE.Vector3 | null = null;
  private kingMoving = false;
  private kingFace = Math.PI;
  private keys = new Set<string>();
  private marker: THREE.Mesh;
  private markerT = 0;

  private camTarget = new THREE.Vector3(0, 0, 6);
  private panTarget = new THREE.Vector3();
  private yaw = 0;
  private pitch = 0.86;
  private dist = 36;

  private place: Placing | null = null;
  private placeKey = '';
  private dragGhost = false;
  private hold: { x: number; y: number; t: number } | null = null;
  private swallowTap = false;
  private gridLines: THREE.Mesh;
  private pad: THREE.Mesh;

  private walkers: Walker[] = [];
  private cart: THREE.Group;
  private cartLabel: HTMLElement;
  private cartZ = WALL + 40;
  private goblin: THREE.Mesh;
  private gob = { on: false, x: 0, z: 0, tx: 0, tz: 0, flee: 0 };
  private t = 0;
  private labelT = 0;
  private moteT = 0;
  private tmp = new THREE.Vector3();
  /** Walls and outskirts for the current realm size; rebuilt whenever a ring of rivals is conquered. */
  private env: THREE.Group | null = null;
  private envStage = -1;
  private envPop = 0;
  private blockers: [number, number, number][] = [];
  private road: THREE.Mesh;
  private apron: THREE.Mesh;
  private kingPath: THREE.Vector3[] = [];
  private showT = 0;
  private viewDist = 36;
  /** Total distance the King has walked (the tutorial watches this). */
  kingDist = 0;

  constructor(gfx: Gfx, game: Game, labels: HTMLElement, hooks: VillageHooks) {
    this.gfx = gfx;
    this.game = game;
    this.hooks = hooks;
    this.labels = labels;
    this.stage = makeStage(gfx, 54);
    this.camera = new THREE.PerspectiveCamera(42, gfx.w / gfx.h, 0.5, 1100);
    const scene = this.stage.scene;

    // The buildable lawn: a checkerboard of tiles on a darker trim, ringed by a palisade with a south gate.
    const trim = new THREE.Mesh(new THREE.PlaneGeometry(WALL * 2, WALL * 2), flatToon(0x6cbb4c));
    trim.rotation.x = -Math.PI / 2;
    trim.position.y = 0.012;
    trim.receiveShadow = true;
    scene.add(trim);
    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), flatToon(0xffffff, checkerTexture()));
    lawn.rotation.x = -Math.PI / 2;
    lawn.position.y = 0.02;
    lawn.receiveShadow = true;
    scene.add(lawn);
    this.gridLines = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshBasicMaterial({ map: linesTexture(), transparent: true, opacity: 0.45, depthWrite: false }),
    );
    this.gridLines.rotation.x = -Math.PI / 2;
    this.gridLines.position.y = 0.035;
    this.gridLines.visible = false;
    scene.add(this.gridLines);
    this.pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x4dff7a, transparent: true, opacity: 0.5, depthWrite: false }));
    this.pad.rotation.x = -Math.PI / 2;
    this.pad.position.y = 0.05;
    this.pad.visible = false;
    scene.add(this.pad);

    const dirt = flatToon(C.dirt);
    const road = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 70), flatToon(C.dirt));
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.02, WALL + 34);
    road.receiveShadow = true;
    scene.add(road);
    const apron = new THREE.Mesh(new THREE.CircleGeometry(4.2, 20), dirt);
    apron.rotation.x = -Math.PI / 2;
    apron.position.set(0, 0.016, WALL);
    scene.add(apron);
    this.road = road;
    this.apron = apron;

    const pond = new THREE.Mesh(new THREE.CircleGeometry(7.5, 24), new THREE.MeshToonMaterial({ color: C.water }));
    pond.rotation.x = -Math.PI / 2;
    pond.scale.set(1.3, 1, 1);
    pond.position.set(-WALL - 16, 0.03, 14);
    scene.add(pond);
    const shore = new THREE.Mesh(new THREE.CircleGeometry(8.4, 24), flatToon(0xe8d8a8));
    shore.rotation.x = -Math.PI / 2;
    shore.scale.set(1.3, 1, 1);
    shore.position.set(-WALL - 16, 0.02, 14);
    scene.add(shore);
    const inYard = (x: number, z: number, pad: number) => Math.abs(x) < WALL + pad && Math.abs(z) < WALL + pad;
    const onRoad = (x: number, z: number) => Math.abs(x) < 4.5 && z > 0;
    const inPond = (x: number, z: number) => Math.hypot((x + WALL + 16) / 1.3, z - 14) < 10;
    // The land in front of the gate stays clear of trees: that is where the outskirts grow as the realm does.
    const inTown = (x: number, z: number) => Math.abs(x) < 32 && z > WALL - 1 && z < WALL + 52;
    const dense = gfx.lowPower ? 0.6 : 1;
    scene.add(meadow(12, 110, Math.round(420 * dense), (x, z) => inYard(x, z, 6.2) || onRoad(x, z) || inPond(x, z)));
    scene.add(scenery(21, WALL + 3, 125, Math.round(300 * dense), (x, z) => inYard(x, z, 6.6) || onRoad(x, z) || inPond(x, z) || inTown(x, z)));

    this.fx = new Particles(scene, gfx.lowPower ? 160 : 300);
    this.king = unitMesh('king', TEAM.player);
    scene.add(this.king);
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.75, 20),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.06;
    this.marker.visible = false;
    scene.add(this.marker);

    this.cart = new THREE.Group();
    this.cart.add(propMesh('cart'));
    const trader = unitMesh('merchant', 0);
    trader.position.set(-1.6, 0, 0.4);
    trader.rotation.y = -0.6;
    this.cart.add(trader);
    this.cart.rotation.y = Math.PI;
    this.cart.userData.pick = { kind: 'merchant', id: 0 };
    this.cart.visible = false;
    scene.add(this.cart);
    this.cartLabel = document.createElement('div');
    this.cartLabel.className = 'wl';
    this.cartLabel.innerHTML = `<button class="wl-gift">${IC.chest}<span>${IC.ad}</span></button>`;
    this.cartLabel.querySelector('button')!.addEventListener('click', () => this.hooks.pickMerchant());
    labels.appendChild(this.cartLabel);

    this.goblin = unitMesh('goblin', 0);
    this.goblin.userData.pick = { kind: 'goblin', id: 0 };
    this.goblin.visible = false;
    scene.add(this.goblin);

    this.pointer = new Pointer(gfx.canvas);
    this.pointer.onTap = (x, y) => { if (this.active) this.tap(x, y); };
    this.pointer.onHold = (x, y, down) => {
      if (!this.active) return;
      if (!down) { this.hold = null; return; }
      this.hold = { x, y, t: 0 };
      if (this.place) {
        const p = this.ground(x, y);
        const cx = tileCentre(this.place.gx, this.place.size), cz = tileCentre(this.place.gz, this.place.size);
        const half = (this.place.size * TILE) / 2 + 1.2;
        this.dragGhost = !!p && Math.abs(p.x - cx) < half && Math.abs(p.z - cz) < half;
      }
    };
    this.pointer.onUp = () => { this.dragGhost = false; };
    this.pointer.onDrag = (dx, dy, x, y) => {
      if (!this.active) return;
      if (this.place) {
        if (this.dragGhost) {
          const p = this.ground(x, y);
          if (p) this.ghostTo(p.x, p.z);
        } else {
          const k = this.dist * 0.0019;
          const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
          this.panTarget.x += (-cos * dx - sin * dy) * k;
          this.panTarget.z += (sin * dx - cos * dy) * k;
          this.panTarget.x = Math.max(-HALF, Math.min(HALF, this.panTarget.x));
          this.panTarget.z = Math.max(-HALF, Math.min(HALF, this.panTarget.z));
        }
        return;
      }
      this.yaw -= dx * 0.006;
      this.pitch = Math.max(0.45, Math.min(1.3, this.pitch + dy * 0.004));
    };
    this.pointer.onZoom = f => { if (this.active) this.dist = Math.max(14, Math.min(78, this.dist * f)); };
    window.addEventListener('keydown', e => { if (this.active) this.keys.add(e.key.toLowerCase()); });
    window.addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());

    this.setEnv(Math.min(9, game.currentTier()), false);
    this.sync();
    this.placeCamera(1);
  }

  /** Builds the walls and outskirts for a realm size. With `celebrate` they rise out of the ground in a shower of sparks. */
  private setEnv(stage: number, celebrate: boolean): void {
    const scene = this.stage.scene;
    if (this.env) {
      scene.remove(this.env);
      this.env.traverse(o => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !m.userData.outline) m.geometry.dispose();
        if ((o as THREE.Sprite).isSprite) (o as THREE.Sprite).material.dispose();
      });
    }
    this.envStage = stage;
    const env = new THREE.Group();
    env.add(walls(stage, WALL, GATE, TEAM.player));
    const out = outskirts(stage, WALL, TEAM.player);
    env.add(out);
    this.blockers = (out.userData.blockers as [number, number, number][]) || [];
    scene.add(env);
    this.env = env;
    (this.road.material as THREE.MeshToonMaterial).color.set(stage >= 3 ? 0xcbc4b6 : C.dirt);
    this.apron.visible = stage < 5;
    if (!celebrate) return;
    this.envPop = 1;
    this.showT = 5.5;
    for (let i = 0; i < 28; i++) {
      const t = -WALL + (i / 27) * WALL * 2;
      for (const [x, z] of [[t, -WALL], [t, WALL], [-WALL, t], [WALL, t]]) this.fx.puff(x, 0.5, z, 2, i % 2 ? 0xfff2a8 : 0xffffff, 6, 0.45, 1.1, 5);
    }
    this.hooks.sfx('horn');
    this.hooks.toast('Your defences are now a <b>' + WALL_NAMES[stage] + '</b>!', 'quest');
  }
  /** Pulls the camera back for a few seconds to show off the whole village. */
  showcase(seconds = 5): void { this.showT = seconds; }
  /** Screen position of the obstacle closest to the King, if it is on screen (the tutorial points at it). */
  obstacleSpot(): { x: number; y: number } | null {
    let best: OEntry | null = null;
    let bd = Infinity;
    for (const o of this.obs.values()) {
      const d = Math.hypot(o.x - this.kingPos.x, o.z - this.kingPos.z);
      if (d < bd) { bd = d; best = o; }
    }
    if (!best) return null;
    this.tmp.set(best.x, 1, best.z).project(this.camera);
    if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 0.92 || Math.abs(this.tmp.y) > 0.8) return null;
    return { x: (this.tmp.x * 0.5 + 0.5) * this.gfx.w, y: (-this.tmp.y * 0.5 + 0.5) * this.gfx.h };
  }

  // ------------------------------------------------------------ world sync

  private heightOf(e: BEntry): number {
    return ((e.group.userData.h as number) || 4) + 0.6;
  }

  /** Rebuilds meshes for anything that changed in the game state. */
  sync(): void {
    const game = this.game;
    if (this.rev === game.rev) return;
    this.rev = game.rev;
    const scene = this.stage.scene;
    const seen = new Set<number>();
    for (const b of game.s.buildings) {
      seen.add(b.id);
      const key = `${b.type}:${b.level}:${b.busy > 0 ? 1 : 0}:${b.gx}:${b.gz}`;
      let e = this.entries.get(b.id);
      if (e && e.key === key) continue;
      const size = sizeOf(b.type);
      const x = tileCentre(b.gx, size), z = tileCentre(b.gz, size);
      const finished = !!e && e.key.split(':')[2] === '1' && b.busy <= 0;
      let label: HTMLElement;
      if (e) {
        scene.remove(e.group);
        label = e.label;
      } else {
        label = document.createElement('div');
        label.className = 'wl';
        label.addEventListener('click', ev => {
          ev.stopPropagation();
          const cur = this.game.byId(b.id);
          if (!cur) return;
          if (cur.busy <= 0 && this.game.hasGoods(cur)) this.game.collect(cur.id);
          else this.hooks.pickBuilding(cur);
        });
        this.labels.appendChild(label);
      }
      const group = b.level > 0 ? buildingMesh(b.type, b.level) : new THREE.Group();
      if (b.level === 0) {
        const site = propMesh('site');
        site.scale.setScalar((size * TILE) / 5.7);
        group.add(site);
        group.userData.h = 3;
      }
      let scaffold: THREE.Mesh | null = null;
      if (b.busy > 0) {
        scaffold = propMesh('scaffold');
        const s = (size * TILE) / 5.5;
        scaffold.scale.set(s, Math.max(0.5, Math.min(2.2, ((group.userData.h as number) || 3) / 3.7)), s);
        group.add(scaffold);
      }
      group.position.set(x, 0, z);
      group.userData.pick = { kind: 'building', id: b.id };
      group.visible = !(this.place && this.place.id === b.id);
      scene.add(group);
      e = { id: b.id, type: b.type, group, key, scaffold, label, pop: finished ? 0.45 : 0, pulse: 0, x, z, r: (size * TILE) / 2, autoT: 0, smokeT: Math.random(), };
      this.entries.set(b.id, e);
      if (finished) this.fx.puff(x, 2, z, 14, 0xfff2a8, 5, 0.3, 0.7);
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      scene.remove(e.group);
      e.label.remove();
      this.entries.delete(id);
    }
    const obSeen = new Set<number>();
    for (const o of game.s.obstacles) {
      obSeen.add(o.id);
      if (this.obs.has(o.id)) continue;
      const mesh = obstacleMesh(o.kind, o.id);
      const x = tileCentre(o.gx, 1), z = tileCentre(o.gz, 1);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = (o.id * 1.7) % 6.28;
      mesh.userData.pick = { kind: 'obstacle', id: o.id };
      scene.add(mesh);
      this.obs.set(o.id, { mesh, x, z, wob: 0, kind: o.kind });
    }
    for (const [id, o] of this.obs) {
      if (obSeen.has(id)) continue;
      scene.remove(o.mesh);
      this.fx.puff(o.x, 0.8, o.z, 12, OB_COLORS[o.kind], 5, 0.35, 0.7, 10);
      this.obs.delete(id);
    }
    this.pickables = [this.cart, this.goblin];
    for (const e of this.entries.values()) this.pickables.push(e.group);
    for (const o of this.obs.values()) this.pickables.push(o.mesh);
    this.refreshLabels();
  }

  /** Screen position above a building (for floating text). */
  screenOf(b: Building): { x: number; y: number } {
    const size = sizeOf(b.type);
    return this.screenAt(tileCentre(b.gx, size), 3.2, tileCentre(b.gz, size));
  }
  private screenAt(x: number, y: number, z: number): { x: number; y: number } {
    this.tmp.set(x, y, z).project(this.camera);
    return { x: (this.tmp.x * 0.5 + 0.5) * this.gfx.w, y: (-this.tmp.y * 0.5 + 0.5) * this.gfx.h };
  }
  private ground(x: number, y: number): { x: number; z: number } | null {
    this.ndc.set((x / this.gfx.w) * 2 - 1, -(y / this.gfx.h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const d = this.ray.ray.direction, o = this.ray.ray.origin;
    if (d.y >= -0.01) return null;
    const k = -o.y / d.y;
    return { x: o.x + d.x * k, z: o.z + d.z * k };
  }
  private pickAt(x: number, y: number): { kind: string; id: number; obj: THREE.Object3D } | null {
    this.ndc.set((x / this.gfx.w) * 2 - 1, -(y / this.gfx.h) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    for (const h of this.ray.intersectObjects(this.pickables, true)) {
      let o: THREE.Object3D | null = h.object;
      let shown = true;
      while (o && !o.userData.pick) { shown = shown && o.visible; o = o.parent; }
      if (!o || !o.visible || !shown) continue;
      const pick = o.userData.pick as { kind: string; id: number };
      return { kind: pick.kind, id: pick.id, obj: o };
    }
    return null;
  }

  // ------------------------------------------------------------ taps

  private tap(x: number, y: number): void {
    this.showT = 0;
    if (this.swallowTap) { this.swallowTap = false; return; }
    if (this.place) {
      const p = this.ground(x, y);
      if (p) { this.ghostTo(p.x, p.z); this.hooks.sfx('click'); }
      return;
    }
    const hit = this.pickAt(x, y);
    if (hit) {
      if (hit.kind === 'goblin') { this.tapGoblin(); return; }
      if (hit.kind === 'obstacle') { this.tapObstacle(hit.id); return; }
      if (hit.kind === 'merchant') { this.hooks.pickMerchant(); return; }
      const b = this.game.byId(hit.id);
      if (!b) return;
      if (b.type === 'spire' && b.level > 0 && b.busy <= 0) { this.tapCrystal(b.id); return; }
      const e = this.entries.get(b.id)!;
      this.walkNear(e.x, e.z, e.r + 1.2);
      if (b.busy <= 0 && this.game.hasGoods(b) && b.type !== 'keep') this.game.collect(b.id);
      this.hooks.pickBuilding(b);
      return;
    }
    const p = this.ground(x, y);
    if (!p) return;
    const len = Math.hypot(p.x, p.z);
    const s = len > ROAM_R ? ROAM_R / len : 1;
    this.setGoal(p.x * s, p.z * s);
  }

  /** The clicker: every tap on the Spire's crystal makes mana. */
  tapCrystal(id?: number): void {
    const b = id ? this.game.byId(id) : this.game.ofType('spire')[0];
    const res = this.game.tapCrystal();
    if (!b || !res) return;
    const e = this.entries.get(b.id);
    const cr = e ? (e.group.userData.crystal as THREE.Object3D | undefined) : undefined;
    if (!e || !cr) return;
    cr.getWorldPosition(this.tmp);
    const wx = this.tmp.x, wy = this.tmp.y, wz = this.tmp.z;
    const sp = this.screenAt(wx + (Math.random() - 0.5) * 1.5, wy + 0.5, wz);
    e.pulse = 1;
    if (res.full) {
      this.hooks.float(sp.x, sp.y, 'Mana full', 'small');
      this.hooks.sfx('deny');
      return;
    }
    this.hooks.float(sp.x, sp.y, `<span class="gain mana">${IC.mana}+${short(res.gain)}</span>`, res.crit ? 'crit' : 'small');
    this.fx.puff(wx, wy, wz, res.crit ? 18 : 5, res.crit ? 0xfff27a : 0x9fefff, res.crit ? 7 : 4, 0.26, 0.55, 6);
    this.hooks.sfx(res.crit ? 'crit' : 'mana');
  }

  /** Makes the in-world crystal react to a tap made from the Spire panel. */
  crystalFx(): void {
    for (const e of this.entries.values()) {
      const cr = e.group.userData.crystal as THREE.Object3D | undefined;
      if (!cr) continue;
      e.pulse = 1;
      cr.getWorldPosition(this.tmp);
      this.fx.puff(this.tmp.x, this.tmp.y, this.tmp.z, 3, 0x9fefff, 4, 0.24, 0.5, 6);
    }
  }

  private tapObstacle(id: number): void {
    const o = this.obs.get(id);
    const res = this.game.hitObstacle(id);
    if (!o || !res) return;
    o.wob = 0.35;
    this.fx.puff(o.x, 1.1, o.z, 5, OB_COLORS[o.kind], 4, 0.22, 0.5, 12);
    this.hooks.sfx(o.kind === 2 || o.kind === 4 ? 'chip' : 'chop');
    if (res.done) {
      const sp = this.screenAt(o.x, 2, o.z);
      const icon = res.res === 'mana' ? IC.mana : resIcon(res.res);
      this.hooks.float(sp.x, sp.y, `<span class="gain${res.res === 'mana' ? ' mana' : ''}">${icon}+${fmt(res.amount)}</span>`);
      this.hooks.sfx('collect');
    }
  }

  private tapGoblin(): void {
    const res = this.game.tapGoblin();
    if (!res) return;
    const sp = this.screenAt(this.gob.x, 2.2, this.gob.z);
    this.fx.puff(this.gob.x, 1.2, this.gob.z, 7, 0xffd23a, 6, 0.24, 0.8, 16);
    this.goblin.userData.squash = 0.25;
    if (res.done) {
      this.fx.puff(this.gob.x, 1.2, this.gob.z, 26, 0xffd23a, 9, 0.3, 1.1, 16);
      this.fx.puff(this.gob.x, 1, this.gob.z, 10, 0xffffff, 4, 0.5, 0.6);
      const html = (['gold', 'wood', 'stone'] as const).filter(r => res.reward[r]).map(r => `<span class="gain">${resIcon(r)}+${fmt(res.reward[r]!)}</span>`).join('');
      this.hooks.float(sp.x, sp.y, html, 'crit');
      this.hooks.sfx('quest');
      this.gob.on = false;
      this.goblin.visible = false;
    } else {
      this.hooks.float(sp.x, sp.y, `<span class="gain">${IC.gold}+${fmt(res.coins)}</span>`, 'small');
      this.hooks.sfx('coin');
      // Startled: bolt somewhere else.
      this.gob.tx = (Math.random() - 0.5) * (HALF * 1.7);
      this.gob.tz = (Math.random() - 0.5) * (HALF * 1.7);
    }
  }

  // ------------------------------------------------------------ placement (build and move)

  get placing(): boolean { return !!this.place; }

  /** Starts placing a new building: a ghost appears on the nearest free tiles. */
  beginPlace(type: BType): boolean {
    const block = this.game.buildBlock(type);
    if (block) { this.hooks.toast(block, 'warn'); this.hooks.sfx('deny'); return false; }
    const size = sizeOf(type);
    const nx = this.kingPos.x / TILE + GRID / 2, nz = this.kingPos.z / TILE + GRID / 2;
    const spot = this.game.findSpot(size, Math.max(2, Math.min(GRID - 2, nx)), Math.max(2, Math.min(GRID - 2, nz)));
    if (!spot) { this.hooks.toast('No room left. Clear some trees and rocks first.', 'warn'); return false; }
    this.cancelPlace();
    this.startGhost({ type, id: 0, size, gx: spot.gx, gz: spot.gz, valid: true, ghost: buildingMesh(type, 1) });
    return true;
  }
  /** Picks up an existing building so it can be moved. */
  beginMove(id: number, grabbed = false): boolean {
    const b = this.game.byId(id);
    const e = this.entries.get(id);
    if (!b || !e) return false;
    this.cancelPlace();
    e.group.visible = false;
    e.label.style.display = 'none';
    this.startGhost({ type: b.type, id, size: sizeOf(b.type), gx: b.gx, gz: b.gz, valid: true, ghost: buildingMesh(b.type, Math.max(1, b.level)) });
    this.dragGhost = grabbed;
    return true;
  }
  private startGhost(p: Placing): void {
    this.place = p;
    this.placeKey = '';
    this.stage.scene.add(p.ghost);
    this.gridLines.visible = true;
    this.pad.visible = true;
    this.pad.scale.set(p.size * TILE, p.size * TILE, 1);
    this.kingGoal = null;
    this.marker.visible = false;
    this.panTarget.set(tileCentre(p.gx, p.size), 0, tileCentre(p.gz, p.size));
    this.labels.classList.add('placing');
    this.updateGhost();
  }
  private ghostTo(wx: number, wz: number): void {
    const p = this.place;
    if (!p) return;
    p.gx = Math.max(0, Math.min(GRID - p.size, Math.round(wx / TILE + GRID / 2 - p.size / 2)));
    p.gz = Math.max(0, Math.min(GRID - p.size, Math.round(wz / TILE + GRID / 2 - p.size / 2)));
    this.updateGhost();
  }
  private updateGhost(): void {
    const p = this.place;
    if (!p) return;
    p.valid = this.game.canPlace(p.size, p.gx, p.gz, p.id);
    const x = tileCentre(p.gx, p.size), z = tileCentre(p.gz, p.size);
    p.ghost.position.x = x;
    p.ghost.position.z = z;
    this.pad.position.set(x, 0.05, z);
    (this.pad.material as THREE.MeshBasicMaterial).color.set(p.valid ? 0x4dff7a : 0xff4d4d);
    const key = `${p.gx}:${p.gz}:${p.valid}`;
    if (key !== this.placeKey) {
      this.placeKey = key;
      this.hooks.placing({ name: BUILDINGS[p.type].name, valid: p.valid, moving: p.id > 0, type: p.type });
    }
  }
  confirmPlace(): boolean {
    const p = this.place;
    if (!p) return false;
    if (!p.valid) { this.hooks.toast('Something is in the way. Pick a free spot.', 'warn'); this.hooks.sfx('deny'); return false; }
    if (p.id) {
      this.game.move(p.id, p.gx, p.gz);
      this.hooks.sfx('build');
    } else {
      const block = this.game.buildBlock(p.type);
      if (block || !this.game.build(p.type, p.gx, p.gz)) { this.hooks.toast(block || 'Cannot build there.', 'warn'); this.hooks.sfx('deny'); return false; }
      this.hooks.sfx('build');
      this.fx.puff(tileCentre(p.gx, p.size), 0.6, tileCentre(p.gz, p.size), 14, 0xe9dcc0, 5, 0.5, 0.7);
    }
    this.endPlace();
    return true;
  }
  cancelPlace(): void {
    if (this.place) this.endPlace();
  }
  private endPlace(): void {
    const p = this.place;
    if (!p) return;
    this.stage.scene.remove(p.ghost);
    const e = this.entries.get(p.id);
    if (e) e.group.visible = true;
    this.place = null;
    this.dragGhost = false;
    this.gridLines.visible = false;
    this.pad.visible = false;
    this.labels.classList.remove('placing');
    this.hooks.placing(null);
    this.rev = -1;
    this.sync();
  }

  // ------------------------------------------------------------ the king and other wanderers

  private walkNear(x: number, z: number, stop: number): void {
    const dx = this.kingPos.x - x, dz = this.kingPos.z - z;
    const d = Math.hypot(dx, dz) || 1;
    if (d <= stop + 0.5) return;
    this.setGoal(x + (dx / d) * stop, z + (dz / d) * stop);
  }
  private isInside(x: number, z: number): boolean { return Math.abs(x) < WALL && Math.abs(z) < WALL; }
  private outerMargin(): number { return this.envStage >= 5 ? 5.8 : 1.1; }
  private setGoal(x: number, z: number): void {
    const m = this.outerMargin() + 0.3;
    if (!(Math.abs(x) < GATE - 0.8 && z > 0)) {
      if (this.isInside(x, z)) {
        x = Math.max(-WALL + 1.3, Math.min(WALL - 1.3, x));
        z = Math.max(-WALL + 1.3, Math.min(WALL - 1.3, z));
      } else if (Math.abs(x) < WALL + m && Math.abs(z) < WALL + m) {
        if (Math.abs(x) > Math.abs(z)) x = Math.sign(x) * (WALL + m); else z = Math.sign(z || 1) * (WALL + m);
      }
    }
    const from = this.isInside(this.kingPos.x, this.kingPos.z), to = this.isInside(x, z);
    const gin = new THREE.Vector3(0, 0, WALL - 2.6), gout = new THREE.Vector3(0, 0, WALL + m + 0.9);
    this.kingPath = from === to ? [] : from ? [gin, gout] : [gout, gin];
    this.kingPath.push(new THREE.Vector3(x, 0, z));
    this.kingGoal = this.kingPath.shift()!;
    this.marker.position.set(x, 0.06, z);
    this.marker.visible = true;
    this.markerT = 0;
  }
  /** The walls (and later the moat) are solid; only the gate lets the King through. */
  private wallBlock(px: number, pz: number): void {
    const p = this.kingPos;
    const m = this.outerMargin();
    const lane = GATE - 0.8;
    if (Math.abs(p.x) < lane && p.z > 0) return;
    if (p.z > WALL - 1 && p.z < WALL + m && Math.abs(px) < lane) {
      p.x = Math.max(-lane + 0.01, Math.min(lane - 0.01, p.x));
      return;
    }
    if (this.isInside(px, pz)) {
      const lim = WALL - 1;
      p.x = Math.max(-lim, Math.min(lim, p.x));
      p.z = Math.max(-lim, Math.min(lim, p.z));
    } else if (Math.abs(p.x) < WALL + m && Math.abs(p.z) < WALL + m) {
      if (Math.abs(px) >= WALL + m - 0.01) p.x = Math.sign(px) * (WALL + m);
      else p.z = Math.sign(pz || 1) * (WALL + m);
    }
  }

  /** Pushes a point out of every building and obstacle, with a little sideways slide. */
  private unstick(p: { x: number; z: number }, rad: number): void {
    for (const e of this.entries.values()) {
      if (this.place && this.place.id === e.id) continue;
      const min = e.r * 0.92 + rad;
      const dx = p.x - e.x, dz = p.z - e.z;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz);
      if (d < min && d > 0.001) {
        const push = min - d;
        p.x += (dx / d) * push - (dz / d) * push * 0.5;
        p.z += (dz / d) * push + (dx / d) * push * 0.5;
      }
    }
    for (const o of this.obs.values()) {
      const dx = p.x - o.x, dz = p.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.75 + rad && d > 0.001) {
        const push = 0.75 + rad - d;
        p.x += (dx / d) * push;
        p.z += (dz / d) * push;
      }
    }
    for (const b of this.blockers) {
      const dx = p.x - b[0], dz = p.z - b[1];
      const d = Math.hypot(dx, dz);
      if (d < b[2] + rad && d > 0.001) {
        const push = b[2] + rad - d;
        p.x += (dx / d) * push - (dz / d) * push * 0.4;
        p.z += (dz / d) * push + (dx / d) * push * 0.4;
      }
    }
  }

  private moveKing(dt: number): void {
    let mx = 0, mz = 0;
    const k = this.keys;
    const f = (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0);
    const r = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
    if ((f || r) && !this.place) {
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      mx = -sin * f + cos * r;
      mz = -cos * f - sin * r;
      this.kingGoal = null;
      this.kingPath = [];
      this.marker.visible = false;
    } else if (this.kingGoal) {
      mx = this.kingGoal.x - this.kingPos.x;
      mz = this.kingGoal.z - this.kingPos.z;
      if (Math.hypot(mx, mz) < 0.35) {
        this.kingGoal = this.kingPath.shift() || null;
        mx = mz = 0;
        if (!this.kingGoal) this.marker.visible = false;
      }
    }
    const len = Math.hypot(mx, mz);
    this.kingMoving = len > 0.01;
    if (this.kingMoving) {
      const step = Math.min(KING_SPEED * dt, this.kingGoal ? len : Infinity);
      const px = this.kingPos.x, pz = this.kingPos.z;
      this.kingPos.x += (mx / len) * step;
      this.kingPos.z += (mz / len) * step;
      this.kingFace = Math.atan2(mx, mz);
      this.unstick(this.kingPos, 0.55);
      this.wallBlock(px, pz);
      this.kingDist += Math.hypot(this.kingPos.x - px, this.kingPos.z - pz);
      const out = Math.hypot(this.kingPos.x, this.kingPos.z);
      if (out > ROAM_R) { this.kingPos.x *= ROAM_R / out; this.kingPos.z *= ROAM_R / out; }
    }
    this.king.position.copy(this.kingPos);
    let dy = this.kingFace - this.king.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    this.king.rotation.y += dy * Math.min(1, dt * 14);
    animateUnit(this.king, this.t, this.kingMoving, 9, 0);
  }

  /** The king scoops up goods from any building he strolls past. */
  private autoCollect(dt: number): void {
    for (const [id, e] of this.entries) {
      e.autoT -= dt;
      if (e.autoT > 0) continue;
      if (Math.hypot(this.kingPos.x - e.x, this.kingPos.z - e.z) > e.r + 3.4) continue;
      const b = this.game.byId(id);
      if (!b || b.busy > 0 || !this.worthCollecting(b)) continue;
      e.autoT = 2.5;
      this.game.collect(id, true);
    }
  }
  private worthCollecting(b: Building): boolean {
    if (b.type === 'keep') {
      const s = this.game.s.keepBuf;
      return s.gold + s.food + s.wood + s.stone >= 15;
    }
    if (!BUILDINGS[b.type].produces) return false;
    return b.buf >= Math.max(8, this.game.bufCap(b) * 0.012);
  }

  private spawnWalker(kind: UnitModel, x: number, z: number, range: number, speed: number, variant: number): Walker {
    const mesh = unitMesh(kind, TEAM.player, variant);
    this.stage.scene.add(mesh);
    const a = Math.random() * Math.PI * 2;
    const w: Walker = {
      mesh, x: x + Math.sin(a) * 3, z: z + Math.cos(a) * 3, tx: 0, tz: 0, wait: Math.random() * 2, phase: Math.random() * 6,
      moving: false, speed, homeX: x, homeZ: z, range, kind,
    };
    w.tx = w.x; w.tz = w.z;
    this.walkers.push(w);
    return w;
  }
  private updateWalkers(dt: number): void {
    const game = this.game;
    const farms = game.ofType('farm').filter(b => b.level > 0);
    const want: [UnitModel, number][] = [
      ['villager', Math.max(3, Math.min(this.gfx.lowPower ? 9 : 14, Math.round(game.s.pop / 3)))],
      ['chicken', Math.min(6, farms.length * 2)],
      ['sheep', Math.min(3, farms.length)],
    ];
    for (const [kind, n] of want) {
      let have = 0;
      for (const w of this.walkers) if (w.kind === kind) have++;
      while (have < n) {
        if (kind === 'villager') this.spawnWalker(kind, 0, 6, HALF - 2, 2.4, have);
        else {
          const f = farms[have % farms.length];
          this.spawnWalker(kind, tileCentre(f.gx, 3), tileCentre(f.gz, 3), 5.5, kind === 'chicken' ? 1.8 : 1.1, have);
        }
        have++;
      }
      for (let i = this.walkers.length - 1; i >= 0 && have > n; i--) {
        if (this.walkers[i].kind !== kind) continue;
        this.stage.scene.remove(this.walkers[i].mesh);
        this.walkers.splice(i, 1);
        have--;
      }
    }
    for (const w of this.walkers) {
      const dx = w.tx - w.x, dz = w.tz - w.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.3) {
        w.moving = false;
        w.wait -= dt;
        if (w.wait <= 0) {
          w.tx = Math.max(-HALF + 1, Math.min(HALF - 1, w.homeX + (Math.random() - 0.5) * 2 * w.range));
          w.tz = Math.max(-HALF + 1, Math.min(HALF - 1, w.homeZ + (Math.random() - 0.5) * 2 * w.range));
          w.wait = 1 + Math.random() * 4;
        }
      } else {
        w.moving = true;
        const step = Math.min(d, w.speed * dt);
        const px = w.x, pz = w.z;
        w.x += (dx / d) * step;
        w.z += (dz / d) * step;
        this.unstick(w, 0.4);
        // Walled in? Pick somewhere else rather than rubbing against a building forever.
        if (Math.hypot(w.x - px, w.z - pz) < step * 0.25) { w.tx = w.x; w.tz = w.z; w.wait = 0.2; }
        w.mesh.rotation.y = Math.atan2(dx, dz);
      }
      w.mesh.position.set(w.x, 0, w.z);
      animateUnit(w.mesh, this.t, w.moving, 9, w.phase);
    }
  }

  private updateGoblin(dt: number): void {
    const g = this.gob;
    const live = !!this.game.goblin;
    if (live && !g.on) {
      g.on = true; g.flee = 0;
      g.x = 0; g.z = WALL - 1;
      g.tx = (Math.random() - 0.5) * HALF; g.tz = (Math.random() - 0.5) * HALF;
      this.goblin.visible = true;
      this.fx.puff(g.x, 1, g.z, 10, 0xb8ff8a, 4, 0.4, 0.6);
    } else if (!live && g.on && !g.flee) {
      // Time ran out: he legs it back out of the gate.
      g.flee = 1;
      g.tx = 0; g.tz = WALL - 2;
    }
    if (!g.on) return;
    const dx = g.tx - g.x, dz = g.tz - g.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) {
      if (g.flee === 1) { g.flee = 2; g.tx = 0; g.tz = WALL + 20; return; }
      if (g.flee === 2) { g.on = false; this.goblin.visible = false; return; }
      g.tx = (Math.random() - 0.5) * (HALF * 1.7);
      g.tz = (Math.random() - 0.5) * (HALF * 1.7);
    } else {
      const step = Math.min(d, (g.flee ? 13 : 6.5) * dt);
      g.x += (dx / d) * step;
      g.z += (dz / d) * step;
      if (!g.flee) this.unstick(g, 0.5);
      this.goblin.rotation.y = Math.atan2(dx, dz);
    }
    const sq = (this.goblin.userData.squash as number) || 0;
    this.goblin.userData.squash = Math.max(0, sq - dt);
    this.goblin.position.set(g.x, Math.abs(Math.sin(this.t * 11)) * 0.55, g.z);
    animateUnit(this.goblin, this.t, true, 9, 1);
    if (sq > 0) this.goblin.scale.set(1.5, 0.75, 1.5);
    if (Math.random() < dt * 4) this.fx.puff(g.x, 0.9, g.z, 1, 0xffd23a, 2, 0.16, 0.6, 10);
  }

  // ------------------------------------------------------------ frame

  private placeCamera(k: number): void {
    const show = this.showT > 0 && !this.place;
    if (show) this.camTarget.lerp(this.tmp.set(0, 0, WALL * 0.5), k * 0.35);
    else this.camTarget.lerp(this.place ? this.panTarget : this.kingPos, k);
    this.viewDist += ((show ? 84 : this.dist) - this.viewDist) * (k >= 1 ? 1 : k * 0.45);
    const aspect = this.gfx.w / this.gfx.h;
    const dist = this.viewDist * (aspect < 1 ? Math.min(1.7, 0.75 + 0.3 / aspect) : 1);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.camTarget.x + Math.sin(this.yaw) * cp * dist,
      this.camTarget.y + sp * dist + 1,
      this.camTarget.z + Math.cos(this.yaw) * cp * dist,
    );
    this.tmp.copy(this.camTarget);
    this.tmp.y += 2;
    this.camera.lookAt(this.tmp);
    this.stage.sun.target.position.copy(this.camTarget);
    this.stage.sun.position.set(this.camTarget.x + 30, 66, this.camTarget.z + 26);
  }

  update(dt: number): void {
    this.t += dt;
    const stage = Math.min(9, this.game.currentTier());
    if (stage !== this.envStage) this.setEnv(stage, this.envStage >= 0 && stage > this.envStage);
    if (this.showT > 0) this.showT -= dt;
    if (this.env) {
      if (this.envPop > 0) {
        // New walls rise out of the ground with a little overshoot.
        this.envPop = Math.max(0, this.envPop - dt);
        const u = 1 - this.envPop;
        this.env.scale.y = Math.max(0.02, 1 + 0.25 * Math.sin(u * Math.PI) * (1 - u) - Math.pow(1 - u, 3));
      } else if (this.env.scale.y !== 1) this.env.scale.y = 1;
    }
    this.sync();
    this.moveKing(dt);
    if (!this.place) this.autoCollect(dt);
    this.updateWalkers(dt);
    this.updateGoblin(dt);
    driftClouds(this.stage, dt, 54, this.t);

    // Press and hold a building to pick it up.
    if (this.hold && !this.place) {
      this.hold.t += dt;
      if (this.hold.t > 0.55) {
        const hit = this.pickAt(this.hold.x, this.hold.y);
        this.hold = null;
        if (hit && hit.kind === 'building' && this.beginMove(hit.id, true)) { this.swallowTap = true; this.hooks.sfx('open'); }
      }
    }
    if (this.place) {
      this.place.ghost.position.y = 0.5 + Math.sin(this.t * 5) * 0.12;
      (this.pad.material as THREE.MeshBasicMaterial).opacity = 0.42 + Math.sin(this.t * 6) * 0.1;
    }

    if (this.marker.visible) {
      this.markerT += dt;
      const s = 1 + Math.sin(this.markerT * 8) * 0.15;
      this.marker.scale.set(s, s, s);
    }
    this.moteT -= dt;
    const motes = this.moteT <= 0;
    if (motes) this.moteT = 0.22;
    for (const e of this.entries.values()) {
      if (e.pop > 0) {
        e.pop = Math.max(0, e.pop - dt);
        const k = 1 - e.pop / 0.45;
        const s = 1 + Math.sin(k * Math.PI) * 0.18 * (1 - k * 0.3);
        e.group.scale.set(s, 0.7 + 0.3 * k + Math.sin(k * Math.PI) * 0.2, s);
      } else if (e.group.scale.y !== 1) e.group.scale.set(1, 1, 1);
      if (e.scaffold) e.scaffold.position.y = Math.abs(Math.sin(this.t * 6)) * 0.08;
      const inner = e.group.children[0];
      if (inner) {
        for (const ch of inner.children) {
          if (ch.userData.spin) ch.rotation.z += dt * (ch.userData.spin as number);
          const cloth = ch.children[0];
          if (cloth && cloth.userData.flag) cloth.rotation.y = Math.sin(this.t * 3) * 0.35;
          if (ch.userData.glow) ch.scale.setScalar((ch.userData.glow as number) * (1 + Math.sin(this.t * 4 + e.id) * 0.08));
        }
      }
      const cr = e.group.userData.crystal as THREE.Object3D | undefined;
      if (cr) {
        e.pulse = Math.max(0, e.pulse - dt * 5);
        cr.rotation.y += dt * (0.9 + e.pulse * 6);
        cr.position.y = (cr.userData.floatY as number) + Math.sin(this.t * 1.6) * 0.2;
        cr.scale.setScalar(1 + e.pulse * 0.3);
        if (motes && e.group.visible) {
          cr.getWorldPosition(this.tmp);
          this.fx.waft(this.tmp.x + (Math.random() - 0.5) * 3, this.tmp.y - 1 + Math.random() * 2, this.tmp.z + (Math.random() - 0.5) * 3, Math.random() < 0.3 ? 0xc9a8ff : 0x9fefff, 0.1, 1.5, 0.5);
        }
      }
      const smoke = e.group.userData.smoke as number[][] | undefined;
      if (smoke && smoke.length && !e.scaffold && e.group.visible) {
        e.smokeT -= dt;
        if (e.smokeT <= 0) {
          e.smokeT = 0.4 + Math.random() * 0.5;
          for (const p of smoke) this.fx.waft(e.x + p[0], p[1], e.z + p[2], 0xf1edf5, 0.42, 2.6);
        }
      }
    }
    for (const o of this.obs.values()) {
      if (o.wob > 0) {
        o.wob = Math.max(0, o.wob - dt);
        o.mesh.rotation.z = Math.sin(o.wob * 40) * o.wob * 0.5;
        o.mesh.scale.setScalar(1 - o.wob * 0.25);
      }
    }
    this.fx.update(dt);

    // Merchant cart rolls in through the gate and waits by the road.
    const here = this.game.s.merchantHere > 0;
    const targetZ = here ? WALL + (this.envStage >= 5 ? 15 : 12) : WALL + 44;
    this.cartZ += (targetZ - this.cartZ) * Math.min(1, dt * 1.6);
    this.cart.visible = here || this.cartZ < WALL + 40;
    this.cart.position.set(7.6, 0, this.cartZ);

    this.placeCamera(1 - Math.exp(-dt * 7));
    this.labelT -= dt;
    if (this.labelT <= 0) { this.labelT = 0.25; this.refreshLabels(); }
    this.positionLabels();
  }

  private refreshLabels(): void {
    const game = this.game;
    for (const [id, e] of this.entries) {
      const b = game.byId(id);
      if (!b) continue;
      let html = '';
      if (b.busy > 0) {
        const pct = Math.round((1 - b.busy / Math.max(0.01, b.busyTotal)) * 100);
        html = `<div class="wl-timer">${IC.hammer}<b>${fmtTime(b.busy)}</b><i style="width:${pct}%"></i></div>`;
      } else if (b.type === 'spire' && b.level > 0) {
        html = `<button class="wl-magic">${IC.wand}</button>`;
      } else if (this.worthCollecting(b)) {
        const r = b.type === 'keep' ? 'gold' : BUILDINGS[b.type].produces!;
        const full = b.type !== 'keep' && b.buf >= game.bufCap(b) * 0.98;
        html = `<button class="wl-collect${full ? ' full' : ''}">${resIcon(r)}</button>`;
      } else if (!game.upgradeBlock(b)) {
        html = `<div class="wl-up">${IC.up}</div>`;
      }
      if (e.label.dataset.h !== html) { e.label.dataset.h = html; e.label.innerHTML = html; }
    }
  }
  private positionLabels(): void {
    const place = (el: HTMLElement, x: number, y: number, z: number) => {
      this.tmp.set(x, y, z).project(this.camera);
      if (this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.15 || Math.abs(this.tmp.y) > 1.15) { el.style.display = 'none'; return; }
      el.style.display = '';
      el.style.transform = `translate(${((this.tmp.x * 0.5 + 0.5) * this.gfx.w).toFixed(1)}px,${((-this.tmp.y * 0.5 + 0.5) * this.gfx.h).toFixed(1)}px)`;
    };
    for (const e of this.entries.values()) {
      if (!e.label.firstChild || !e.group.visible) { e.label.style.display = 'none'; continue; }
      place(e.label, e.x, this.heightOf(e), e.z);
    }
    if (this.cart.visible && this.game.s.merchantHere > 0) place(this.cartLabel, 7.6, 4.4, this.cartZ);
    else this.cartLabel.style.display = 'none';
  }

  setActive(on: boolean): void {
    if (!on) this.cancelPlace();
    this.active = on;
    this.labels.style.display = on ? '' : 'none';
    this.keys.clear();
    this.hold = null;
    if (on) this.resize();
  }
  resize(): void {
    this.camera.aspect = this.gfx.w / this.gfx.h;
    this.camera.updateProjectionMatrix();
  }
  render(): void {
    this.gfx.renderer.render(this.stage.scene, this.camera);
  }
  dispose(): void { this.pointer.dispose(); }
}
