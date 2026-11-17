// Cartoon fantasy models built from primitives and merged into one vertex-coloured mesh each.
// Every model gets ground-contact shading baked into its colours and a smoothed-normal attribute for ink outlines.
import * as THREE from 'three';
import type { BType } from './data';
import { BUILDINGS, TILE, rng } from './data';

export const C = {
  stone: 0xc9cdd9, stoneD: 0x9299ad, stoneL: 0xe6e9f1, wood: 0xb98048, woodD: 0x7a4f2c, woodL: 0xdcaa6a, plank: 0xc99455,
  cream: 0xfff1d2, plaster: 0xf7e3bb, roofR: 0xe5503a, roofB: 0x3f7fe6, roofG: 0x3fae68, roofP: 0x9457e0, roofT: 0x2bb5a8,
  gold: 0xffc93a, goldD: 0xd9981a, skin: 0xffd3ac, dark: 0x352c3c, white: 0xffffff, grass: 0x7fd456, grassD: 0x63bd45,
  dirt: 0xd2a56c, soil: 0x99653a, straw: 0xf0cf63, strawD: 0xd3ab3f, leaf: 0x4cb257, leafD: 0x35934a, leafL: 0x82d868,
  water: 0x58c6f6, metal: 0xd7dde8, metalD: 0x5d6477, red: 0xe04848, blue: 0x3b82f6, shadow: 0x5aa844, glass: 0x9bd9ff,
  lit: 0xffe89a, fire: 0xff7a22, pink: 0xff8fb6, orange: 0xf59a23, purple: 0x9b6cf0, mana: 0x66e6ff, manaD: 0x2fa9e0,
  blossom: 0xffa8d2, moss: 0x7fb85a, coal: 0x3d3a45, rope: 0xcbb07a, cloth: 0xf4ead2,
};
export const TEAM = { player: 0x3b82f6, enemy: 0xe24a4a, rebel: 0x8e5bd6 };
/** Global render options the views can flip (set from Gfx). */
export const artOpts = { outline: true };

const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _c = new THREE.Color();

/** Returns `hex` made lighter or darker. */
export function shade(hex: number, f: number): number {
  return _c.setHex(hex).multiplyScalar(f).getHex();
}

/** Mesh builder: accumulates coloured primitives, then bakes them into one geometry. */
export class MB {
  private pos: number[] = [];
  private nor: number[] = [];
  private col: number[] = [];
  private base = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];
  /** Small per-part brightness wobble so planks and stones are not perfectly uniform. */
  jitter = 0.07;
  rand: () => number;

  constructor(seed = 1) { this.rand = rng(seed * 977 + 13); }

  /** Everything added until the matching pop() is moved / turned / scaled by this transform. */
  push(x = 0, y = 0, z = 0, ry = 0, s = 1): this {
    this.stack.push(this.base.clone());
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(s, s, s));
    this.base.multiply(_m);
    return this;
  }
  pop(): this {
    const b = this.stack.pop();
    if (b) this.base.copy(b);
    return this;
  }
  add(g: THREE.BufferGeometry, color: number, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): this {
    const geo = g.index ? g.toNonIndexed() : g;
    _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    _m.premultiply(this.base);
    geo.applyMatrix4(_m);
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    _c.set(color).multiplyScalar(1 + (this.rand() - 0.5) * this.jitter);
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i));
      this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.col.push(_c.r, _c.g, _c.b);
    }
    if (geo !== g) geo.dispose();
    g.dispose();
    return this;
  }
  /** Box sitting on y. */
  box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0): this {
    return this.add(new THREE.BoxGeometry(w, h, d), color, x, y + h / 2, z, rx, ry, rz);
  }
  /** Cylinder sitting on y. */
  cyl(rt: number, rb: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 10): this {
    return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y + h / 2, z);
  }
  /** Cylinder lying on its side, centred on (x, y, z). */
  log(r: number, len: number, color: number, x: number, y: number, z: number, ry = 0, seg = 8): this {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), color, x, y, z, 0, ry, Math.PI / 2);
  }
  cone(r: number, h: number, color: number, x = 0, y = 0, z = 0, seg = 10): this {
    return this.add(new THREE.ConeGeometry(r, h, seg), color, x, y + h / 2, z);
  }
  /** Four-sided pyramid roof whose base is a w x d rectangle sitting on y. */
  pyr(w: number, d: number, h: number, color: number, x = 0, y = 0, z = 0): this {
    const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    g.rotateY(Math.PI / 4);
    g.scale(w, h, d);
    return this.add(g, color, x, y + h / 2, z);
  }
  /** Gabled roof: ridge of length len along x (before ry), base depth d, height h, sitting on y. */
  gable(len: number, d: number, h: number, color: number, x = 0, y = 0, z = 0, ry = 0): this {
    const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1, false, Math.PI / 2);
    g.scale(h / 1.5, len, d / 1.7320508);
    g.rotateZ(Math.PI / 2);
    return this.add(g, color, x, y + h / 3, z, 0, ry, 0);
  }
  sph(r: number, color: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, seg = 8): this {
    return this.add(new THREE.SphereGeometry(r, seg, Math.max(5, seg - 2)), color, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  /** Faceted rock. */
  rock(r: number, color: number, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1, ry = 0): this {
    return this.add(new THREE.IcosahedronGeometry(r, 0), color, x, y, z, 0.3, ry, 0.2, sx, sy, sz);
  }
  /** Pointed crystal (stretched octahedron) standing on y. */
  gem(r: number, h: number, color: number, x = 0, y = 0, z = 0, rz = 0, rx = 0): this {
    return this.add(new THREE.OctahedronGeometry(1, 0), color, x, y + h / 2, z, rx, 0.5, rz, r, h / 2, r);
  }
  /** Upright half disc (an arch) of radius r and thickness t, flat side on y, facing +z. */
  arch(r: number, t: number, color: number, x = 0, y = 0, z = 0): this {
    return this.add(new THREE.CylinderGeometry(r, r, t, 10, 1, false, -Math.PI / 2, Math.PI), color, x, y, z, -Math.PI / 2, 0, 0);
  }
  /**
   * Bakes the geometry. `ao` (0..1) darkens vertices near the ground, which fakes ambient occlusion and
   * grounds the model; an extra `onormal` attribute holds smoothed normals for the ink outline pass.
   */
  build(ao = 1): THREE.BufferGeometry {
    const n = this.pos.length / 3;
    if (ao > 0) {
      for (let i = 0; i < n; i++) {
        const y = this.pos[i * 3 + 1];
        const f = 1 - ao * (0.24 - 0.3 * Math.min(1, Math.max(0, y) / 2.6));
        this.col[i * 3] *= f; this.col[i * 3 + 1] *= f; this.col[i * 3 + 2] *= f;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    // Average the normals of coincident vertices so the outline shell has no gaps at hard edges.
    const sums = new Map<number, [number, number, number]>();
    const keys = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const k = (Math.round(this.pos[i * 3] * 40) * 73856093) ^ (Math.round(this.pos[i * 3 + 1] * 40) * 19349663) ^ (Math.round(this.pos[i * 3 + 2] * 40) * 83492791);
      keys[i] = k;
      let a = sums.get(k);
      if (!a) { a = [0, 0, 0]; sums.set(k, a); }
      a[0] += this.nor[i * 3]; a[1] += this.nor[i * 3 + 1]; a[2] += this.nor[i * 3 + 2];
    }
    const on = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = sums.get(keys[i])!;
      const len = Math.hypot(a[0], a[1], a[2]) || 1;
      on[i * 3] = a[0] / len; on[i * 3 + 1] = a[1] / len; on[i * 3 + 2] = a[2] / len;
    }
    g.setAttribute('onormal', new THREE.BufferAttribute(on, 3));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------------------------------------------------------------- materials

let gradient: THREE.DataTexture | null = null;
function gradientMap(): THREE.DataTexture {
  if (!gradient) {
    gradient = new THREE.DataTexture(new Uint8Array([105, 160, 205, 238, 255]), 5, 1, THREE.RedFormat);
    gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
    gradient.needsUpdate = true;
  }
  return gradient;
}
/** Adds a soft rim highlight so silhouettes pop against the grass. */
function addRim(mat: THREE.MeshToonMaterial): THREE.MeshToonMaterial {
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <opaque_fragment>',
      'float rimK = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 3.0);\n\toutgoingLight += diffuseColor.rgb * rimK * 0.4;\n\t#include <opaque_fragment>',
    );
  };
  return mat;
}
let toon: THREE.MeshToonMaterial | null = null;
export function toonMat(): THREE.MeshToonMaterial {
  if (!toon) toon = addRim(new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap() }));
  return toon;
}
export function flatToon(color: number, map?: THREE.Texture): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: gradientMap(), map: map || null });
}
const outlineMats = new Map<number, THREE.ShaderMaterial>();
function outlineMat(thick: number): THREE.ShaderMaterial {
  let m = outlineMats.get(thick);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: { thick: { value: thick }, ink: { value: new THREE.Color(0x3a2a1e) } },
      vertexShader: 'attribute vec3 onormal;\nuniform float thick;\nvoid main() {\n  gl_Position = projectionMatrix * modelViewMatrix * vec4(position + onormal * thick, 1.0);\n}',
      fragmentShader: 'uniform vec3 ink;\nvoid main() {\n  gl_FragColor = vec4(ink, 1.0);\n  #include <colorspace_fragment>\n}',
      side: THREE.BackSide,
    });
    outlineMats.set(thick, m);
  }
  return m;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
function mesh(geo: THREE.BufferGeometry, shadow = true, outline = 0.055): THREE.Mesh {
  const m = new THREE.Mesh(geo, toonMat());
  m.castShadow = shadow;
  m.receiveShadow = true;
  if (outline > 0 && artOpts.outline) {
    const o = new THREE.Mesh(geo, outlineMat(outline));
    o.userData.outline = true;
    m.add(o);
  }
  return m;
}

let glowTex: THREE.CanvasTexture | null = null;
/** Soft additive halo for lanterns, crystals and forges. */
export function glowSprite(color: number, size: number): THREE.Sprite {
  if (!glowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.3, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.75, fog: false }));
  s.scale.setScalar(size);
  s.userData.glow = size;
  s.raycast = () => {};
  return s;
}

// ---------------------------------------------------------------- units

export type UnitModel = 'peasant' | 'archer' | 'knight' | 'rider' | 'mage' | 'catapult' | 'king' | 'boss' | 'villager' | 'merchant' | 'goblin' | 'chicken' | 'sheep';

const TUNICS = [0xe07a5f, 0x81b29a, 0xf2cc8f, 0x6d8fd6, 0xc98bdb, 0xe9a23b];
const HAIR = [0x7a4a2a, 0x3d2b1f, 0xd9a441, 0xb5532a, 0x8d8d8d, 0x5a3b22];

function body(mb: MB, tunic: number, trim = C.woodD, shadowR = 0.52, skin = C.skin): void {
  if (shadowR > 0) mb.cyl(shadowR, shadowR, 0.03, C.shadow, 0, 0.005, 0, 10);
  // Boots, legs, tunic with hem, belt and buckle.
  mb.box(0.21, 0.17, 0.32, 0x5a3b22, -0.16, 0, 0.05).box(0.21, 0.17, 0.32, 0x5a3b22, 0.16, 0, 0.05);
  mb.cyl(0.3, 0.43, 0.6, tunic, 0, 0.15, 0, 8).cyl(0.44, 0.45, 0.07, shade(tunic, 0.8), 0, 0.15, 0, 8);
  mb.cyl(0.39, 0.41, 0.09, trim, 0, 0.36, 0, 8).box(0.12, 0.1, 0.05, C.gold, 0, 0.36, 0.4);
  mb.cyl(0.2, 0.27, 0.1, shade(tunic, 1.12), 0, 0.72, 0, 8);
  // Head with eyes, nose and rosy cheeks.
  mb.sph(0.35, skin, 0, 1.08, 0, 1, 1, 1, 10);
  mb.sph(0.06, C.dark, -0.13, 1.14, 0.31, 1, 1.2, 1, 5).sph(0.06, C.dark, 0.13, 1.14, 0.31, 1, 1.2, 1, 5);
  mb.sph(0.055, shade(skin, 0.88), 0, 1.05, 0.35, 1, 1, 1, 5);
  mb.sph(0.07, C.pink, -0.22, 1.0, 0.26, 1, 0.7, 0.5, 5).sph(0.07, C.pink, 0.22, 1.0, 0.26, 1, 0.7, 0.5, 5);
  // Arms and hands.
  mb.sph(0.14, tunic, -0.4, 0.66, 0.04, 1, 1.2, 1, 6).sph(0.14, tunic, 0.4, 0.66, 0.04, 1, 1.2, 1, 6);
  mb.sph(0.1, skin, -0.45, 0.5, 0.16, 1, 1, 1, 6).sph(0.1, skin, 0.45, 0.5, 0.16, 1, 1, 1, 6);
}
function pony(mb: MB, coat: number): void {
  mb.cyl(0.75, 0.75, 0.03, C.shadow, 0, 0.005, 0, 10);
  mb.sph(0.42, coat, 0, 0.62, 0, 0.95, 0.9, 1.6);
  for (const [x, z] of [[-0.22, 0.42], [0.22, 0.42], [-0.22, -0.42], [0.22, -0.42]]) {
    mb.cyl(0.09, 0.08, 0.36, coat, x, 0.06, z, 6).cyl(0.1, 0.1, 0.08, C.dark, x, 0, z, 6);
  }
  mb.box(0.26, 0.5, 0.3, coat, 0, 0.72, 0.6, 0, 0.5);
  mb.sph(0.2, coat, 0, 1.2, 0.85, 0.9, 0.85, 1.35).sph(0.12, shade(coat, 1.25), 0, 1.14, 1.04, 1, 0.8, 0.8, 6);
  mb.sph(0.04, C.dark, -0.13, 1.26, 0.95, 1, 1, 1, 5).sph(0.04, C.dark, 0.13, 1.26, 0.95, 1, 1, 1, 5);
  mb.box(0.08, 0.38, 0.3, C.dark, 0, 0.98, 0.5, 0, 0.5);
  mb.sph(0.1, C.dark, 0, 0.7, -0.68, 0.8, 1.7, 0.8, 6);
  mb.cone(0.05, 0.14, coat, -0.1, 1.34, 0.76, 5).cone(0.05, 0.14, coat, 0.1, 1.34, 0.76, 5);
  mb.box(0.5, 0.08, 0.5, C.red, 0, 0.98, -0.05).box(0.54, 0.04, 0.12, C.gold, 0, 1.0, 0.18);
}

function buildUnit(kind: UnitModel, team: number, variant: number): THREE.BufferGeometry {
  const mb = new MB(variant + 3);
  mb.jitter = 0.04;
  switch (kind) {
    case 'peasant':
      body(mb, team);
      mb.cyl(0.54, 0.6, 0.05, C.straw, 0, 1.3, 0, 10).cyl(0.2, 0.3, 0.22, C.strawD, 0, 1.34, 0, 8).cyl(0.305, 0.305, 0.05, C.red, 0, 1.36, 0, 8);
      mb.cyl(0.035, 0.035, 1.4, C.woodD, 0.5, 0.16, 0.2, 5).box(0.32, 0.045, 0.045, C.metal, 0.5, 1.52, 0.2);
      for (const dx of [-0.14, 0, 0.14]) mb.box(0.04, 0.28, 0.04, C.metal, 0.5 + dx, 1.52, 0.2);
      mb.box(0.3, 0.3, 0.05, 0x8a5a33, 0, 0.4, 0.4);
      break;
    case 'archer':
      body(mb, team, C.leafD);
      mb.cone(0.4, 0.6, C.leafD, 0, 1.2, 0, 8).sph(0.38, C.leafD, 0, 1.1, -0.1, 1, 1, 0.9);
      mb.cone(0.03, 0.34, C.red, 0.22, 1.5, -0.05, 4);
      mb.box(0.05, 0.52, 0.05, C.woodD, -0.52, 0.28, 0.3, 0, 0.35).box(0.05, 0.52, 0.05, C.woodD, -0.52, 0.72, 0.43, 0, -0.35);
      mb.box(0.015, 0.88, 0.015, C.white, -0.52, 0.26, 0.2);
      mb.cyl(0.1, 0.1, 0.48, C.wood, 0.18, 0.5, -0.38, 6).cyl(0.11, 0.11, 0.06, C.gold, 0.18, 0.9, -0.38, 6);
      for (const [dx, col] of [[-0.04, C.white], [0.04, C.red], [0, C.gold]] as [number, number][]) mb.box(0.03, 0.2, 0.03, col, 0.18 + dx, 0.96, -0.38);
      break;
    case 'knight':
      body(mb, C.metal, team, 0.56);
      mb.box(0.38, 0.44, 0.06, team, 0, 0.3, 0.38).box(0.1, 0.24, 0.07, C.gold, 0, 0.42, 0.39).box(0.24, 0.08, 0.07, C.gold, 0, 0.52, 0.39);
      mb.sph(0.39, C.metal, 0, 1.1, 0, 1, 1, 1, 10).box(0.44, 0.09, 0.14, C.dark, 0, 1.08, 0.3).box(0.06, 0.3, 0.1, C.metalD, 0, 0.98, 0.34);
      mb.box(0.08, 0.32, 0.34, team, 0, 1.4, -0.05).sph(0.12, team, 0, 1.7, 0.04);
      mb.sph(0.19, C.metalD, -0.42, 0.78, 0.02, 1, 0.7, 1, 6).sph(0.19, C.metalD, 0.42, 0.78, 0.02, 1, 0.7, 1, 6);
      mb.add(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 10), team, -0.52, 0.58, 0.26, Math.PI / 2, 0, 0);
      mb.add(new THREE.CylinderGeometry(0.39, 0.39, 0.04, 10), C.gold, -0.52, 0.58, 0.24, Math.PI / 2, 0, 0);
      mb.add(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8), C.gold, -0.52, 0.58, 0.3, Math.PI / 2, 0, 0);
      mb.box(0.08, 0.82, 0.035, C.stoneL, 0.52, 0.5, 0.26).box(0.28, 0.06, 0.08, C.gold, 0.52, 0.46, 0.26).sph(0.05, C.red, 0.52, 0.4, 0.26, 1, 1, 1, 5);
      break;
    case 'rider':
      pony(mb, variant % 2 ? 0xc98f55 : 0xa5673f);
      mb.push(0, 0.62, -0.05, 0, 0.78);
      body(mb, team, C.woodD, 0);
      mb.sph(0.37, C.metal, 0, 1.14, -0.02, 1, 0.8, 1).cone(0.08, 0.3, team, 0, 1.4, 0, 6);
      mb.add(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 5), C.woodL, 0.5, 0.75, 0.55, Math.PI / 2, 0, 0);
      mb.add(new THREE.ConeGeometry(0.08, 0.32, 6), C.metal, 0.5, 0.75, 1.82, Math.PI / 2, 0, 0);
      mb.box(0.02, 0.22, 0.34, team, 0.5, 0.78, 1.3).box(0.02, 0.1, 0.34, C.gold, 0.5, 0.74, 1.3);
      mb.pop();
      break;
    case 'mage':
      mb.cyl(0.52, 0.52, 0.03, C.shadow, 0, 0.005, 0, 10);
      mb.cyl(0.26, 0.5, 0.78, team, 0, 0, 0, 8).cyl(0.5, 0.52, 0.1, C.gold, 0, 0, 0, 8).box(0.1, 0.6, 0.06, C.gold, 0, 0.1, 0.4);
      mb.sph(0.35, C.skin, 0, 1.08, 0, 1, 1, 1, 10);
      mb.sph(0.06, C.dark, -0.13, 1.14, 0.31, 1, 1.2, 1, 5).sph(0.06, C.dark, 0.13, 1.14, 0.31, 1, 1.2, 1, 5);
      mb.sph(0.24, C.white, 0, 0.9, 0.24, 1, 1.3, 0.6).sph(0.1, C.white, -0.12, 1.2, 0.3, 1.3, 0.5, 0.6, 5).sph(0.1, C.white, 0.12, 1.2, 0.3, 1.3, 0.5, 0.6, 5);
      mb.cyl(0.58, 0.58, 0.05, team, 0, 1.3, 0, 10).cone(0.34, 0.6, team, 0, 1.33, 0, 8);
      mb.add(new THREE.ConeGeometry(0.2, 0.5, 8), team, 0.1, 2.05, -0.06, 0.2, 0, -0.5);
      mb.cyl(0.345, 0.36, 0.09, C.gold, 0, 1.35, 0, 8).gem(0.07, 0.16, C.gold, 0, 1.52, 0.3);
      mb.sph(0.13, team, -0.42, 0.62, 0.06, 1, 1, 1, 6).sph(0.13, team, 0.42, 0.62, 0.06, 1, 1, 1, 6);
      mb.cyl(0.04, 0.04, 1.5, C.woodD, 0.52, 0.1, 0.2, 5).gem(0.16, 0.42, C.mana, 0.52, 1.56, 0.2);
      mb.box(0.24, 0.05, 0.05, C.woodD, 0.52, 1.5, 0.2).box(0.05, 0.05, 0.24, C.woodD, 0.52, 1.5, 0.2);
      break;
    case 'catapult':
      mb.box(1.5, 0.03, 2.0, C.shadow, 0, 0.005, 0);
      mb.box(1.0, 0.18, 1.7, C.wood, 0, 0.34, 0).box(1.1, 0.08, 0.2, C.metalD, 0, 0.4, 0.7).box(1.1, 0.08, 0.2, C.metalD, 0, 0.4, -0.7);
      for (const [x, z] of [[-0.6, 0.6], [0.6, 0.6], [-0.6, -0.6], [0.6, -0.6]]) {
        mb.log(0.34, 0.16, C.woodD, x, 0.34, z, 0, 10).log(0.1, 0.2, C.metalD, x, 0.34, z, 0, 6);
        mb.box(0.17, 0.06, 0.6, C.woodL, x, 0.31, z).box(0.17, 0.6, 0.06, C.woodL, x, 0.04, z);
      }
      mb.box(0.12, 1.0, 0.12, C.woodD, -0.42, 0.5, 0.3).box(0.12, 1.0, 0.12, C.woodD, 0.42, 0.5, 0.3);
      mb.box(0.1, 0.9, 0.1, C.woodD, -0.42, 0.5, -0.05, 0, 0.5).box(0.1, 0.9, 0.1, C.woodD, 0.42, 0.5, -0.05, 0, 0.5);
      mb.log(0.07, 1.0, C.metalD, 0, 1.45, 0.3);
      mb.box(0.12, 0.12, 2.1, C.woodL, 0, 1.2, -0.2, 0, -0.45);
      mb.cyl(0.26, 0.18, 0.2, C.woodD, 0, 0.72, -1.1, 8).rock(0.24, C.stoneD, 0, 0.98, -1.1);
      mb.box(0.34, 0.34, 0.34, C.stoneD, 0, 1.55, 0.72).box(0.38, 0.06, 0.38, C.metalD, 0, 1.7, 0.72);
      mb.box(0.02, 0.3, 0.42, team, 0.5, 1.5, 0.3).cyl(0.03, 0.03, 0.5, C.woodD, 0.5, 1.4, 0.5, 5);
      break;
    case 'king':
      body(mb, team, C.gold, 0.56);
      mb.box(0.66, 0.84, 0.08, C.red, 0, 0.1, -0.36, 0, 0.12).box(0.7, 0.16, 0.14, C.white, 0, 0.8, -0.3);
      for (const dx of [-0.2, 0, 0.2]) mb.sph(0.03, C.dark, dx, 0.88, -0.24, 1, 1, 1, 4);
      mb.sph(0.2, 0xb5651d, 0, 0.93, 0.25, 1.25, 1, 0.6).sph(0.1, 0xb5651d, -0.14, 1.02, 0.32, 1.4, 0.5, 0.5, 5).sph(0.1, 0xb5651d, 0.14, 1.02, 0.32, 1.4, 0.5, 0.5, 5);
      mb.cyl(0.3, 0.27, 0.16, C.gold, 0, 1.36, 0, 10).cyl(0.28, 0.28, 0.06, C.red, 0, 1.36, 0, 10);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        mb.cone(0.07, 0.22, C.gold, Math.sin(a) * 0.26, 1.5, Math.cos(a) * 0.26, 4).sph(0.035, i % 2 ? C.mana : C.red, Math.sin(a) * 0.26, 1.74, Math.cos(a) * 0.26, 1, 1, 1, 4);
      }
      mb.box(0.1, 0.92, 0.04, C.gold, 0.54, 0.5, 0.26).box(0.3, 0.07, 0.08, C.red, 0.54, 0.46, 0.26).sph(0.06, C.mana, 0.54, 0.4, 0.26, 1, 1, 1, 5);
      mb.box(0.2, 0.26, 0.05, C.gold, 0, 0.46, 0.4);
      break;
    case 'boss':
      body(mb, 0x4d6fb8, 0x3d5a9a, 0.6);
      mb.box(0.5, 0.34, 0.06, 0x4d6fb8, 0, 0.62, 0.3);
      mb.box(0.06, 0.4, 0.06, 0x3d5a9a, -0.2, 0.7, 0.3).box(0.06, 0.4, 0.06, 0x3d5a9a, 0.2, 0.7, 0.3);
      mb.box(0.2, 0.05, 0.05, C.dark, -0.14, 1.25, 0.3, 0, 0, -0.35).box(0.2, 0.05, 0.05, C.dark, 0.14, 1.25, 0.3, 0, 0, 0.35);
      mb.sph(0.22, C.white, 0, 0.92, 0.26, 1.3, 0.8, 0.6);
      mb.cyl(0.74, 0.8, 0.06, C.straw, 0, 1.3, 0, 12).cyl(0.26, 0.34, 0.28, C.strawD, 0, 1.35, 0, 8).cyl(0.345, 0.345, 0.07, C.red, 0, 1.37, 0, 8);
      mb.cyl(0.05, 0.05, 1.9, C.woodD, 0.56, 0.05, 0.2, 6).box(0.5, 0.06, 0.06, C.metal, 0.56, 1.95, 0.2);
      for (const dx of [-0.22, 0, 0.22]) mb.box(0.05, 0.42, 0.05, C.metal, 0.56 + dx, 1.95, 0.2);
      mb.sph(0.16, 0xf3ecf7, -0.5, 0.42, 0.26).cone(0.08, 0.16, C.leaf, -0.5, 0.54, 0.26, 5).sph(0.1, C.purple, -0.5, 0.36, 0.3, 1, 0.5, 1, 5);
      mb.box(0.7, 0.9, 0.06, C.roofP, 0, 0.1, -0.38, 0, 0.1);
      break;
    case 'merchant':
      body(mb, 0x8e5bd6, C.gold);
      mb.sph(0.37, C.white, 0, 1.3, 0, 1.05, 0.62, 1.05).gem(0.07, 0.18, C.gold, 0, 1.3, 0.34).cone(0.04, 0.3, C.red, 0, 1.5, 0, 4);
      mb.sph(0.16, 0x5a3b22, 0, 0.94, 0.26, 1.1, 0.8, 0.6);
      mb.box(0.3, 0.34, 0.2, 0x8a5a33, 0.42, 0.3, -0.2).box(0.34, 0.06, 0.24, C.gold, 0.42, 0.6, -0.2);
      break;
    case 'goblin': {
      const g = 0x7ccf4a;
      mb.cyl(0.5, 0.5, 0.03, C.shadow, 0, 0.005, 0, 10);
      mb.box(0.2, 0.14, 0.34, 0x5a3b22, -0.15, 0, 0.06).box(0.2, 0.14, 0.34, 0x5a3b22, 0.15, 0, 0.06);
      mb.cyl(0.26, 0.38, 0.46, 0x8a5a33, 0, 0.12, 0, 8).cyl(0.37, 0.38, 0.07, C.gold, 0, 0.26, 0, 8);
      mb.sph(0.36, g, 0, 0.9, 0.02, 1.1, 0.95, 1, 10);
      mb.add(new THREE.ConeGeometry(0.11, 0.5, 5), g, -0.5, 0.98, -0.02, 0, 0, 1.15).add(new THREE.ConeGeometry(0.11, 0.5, 5), g, 0.5, 0.98, -0.02, 0, 0, -1.15);
      mb.sph(0.09, 0xfff27a, -0.14, 0.97, 0.32, 1, 1.1, 0.6, 6).sph(0.09, 0xfff27a, 0.14, 0.97, 0.32, 1, 1.1, 0.6, 6);
      mb.sph(0.04, C.dark, -0.14, 0.97, 0.38, 1, 1, 1, 4).sph(0.04, C.dark, 0.14, 0.97, 0.38, 1, 1, 1, 4);
      mb.cone(0.07, 0.2, shade(g, 0.85), 0, 0.82, 0.42, 5).box(0.24, 0.04, 0.04, C.dark, 0, 0.74, 0.34);
      mb.cone(0.035, 0.09, C.white, -0.08, 0.74, 0.34, 4).cone(0.035, 0.09, C.white, 0.08, 0.74, 0.34, 4);
      mb.sph(0.11, g, -0.36, 0.48, 0.12, 1, 1, 1, 6).sph(0.11, g, 0.36, 0.48, 0.12, 1, 1, 1, 6);
      // Bulging loot sack with coins poking out.
      mb.sph(0.42, 0xc7a66a, 0, 0.62, -0.42, 1, 1.1, 1, 8).cyl(0.12, 0.2, 0.16, 0xb08f55, 0, 1.0, -0.42, 6).cyl(0.2, 0.2, 0.04, C.rope, 0, 1.0, -0.42, 6);
      mb.add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8), C.gold, 0.1, 1.18, -0.4, 0.6, 0, 0.4).add(new THREE.CylinderGeometry(0.1, 0.1, 0.03, 8), C.gold, -0.08, 1.14, -0.46, 1.2, 0, 0);
      break;
    }
    case 'chicken':
      mb.cyl(0.26, 0.26, 0.02, C.shadow, 0, 0.005, 0, 8);
      mb.sph(0.24, C.white, 0, 0.3, 0, 0.9, 0.95, 1.15).sph(0.15, C.white, 0, 0.56, 0.16);
      mb.cone(0.05, 0.12, C.orange, 0, 0.5, 0.28, 4).sph(0.03, C.dark, -0.07, 0.6, 0.26, 1, 1, 1, 4).sph(0.03, C.dark, 0.07, 0.6, 0.26, 1, 1, 1, 4);
      mb.box(0.04, 0.1, 0.14, C.red, 0, 0.66, 0.14).sph(0.1, C.white, 0, 0.42, -0.24, 0.5, 1.2, 0.8, 5);
      mb.box(0.03, 0.12, 0.03, C.orange, -0.07, 0, 0.02).box(0.03, 0.12, 0.03, C.orange, 0.07, 0, 0.02);
      break;
    case 'sheep':
      mb.cyl(0.44, 0.44, 0.02, C.shadow, 0, 0.005, 0, 8);
      mb.sph(0.36, 0xf7f3ea, 0, 0.5, 0, 1, 0.9, 1.3).sph(0.2, 0xf7f3ea, 0.16, 0.66, 0.1).sph(0.2, 0xf7f3ea, -0.16, 0.64, -0.12).sph(0.18, 0xf7f3ea, 0, 0.7, -0.3);
      mb.sph(0.17, C.dark, 0, 0.6, 0.46, 0.9, 1, 1.1).sph(0.16, 0xf7f3ea, 0, 0.74, 0.4, 1, 0.6, 0.8, 6);
      for (const [x, z] of [[-0.16, 0.26], [0.16, 0.26], [-0.16, -0.26], [0.16, -0.26]]) mb.cyl(0.05, 0.05, 0.26, C.dark, x, 0, z, 5);
      break;
    default: {
      body(mb, TUNICS[variant % TUNICS.length]);
      const hair = HAIR[variant % HAIR.length];
      if (variant % 3 === 0) mb.cyl(0.5, 0.56, 0.05, C.straw, 0, 1.3, 0, 10).cyl(0.2, 0.28, 0.2, C.strawD, 0, 1.34, 0, 8);
      else if (variant % 3 === 1) mb.sph(0.37, hair, 0, 1.15, -0.05, 1, 0.9, 1).sph(0.12, hair, 0, 1.44, -0.1, 1, 1, 1, 6);
      else mb.sph(0.37, TUNICS[(variant + 2) % TUNICS.length], 0, 1.17, -0.04, 1, 0.8, 1).sph(0.14, hair, 0, 0.98, -0.36, 1, 1.6, 1, 6);
      if (variant % 2) mb.box(0.36, 0.34, 0.05, C.cloth, 0, 0.3, 0.4);
    }
  }
  return mb.build(0.45);
}

export function unitMesh(kind: UnitModel, team: number, variant = 0, outline = true): THREE.Mesh {
  const v = kind === 'villager' ? variant % 6 : kind === 'rider' ? variant % 2 : 0;
  const m = mesh(cached(`u:${kind}:${team}:${v}`, () => buildUnit(kind, team, v)), false, outline ? 0.04 : 0);
  const s = kind === 'king' ? 1.25 : kind === 'boss' ? 2.3 : kind === 'villager' ? 0.85 : kind === 'goblin' ? 1.15 : 1;
  m.scale.setScalar(s);
  m.userData.baseScale = s;
  return m;
}

// ---------------------------------------------------------------- building parts

function win(mb: MB, x: number, y: number, z: number, ry = 0, w = 0.5, h = 0.6, lit = false, shutter = 0): void {
  mb.push(x, y, z, ry);
  mb.box(w + 0.16, h + 0.16, 0.08, C.woodD, 0, -0.08, 0);
  mb.box(w, h, 0.1, lit ? C.lit : C.glass, 0, 0, 0.01);
  mb.box(0.045, h, 0.12, C.woodD, 0, 0, 0.01).box(w, 0.045, 0.12, C.woodD, 0, h / 2 - 0.02, 0.01);
  mb.box(w + 0.28, 0.07, 0.2, C.woodL, 0, -0.15, 0.06);
  if (shutter) mb.box(0.17, h, 0.05, shutter, -w / 2 - 0.13, 0, 0.03).box(0.17, h, 0.05, shutter, w / 2 + 0.13, 0, 0.03);
  mb.pop();
}
function flowerBox(mb: MB, x: number, y: number, z: number, ry = 0, w = 0.7): void {
  mb.push(x, y, z, ry);
  mb.box(w, 0.16, 0.22, C.wood, 0, 0, 0);
  const cols = [C.pink, C.gold, C.red, C.white, C.purple];
  for (let i = 0; i < 4; i++) mb.sph(0.1, cols[Math.floor(mb.rand() * cols.length)], -w / 2 + 0.12 + (i * (w - 0.24)) / 3, 0.22, 0, 1, 0.9, 1, 5);
  mb.sph(0.13, C.leaf, 0, 0.14, 0.06, w * 2.6, 0.5, 0.8, 5);
  mb.pop();
}
function door(mb: MB, x: number, y: number, z: number, ry = 0, w = 0.72, h = 1.1, color: number = C.woodD, arched = true): void {
  mb.push(x, y, z, ry);
  mb.box(w + 0.22, h, 0.1, C.stoneD, 0, 0, 0).box(w, h, 0.13, color, 0, 0, 0.01);
  if (arched) mb.arch(w / 2 + 0.11, 0.1, C.stoneD, 0, h, 0).arch(w / 2, 0.13, color, 0, h, 0.01);
  for (const dx of [-w / 4, w / 4]) mb.box(0.03, h, 0.15, shade(color, 0.75), dx, 0, 0.01);
  mb.box(w, 0.06, 0.16, C.metalD, 0, h * 0.25, 0.01).box(w, 0.06, 0.16, C.metalD, 0, h * 0.75, 0.01);
  mb.sph(0.055, C.gold, w / 2 - 0.14, h * 0.5, 0.1, 1, 1, 1, 5);
  mb.box(w + 0.4, 0.1, 0.36, C.stone, 0, -0.06, 0.16);
  mb.pop();
}
/** Gabled roof with shingle rows, a ridge beam and eave boards. */
function roof(mb: MB, len: number, depth: number, h: number, color: number, x: number, y: number, z: number, ry = 0): void {
  mb.push(x, y, z, ry);
  mb.gable(len, depth, h, color, 0, 0, 0);
  const slope = Math.atan2(h, depth / 2);
  const sl = Math.hypot(h, depth / 2);
  const dark = shade(color, 0.8);
  for (const side of [-1, 1]) {
    for (const t of [0.3, 0.62, 0.94]) {
      mb.add(new THREE.BoxGeometry(len + 0.06, 0.06, sl * 0.16), dark, 0, h * (1 - t) + 0.04, side * (depth / 2) * t, side * slope, 0, 0);
    }
  }
  mb.log(0.09, len + 0.14, C.woodD, 0, h + 0.02, 0);
  for (const sx of [-1, 1]) {
    mb.add(new THREE.BoxGeometry(0.08, 0.09, sl + 0.1), C.woodL, sx * (len / 2 + 0.02), h / 2 + 0.03, depth / 4, slope, 0, 0);
    mb.add(new THREE.BoxGeometry(0.08, 0.09, sl + 0.1), C.woodL, sx * (len / 2 + 0.02), h / 2 + 0.03, -depth / 4, -slope, 0, 0);
  }
  mb.pop();
}
/** Witch-hat tower roof with banding and a finial. */
function coneRoof(mb: MB, r: number, h: number, color: number, x: number, y: number, z: number, finial: number = C.gold): void {
  const dark = shade(color, 0.78);
  mb.cyl(r * 1.0, r * 1.14, 0.14, dark, x, y, z, 10).cone(r, h, color, x, y + 0.1, z, 10);
  for (const t of [0.3, 0.58]) mb.cyl(r * (1 - t) - 0.02, r * (1 - t) + 0.05, 0.07, dark, x, y + 0.1 + h * t, z, 10);
  mb.sph(r * 0.13 + 0.05, finial, x, y + h + 0.12, z, 1, 1, 1, 6);
}
/** Stone box with a scattering of raised bricks. */
function stoneBox(mb: MB, w: number, h: number, d: number, color: number, x: number, y: number, z: number, bricks = 8): void {
  mb.box(w, h, d, color, x, y, z);
  for (let i = 0; i < bricks; i++) {
    const front = mb.rand() < 0.6;
    const col = shade(color, mb.rand() < 0.5 ? 0.86 : 1.07);
    const by = y + 0.15 + mb.rand() * Math.max(0.1, h - 0.5);
    if (front) mb.box(0.42, 0.2, 0.06, col, x + (mb.rand() - 0.5) * (w - 0.6), by, z + (mb.rand() < 0.75 ? 1 : -1) * (d / 2));
    else mb.box(0.06, 0.2, 0.42, col, x + (mb.rand() < 0.5 ? 1 : -1) * (w / 2), by, z + (mb.rand() - 0.5) * (d - 0.6));
  }
}
/** Plastered wall with dark timber framing (posts, beams and braces). */
function timberBox(mb: MB, w: number, h: number, d: number, x: number, y: number, z: number, wall: number = C.plaster): void {
  mb.box(w, h, d, wall, x, y, z);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mb.box(0.16, h, 0.16, C.woodD, x + sx * (w / 2 - 0.03), y, z + sz * (d / 2 - 0.03));
  for (const sz of [-1, 1]) {
    mb.box(w, 0.13, 0.1, C.woodD, x, y + h - 0.13, z + sz * (d / 2 + 0.01)).box(w, 0.13, 0.1, C.woodD, x, y, z + sz * (d / 2 + 0.01));
  }
  for (const sx of [-1, 1]) {
    mb.box(0.1, 0.13, d, C.woodD, x + sx * (w / 2 + 0.01), y + h - 0.13, z);
    mb.box(0.1, h * 0.8, 0.09, C.woodD, x + sx * (w / 2 - 0.42), y + 0.1, z + d / 2 + 0.01, 0, 0, sx * 0.5);
  }
}
function crenels(mb: MB, w: number, d: number, y: number, color: number, cx = 0, cz = 0): void {
  const nx = Math.max(2, Math.round(w / 0.85));
  const nz = Math.max(2, Math.round(d / 0.85));
  mb.box(w + 0.16, 0.14, d + 0.16, shade(color, 0.9), cx, y - 0.14, cz);
  for (let i = 0; i < nx; i++) {
    const x = cx - w / 2 + 0.22 + (i * (w - 0.44)) / (nx - 1);
    mb.box(0.42, 0.38, 0.4, color, x, y, cz - d / 2 + 0.2).box(0.42, 0.38, 0.4, color, x, y, cz + d / 2 - 0.2);
  }
  for (let i = 1; i < nz - 1; i++) {
    const z = cz - d / 2 + 0.22 + (i * (d - 0.44)) / (nz - 1);
    mb.box(0.4, 0.38, 0.42, color, cx - w / 2 + 0.2, y, z).box(0.4, 0.38, 0.42, color, cx + w / 2 - 0.2, y, z);
  }
}
function tower(mb: MB, x: number, z: number, r: number, h: number, wall: number, roofCol: number, banner = 0): void {
  mb.cyl(r * 1.08, r * 1.16, 0.3, shade(wall, 0.85), x, 0, z, 10);
  mb.cyl(r * 0.9, r, h, wall, x, 0, z, 10).cyl(r * 1.14, r * 0.94, 0.36, wall, x, h, z, 10);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    mb.box(0.3, 0.26, 0.3, shade(wall, 1.06), x + Math.sin(a) * r * 1.02, h + 0.36, z + Math.cos(a) * r * 1.02, a);
  }
  coneRoof(mb, r * 1.22, r * 2.0, roofCol, x, h + 0.42, z);
  mb.box(0.18, 0.46, 0.08, C.dark, x, h * 0.62, z + r * 0.92).box(0.18, 0.4, 0.08, C.lit, x, h * 0.3, z + r * 0.96);
  for (let i = 0; i < 4; i++) {
    const a = mb.rand() * 6.28;
    mb.box(0.3, 0.16, 0.08, shade(wall, 0.88), x + Math.sin(a) * r * 0.95, 0.5 + mb.rand() * (h - 1), z + Math.cos(a) * r * 0.95, a);
  }
  if (banner) mb.box(0.5, 1.1, 0.05, banner, x, h * 0.42, z + r * 1.02).box(0.5, 0.12, 0.06, C.gold, x, h * 0.42 + 1.02, z + r * 1.02);
}
function barrel(mb: MB, x: number, z: number, y = 0): void {
  mb.cyl(0.25, 0.25, 0.56, C.wood, x, y, z, 8).cyl(0.28, 0.28, 0.2, C.plank, x, y + 0.18, z, 8);
  mb.cyl(0.265, 0.265, 0.06, C.metalD, x, y + 0.08, z, 8).cyl(0.265, 0.265, 0.06, C.metalD, x, y + 0.42, z, 8).cyl(0.22, 0.22, 0.02, C.woodD, x, y + 0.56, z, 8);
}
function crate(mb: MB, x: number, z: number, s = 0.6, y = 0, ry = 0.3): void {
  mb.box(s, s, s, C.plank, x, y, z, ry).box(s + 0.04, 0.07, s + 0.04, C.woodD, x, y + s - 0.07, z, ry).box(s + 0.04, 0.07, s + 0.04, C.woodD, x, y, z, ry);
}
function sack(mb: MB, x: number, z: number, y = 0): void {
  mb.sph(0.28, C.cloth, x, y + 0.24, z, 1, 0.95, 0.85, 6).cyl(0.07, 0.12, 0.12, C.cloth, x, y + 0.46, z, 5).cyl(0.11, 0.11, 0.03, C.rope, x, y + 0.46, z, 5);
}
function lamp(mb: MB, x: number, z: number, h = 1.7, glow: number = C.lit): void {
  mb.cyl(0.12, 0.16, 0.14, C.stoneD, x, 0, z, 6).cyl(0.045, 0.055, h, C.metalD, x, 0.1, z, 5);
  mb.box(0.3, 0.05, 0.3, C.metalD, x, h + 0.08, z).box(0.2, 0.26, 0.2, glow, x, h + 0.13, z).pyr(0.34, 0.34, 0.16, C.metalD, x, h + 0.39, z);
}
function flagPole(mb: MB, x: number, y: number, z: number, h: number, color: number): void {
  mb.cyl(0.04, 0.05, h, C.woodD, x, y, z, 5).sph(0.07, C.gold, x, y + h, z, 1, 1, 1, 5);
  mb.box(0.62, 0.38, 0.04, color, x + 0.33, y + h - 0.44, z).box(0.62, 0.07, 0.05, C.gold, x + 0.33, y + h - 0.2, z);
}
function torch(mb: MB, x: number, y: number, z: number): void {
  mb.box(0.07, 0.4, 0.07, C.woodD, x, y, z).cyl(0.09, 0.06, 0.1, C.metalD, x, y + 0.36, z, 5).cone(0.09, 0.26, C.fire, x, y + 0.44, z, 5).cone(0.05, 0.16, C.gold, x, y + 0.46, z, 5);
}
function tree(mb: MB, x: number, z: number, s: number, kind: number): void {
  const k = kind % 4;
  if (k === 0) {
    mb.cyl(0.14 * s, 0.22 * s, 0.9 * s, C.woodD, x, 0, z, 6);
    mb.cone(1.0 * s, 1.4 * s, C.leafD, x, 0.7 * s, z, 7).cone(0.8 * s, 1.25 * s, C.leaf, x, 1.45 * s, z, 7).cone(0.52 * s, 1.0 * s, C.leafL, x, 2.2 * s, z, 7);
  } else {
    const a = k === 3 ? C.blossom : k === 1 ? C.leaf : C.leafD;
    const b = k === 3 ? 0xffc9e3 : C.leafL;
    mb.cyl(0.15 * s, 0.26 * s, 1.3 * s, C.woodD, x, 0, z, 6);
    mb.add(new THREE.CylinderGeometry(0.07 * s, 0.1 * s, 0.7 * s, 5), C.woodD, x + 0.3 * s, 1.3 * s, z, 0, 0, -0.8);
    mb.sph(0.95 * s, a, x, 1.95 * s, z, 1, 0.9, 1, 7).sph(0.62 * s, b, x + 0.52 * s, 2.3 * s, z + 0.2 * s, 1, 0.9, 1, 6);
    mb.sph(0.58 * s, a, x - 0.56 * s, 1.72 * s, z - 0.3 * s, 1, 0.9, 1, 6).sph(0.5 * s, b, x - 0.1 * s, 2.55 * s, z - 0.3 * s, 1, 0.85, 1, 6);
  }
}
function mushroom(mb: MB, x: number, z: number, s: number, cap: number = C.red): void {
  mb.cyl(0.14 * s, 0.2 * s, 0.6 * s, C.cream, x, 0, z, 7);
  mb.sph(0.5 * s, cap, x, 0.6 * s, z, 1, 0.62, 1, 8).cyl(0.44 * s, 0.5 * s, 0.06 * s, C.cream, x, 0.54 * s, z, 8);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 6.28 + 0.4;
    mb.sph(0.08 * s, C.white, x + Math.sin(a) * 0.28 * s, (0.8 - (i % 2) * 0.06) * s, z + Math.cos(a) * 0.28 * s, 1, 0.5, 1, 5);
  }
}
function crystals(mb: MB, x: number, z: number, s: number, color: number = C.mana): void {
  mb.gem(0.24 * s, 1.3 * s, color, x, -0.1 * s, z).gem(0.17 * s, 0.9 * s, shade(color, 1.15), x + 0.32 * s, -0.08 * s, z + 0.1 * s, -0.35);
  mb.gem(0.15 * s, 0.75 * s, shade(color, 0.85), x - 0.3 * s, -0.08 * s, z + 0.14 * s, 0.4).gem(0.12 * s, 0.6 * s, color, x + 0.05 * s, -0.06 * s, z - 0.3 * s, 0, -0.4);
}

// ---------------------------------------------------------------- buildings

interface Built {
  geo: THREE.BufferGeometry;
  fit: number;
  h: number;
  flag?: [number, number, number];
  mill?: [number, number, number];
  crystal?: [number, number, number];
  smoke?: [number, number, number][];
  glows?: [number, number, number, number, number][];   // x, y, z, colour, size
}

function house(mb: MB, s: number, roofCol: number, o: Built): void {
  const ox = s === 2 ? -0.75 : 0;
  const h = s === 0 ? 1.6 : 2.6;
  mb.box(3.5, 0.22, 3.2, C.stone, ox, 0, 0);
  for (let i = 0; i < 6; i++) mb.rock(0.2, C.stoneD, ox + (mb.rand() - 0.5) * 3.4, 0.1, (mb.rand() < 0.5 ? 1 : -1) * 1.62, 1, 0.7, 1, mb.rand() * 6);
  timberBox(mb, 3.1, h, 2.8, ox, 0.22, 0);
  if (s === 0) {
    roof(mb, 3.7, 3.5, 1.7, C.straw, ox, h + 0.22, 0);
  } else {
    mb.box(3.3, 0.14, 3.0, C.woodD, ox, 1.5, 0);
    roof(mb, 3.7, 3.5, 1.7, roofCol, ox, h + 0.22, 0);
    win(mb, ox - 0.8, 1.95, 1.41, 0, 0.5, 0.55, true, C.roofB);
    win(mb, ox + 0.8, 1.95, 1.41, 0, 0.5, 0.55, false, C.roofB);
    // Dormer window poking out of the roof.
    mb.box(0.8, 0.7, 0.7, C.plaster, ox, h + 0.5, 1.0).gable(0.9, 0.9, 0.45, roofCol, ox, h + 1.2, 1.0, Math.PI / 2);
    win(mb, ox, h + 0.66, 1.36, 0, 0.36, 0.36, true);
  }
  door(mb, ox, 0.22, 1.41, 0, 0.7, 1.05, s === 2 ? C.roofB : C.woodD);
  win(mb, ox - 1.0, 0.78, 1.41, 0, 0.5, 0.55, s > 0, s === 0 ? C.roofT : 0);
  win(mb, ox + 1.0, 0.78, 1.41, 0, 0.5, 0.55, true, s === 0 ? C.roofT : 0);
  flowerBox(mb, ox - 1.0, 0.44, 1.6);
  win(mb, ox - 1.56, 0.8, 0, -Math.PI / 2, 0.5, 0.55, false);
  // Crooked stone chimney.
  mb.add(new THREE.BoxGeometry(0.5, 1.5, 0.5), C.stoneD, ox + 0.95, h + 1.25, -0.6, 0, 0, -0.07);
  mb.box(0.62, 0.14, 0.62, C.stone, ox + 1.0, h + 1.95, -0.6);
  o.smoke = [[ox + 1.0, h + 2.2, -0.6]];
  barrel(mb, ox + 1.95, 0.9);
  mb.log(0.13, 0.7, C.wood, ox - 2.0, 0.14, 0.5, 1.57).log(0.13, 0.7, C.woodL, ox - 2.0, 0.14, 0.78, 1.57).log(0.13, 0.7, C.wood, ox - 2.0, 0.38, 0.64, 1.57);
  if (s >= 1) { lamp(mb, ox + 2.05, 1.9, 1.5); o.glows = [[ox + 2.05, 1.76, 1.9, 0xffd27a, 1.6]]; }
  if (s === 2) {
    timberBox(mb, 1.9, 1.6, 2.2, 1.75, 0.22, 0.1);
    roof(mb, 2.4, 2.3, 1.2, roofCol, 1.75, 1.82, 0.1, Math.PI / 2);
    win(mb, 1.75, 0.8, 1.21, 0, 0.5, 0.55, true, C.roofB);
    mb.sph(0.16, C.gold, ox, h + 2.1, 0, 1, 1, 1, 6).sph(0.5, C.leaf, 2.5, 0.4, 1.3, 1, 0.8, 1, 6).sph(0.36, C.leafL, 2.2, 0.3, 1.6, 1, 0.8, 1, 6);
    for (let i = 0; i < 5; i++) mb.sph(0.2, C.leafD, ox - 1.58, 0.6 + i * 0.36, -0.6 + (i % 2) * 0.3, 0.4, 1, 1, 5);
  }
}

function keepModel(mb: MB, level: number, roofCol: number, banner: number, o: Built): void {
  const s = level <= 2 ? 0 : level <= 5 ? 1 : level <= 8 ? 2 : 3;
  if (s === 0) {
    mb.cyl(3.5, 3.8, 0.4, C.grassD, 0, 0, 0, 16);
    for (let i = 0; i < 12; i++) {
      const a = 0.75 + (i / 11) * 4.8;
      mb.cyl(0.14, 0.16, 1.1 + (i % 3) * 0.12, C.woodD, Math.sin(a) * 3.4, 0.3, Math.cos(a) * 3.4, 5).cone(0.15, 0.24, C.wood, Math.sin(a) * 3.4, 1.4 + (i % 3) * 0.12, Math.cos(a) * 3.4, 5);
    }
    stoneBox(mb, 3.7, 0.5, 3.1, C.stone, -0.5, 0.4, 0, 6);
    timberBox(mb, 3.5, 1.8, 2.9, -0.5, 0.9, 0, C.plank);
    roof(mb, 4.1, 3.5, 1.7, roofCol, -0.5, 2.7, 0);
    door(mb, -0.5, 0.4, 1.46, 0, 0.9, 1.35);
    win(mb, -1.6, 1.5, 1.46, 0, 0.5, 0.6, true);
    win(mb, 0.6, 1.5, 1.46, 0, 0.5, 0.6, true);
    const th = level === 1 ? 3.6 : 4.4;
    tower(mb, 2.0, -0.7, 0.9, th, C.stone, roofCol, banner);
    torch(mb, -1.1, 1.3, 1.52); torch(mb, 0.1, 1.3, 1.52);
    mb.box(0.6, 0.9, 0.05, banner, -0.5, 2.9, 1.78).box(0.6, 0.1, 0.06, C.gold, -0.5, 3.74, 1.78);
    barrel(mb, -2.6, 1.9); crate(mb, 1.2, 2.2, 0.55);
    o.flag = [2.0, th + 0.42 + 1.95, -0.7];
    o.smoke = [[-1.7, 4.6, -0.5]];
    mb.box(0.5, 1.3, 0.5, C.stoneD, -1.7, 3.2, -0.5).box(0.62, 0.14, 0.62, C.stone, -1.7, 4.4, -0.5);
    o.glows = [[-1.1, 1.9, 1.6, 0xffb060, 1.4], [0.1, 1.9, 1.6, 0xffb060, 1.4]];
    return;
  }
  const base = s === 1 ? 4.2 : s === 2 ? 5.0 : 5.4;
  const wallH = s === 1 ? 2.7 : 2.5;
  mb.box(base + 0.7, 0.34, base + 0.7, C.stoneD, 0, 0, 0);
  stoneBox(mb, base, wallH, base, C.stone, 0, 0.34, 0, 26);
  mb.box(base + 0.1, 0.16, base + 0.1, C.stoneD, 0, wallH * 0.55, 0);
  crenels(mb, base, base, wallH + 0.34, C.stoneL);
  // Gatehouse: arched gate, portcullis, drawbridge planks and torches.
  const gz = base / 2;
  mb.box(1.9, wallH + 0.5, 0.5, C.stoneL, 0, 0.34, gz + 0.1);
  mb.box(1.2, 1.5, 0.3, C.dark, 0, 0.34, gz + 0.26).arch(0.6, 0.3, C.dark, 0, 1.84, gz + 0.26);
  for (const dx of [-0.4, -0.13, 0.13, 0.4]) mb.box(0.06, 1.9, 0.06, C.metalD, dx, 0.34, gz + 0.4);
  for (const dy of [0.8, 1.3, 1.8]) mb.box(1.2, 0.06, 0.06, C.metalD, 0, dy, gz + 0.4);
  mb.box(1.5, 0.12, 1.3, C.plank, 0, 0.2, gz + 0.9);
  torch(mb, -0.85, 1.3, gz + 0.4); torch(mb, 0.85, 1.3, gz + 0.4);
  o.glows = [[-0.85, 1.95, gz + 0.5, 0xffb060, 1.6], [0.85, 1.95, gz + 0.5, 0xffb060, 1.6]];
  mb.box(0.6, 1.3, 0.06, banner, -1.55, 1.1, gz + 0.03).box(0.6, 0.12, 0.07, C.gold, -1.55, 2.3, gz + 0.03);
  mb.box(0.6, 1.3, 0.06, banner, 1.55, 1.1, gz + 0.03).box(0.6, 0.12, 0.07, C.gold, 1.55, 2.3, gz + 0.03);
  for (const sx of [-1, 1]) win(mb, sx * (base / 2 + 0.01), 1.3, 0, sx * Math.PI / 2, 0.4, 0.7, true);
  const th = s === 1 ? 3.8 : s === 2 ? 4.5 : 5.1;
  const off = base / 2 - 0.05;
  for (const [x, z] of [[-off, -off], [off, -off], [-off, off], [off, off]]) tower(mb, x, z, 0.82, th, C.stoneL, roofCol);
  if (s === 1) {
    stoneBox(mb, 2.3, 1.8, 2.3, C.stoneL, 0, wallH + 0.34, 0, 8);
    mb.pyr(2.9, 2.9, 1.7, roofCol, 0, wallH + 2.14, 0).sph(0.14, C.gold, 0, wallH + 3.9, 0, 1, 1, 1, 6);
    win(mb, 0, wallH + 0.9, 1.16, 0, 0.5, 0.7, true);
    o.flag = [0, wallH + 3.9, 0];
  } else {
    const ih = s === 2 ? 3.6 : 4.6;
    const top = wallH + 0.34 + ih;
    stoneBox(mb, 2.8, ih, 2.8, C.stoneL, 0, wallH + 0.34, 0, 16);
    crenels(mb, 2.8, 2.8, top, C.stone);
    win(mb, 0, wallH + 1.3, 1.41, 0, 0.5, 0.8, true);
    win(mb, 1.41, wallH + 1.3, 0, Math.PI / 2, 0.5, 0.8, true);
    win(mb, -1.41, wallH + 1.3, 0, -Math.PI / 2, 0.5, 0.8, true);
    // Rose window in the royal colours.
    mb.add(new THREE.CylinderGeometry(0.46, 0.46, 0.08, 12), C.gold, 0, wallH + 3.0, 1.42, Math.PI / 2, 0, 0);
    mb.add(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 8), s === 3 ? C.mana : banner, 0, wallH + 3.0, 1.43, Math.PI / 2, 0, 0);
    if (s === 2) {
      mb.pyr(2.3, 2.3, 1.8, roofCol, 0, top, 0).sph(0.15, C.gold, 0, top + 1.85, 0, 1, 1, 1, 6);
      o.flag = [0, top + 1.9, 0];
    } else {
      mb.cyl(0.95, 1.05, 2.4, C.stoneL, 0, top, 0, 10).cyl(1.15, 1.0, 0.3, C.stone, 0, top + 2.4, 0, 10);
      coneRoof(mb, 1.35, 2.8, C.gold, 0, top + 2.6, 0, C.red);
      win(mb, 0, top + 0.9, 0.99, 0, 0.4, 0.7, true);
      for (const [x, z] of [[-off, -off], [off, -off], [-off, off], [off, off]]) mb.gem(0.14, 0.4, C.gold, x, th + 0.42 + 1.75, z);
      mb.box(0.7, 1.8, 0.06, banner, 0, wallH + 0.6, 1.44).box(0.7, 0.12, 0.07, C.gold, 0, wallH + 2.3, 1.44);
      mb.box(1.0, 0.5, 2.0, C.stoneL, -1.9, wallH + 0.34, 0).box(1.0, 0.5, 2.0, C.stoneL, 1.9, wallH + 0.34, 0);
      o.flag = [0, top + 5.6, 0];
    }
  }
  mb.sph(0.5, C.leaf, -base / 2 - 0.5, 0.36, 1.2, 1, 0.8, 1, 6).sph(0.42, C.leafL, base / 2 + 0.5, 0.3, 1.5, 1, 0.8, 1, 6);
}

type BuildKind = BType | 'tower' | 'hut' | 'rebelcamp' | 'rubble' | 'scaffold' | 'site' | 'cart';

function buildBuilding(type: BuildKind, level: number, team: number): Built {
  const mb = new MB(level * 31 + type.length * 7 + type.charCodeAt(0));
  const s = level <= 3 ? 0 : level <= 6 ? 1 : 2;
  const o: Built = { geo: null as unknown as THREE.BufferGeometry, fit: 1, h: 4 };
  const roofTeam = team === TEAM.player ? C.roofB : team === TEAM.rebel ? C.roofP : C.roofR;
  switch (type) {
    case 'keep':
      keepModel(mb, level, roofTeam, team, o);
      break;
    case 'house':
      house(mb, s, [C.roofR, C.roofR, C.roofB][s], o);
      break;
    case 'hut':
      house(mb, Math.min(1, level), team === TEAM.rebel ? C.roofP : 0xc23b2e, o);
      break;
    case 'farm': {
      mb.box(5.7, 0.14, 5.7, C.soil, 0, 0, 0);
      // Crop rows: wheat, cabbages and pumpkins.
      for (let r = 0; r < 4; r++) {
        const x = -0.2 + r * 0.75;
        mb.box(0.5, 0.08, 4.4, shade(C.soil, 0.82), x, 0.14, 0.4);
        for (let k = 0; k < 8; k++) {
          const z = -1.6 + k * 0.56;
          if (r % 2 === 0) mb.cone(0.13, 0.5, k % 2 ? C.straw : C.strawD, x, 0.2, z, 5);
          else if (r === 1) mb.sph(0.17, C.leafL, x, 0.3, z, 1, 0.8, 1, 6);
          else mb.sph(0.19, C.orange, x, 0.32, z, 1, 0.8, 1, 6).box(0.04, 0.1, 0.04, C.leafD, x, 0.44, z);
        }
      }
      // Barn with a white-trimmed door.
      mb.box(2.1, 1.4, 1.9, 0xd4463a, -1.7, 0.14, -1.7).box(2.15, 0.1, 1.95, C.white, -1.7, 1.44, -1.7);
      roof(mb, 2.5, 2.3, 1.1, 0x8f3027, -1.7, 1.54, -1.7);
      mb.box(0.8, 1.0, 0.08, 0xb6362c, -1.7, 0.14, -0.73).box(0.86, 0.07, 0.1, C.white, -1.7, 1.12, -0.73).box(0.07, 1.0, 0.1, C.white, -2.12, 0.14, -0.73).box(0.07, 1.0, 0.1, C.white, -1.28, 0.14, -0.73);
      mb.box(0.07, 1.25, 0.1, C.white, -1.7, 0.02, -0.72, 0, 0, 0.68).box(0.07, 1.25, 0.1, C.white, -1.7, 0.02, -0.72, 0, 0, -0.68);
      // Scarecrow, hay bales and a rail fence.
      mb.cyl(0.04, 0.04, 1.2, C.woodD, -2.1, 0.14, 1.3, 5).box(0.9, 0.07, 0.07, C.woodD, -2.1, 0.95, 1.3).sph(0.18, C.straw, -2.1, 1.36, 1.3, 1, 1, 1, 6);
      mb.cyl(0.3, 0.32, 0.04, C.woodD, -2.1, 1.5, 1.3, 8).cone(0.14, 0.2, C.woodD, -2.1, 1.52, 1.3, 6).box(0.5, 0.4, 0.14, C.red, -2.1, 0.6, 1.3);
      mb.log(0.3, 0.6, C.straw, -1.3, 0.44, 0.5, 0.4).log(0.3, 0.6, C.strawD, -1.9, 0.44, 0.2, 1.2);
      for (let i = 0; i < 5; i++) mb.box(0.1, 0.6, 0.1, C.woodD, 2.72, 0.14, -2.2 + i * 1.1);
      mb.box(0.06, 0.08, 4.6, C.wood, 2.72, 0.56, 0).box(0.06, 0.08, 4.6, C.wood, 2.72, 0.34, 0);
      if (s >= 1) {
        mb.cyl(0.6, 0.95, 2.7, C.cream, 1.6, 0.14, -1.9, 8).cyl(0.98, 1.0, 0.25, C.stone, 1.6, 0.14, -1.9, 8);
        coneRoof(mb, 0.82, 0.95, C.roofR, 1.6, 2.84, -1.9);
        door(mb, 1.6, 0.14, -0.98, 0, 0.42, 0.72);
        win(mb, 1.6, 1.6, -1.2, 0, 0.3, 0.36, true);
        o.mill = [1.6, 2.6, -1.12];
      }
      if (s === 2) {
        mb.cyl(0.62, 0.62, 2.3, C.metal, -0.2, 0.14, -2.1, 10).sph(0.62, C.roofB, -0.2, 2.44, -2.1, 1, 0.6, 1);
        for (const dy of [0.7, 1.4, 2.1]) mb.cyl(0.64, 0.64, 0.07, C.metalD, -0.2, dy, -2.1, 10);
        mb.sph(0.5, C.orange, 2.1, 0.5, 2.1, 1, 0.8, 1).box(0.08, 0.2, 0.08, C.leafD, 2.1, 0.86, 2.1);
      }
      break;
    }
    case 'lumber': {
      mb.box(5.6, 0.1, 5.6, 0xdcbd8d, 0, 0, 0);
      // Log cabin.
      for (let i = 0; i < 5; i++) {
        mb.log(0.17, 2.4, i % 2 ? C.wood : C.woodL, -1.5, 0.27 + i * 0.32, -0.55).log(0.17, 2.4, i % 2 ? C.woodL : C.wood, -1.5, 0.27 + i * 0.32, -2.45);
        mb.log(0.17, 2.1, i % 2 ? C.woodL : C.wood, -2.6, 0.43 + i * 0.32, -1.5, Math.PI / 2).log(0.17, 2.1, i % 2 ? C.wood : C.woodL, -0.4, 0.43 + i * 0.32, -1.5, Math.PI / 2);
      }
      mb.box(2.1, 1.5, 1.8, C.woodD, -1.5, 0.1, -1.5);
      roof(mb, 2.8, 2.6, 1.2, C.roofG, -1.5, 1.8, -1.5);
      door(mb, -1.5, 0.1, -0.4, 0, 0.6, 0.95, C.woodD, false);
      win(mb, -0.75, 0.8, -0.4, 0, 0.34, 0.4, true);
      for (let p = 0; p <= s; p++) {
        const z = 1.9 - p * 1.4;
        mb.log(0.26, 2.3, C.woodD, 1.4, 0.36, z - 0.28).log(0.26, 2.3, C.wood, 1.4, 0.36, z + 0.28).log(0.26, 2.3, C.woodL, 1.4, 0.8, z);
        for (const dx of [-1.15, 1.15]) {
          mb.add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 8), 0xf0d7a8, 1.4 + dx, 0.36, z - 0.28, 0, 0, Math.PI / 2).add(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 8), 0xf0d7a8, 1.4 + dx, 0.8, z, 0, 0, Math.PI / 2);
        }
        mb.box(0.1, 0.8, 0.1, C.woodD, 0.2, 0.1, z - 0.6).box(0.1, 0.8, 0.1, C.woodD, 0.2, 0.1, z + 0.6);
      }
      mb.cyl(0.42, 0.5, 0.42, C.wood, -1.6, 0.1, 1.6, 8).cyl(0.4, 0.4, 0.03, 0xf0d7a8, -1.6, 0.52, 1.6, 8);
      mb.box(0.06, 0.74, 0.06, C.woodD, -1.6, 0.5, 1.6, 0, 0, 0.5).box(0.32, 0.24, 0.05, C.metal, -1.88, 1.02, 1.6);
      for (let i = 0; i < 6; i++) mb.box(0.16, 0.03, 0.1, 0xf0d7a8, -1.6 + (mb.rand() - 0.5) * 1.6, 0.1, 1.6 + (mb.rand() - 0.5) * 1.4, mb.rand() * 3);
      tree(mb, -2.35, 0.3, 0.72, 0);
      mb.cyl(0.3, 0.36, 0.3, C.wood, 2.3, 0.1, -2.2, 7).cyl(0.26, 0.3, 0.26, C.wood, -0.2, 0.1, 2.3, 7);
      if (s >= 1) {
        mb.box(1.6, 0.12, 0.9, C.woodL, -0.1, 0.78, 0.5).box(0.1, 0.68, 0.1, C.woodD, -0.75, 0.1, 0.5).box(0.1, 0.68, 0.1, C.woodD, 0.55, 0.1, 0.5);
        mb.add(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 14), C.metal, -0.1, 1.0, 0.5, 0, 0, Math.PI / 2).log(0.2, 1.2, C.wood, -0.1, 1.0, 0.9, 0);
      }
      if (s === 2) { tree(mb, 2.35, -1.0, 0.8, 0); mb.box(1.2, 0.5, 0.8, C.plank, -0.4, 0.4, 2.2).log(0.3, 0.12, C.woodD, -0.85, 0.3, 2.65, 1.57).log(0.3, 0.12, C.woodD, 0.05, 0.3, 2.65, 1.57).log(0.2, 1.0, C.wood, -0.4, 1.05, 2.2); }
      break;
    }
    case 'quarry': {
      mb.box(5.6, 0.1, 5.6, 0xbdb7ab, 0, 0, 0);
      // Rock face with a timber-framed mine mouth.
      mb.rock(1.7, C.stoneD, -1.0, 1.0, -1.6, 1.3, 1.1, 1, 0.4).rock(1.2, C.stone, 0.9, 0.8, -1.9, 1.2, 1, 1, 1.3).rock(0.9, C.stoneL, -2.1, 0.5, 0.0, 1, 0.9, 1, 2.1);
      mb.rock(0.7, C.stone, 1.9, 0.4, -1.2, 1, 0.8, 1, 0.7).sph(0.5, C.moss, -1.6, 2.0, -1.6, 1.4, 0.4, 1, 6);
      mb.box(1.1, 1.3, 0.5, C.dark, -0.5, 0.1, -0.65).arch(0.55, 0.5, C.dark, -0.5, 1.4, -0.65);
      mb.box(0.16, 1.6, 0.16, C.woodD, -1.15, 0.1, -0.38).box(0.16, 1.6, 0.16, C.woodD, 0.15, 0.1, -0.38).box(1.6, 0.16, 0.18, C.wood, -0.5, 1.7, -0.38);
      // Rails, ore cart, cut blocks and a crane.
      for (const dx of [-0.28, 0.28]) mb.box(0.06, 0.06, 2.6, C.metalD, -0.5 + dx, 0.1, 0.9);
      for (let i = 0; i < 5; i++) mb.box(0.8, 0.05, 0.12, C.woodD, -0.5, 0.08, -0.2 + i * 0.55);
      mb.box(0.8, 0.42, 1.0, C.wood, -0.5, 0.36, 1.2).box(0.86, 0.07, 1.06, C.metalD, -0.5, 0.74, 1.2);
      for (const [dx, dz] of [[-0.28, 0.3], [0.28, 0.3], [-0.28, -0.3], [0.28, -0.3]]) mb.log(0.16, 0.08, C.metalD, -0.5 + dx, 0.24, 1.2 + dz, 0, 8);
      mb.rock(0.24, C.stoneL, -0.6, 0.92, 1.1).rock(0.2, C.stoneD, -0.35, 0.9, 1.35).rock(0.18, s === 2 ? C.mana : C.gold, -0.5, 1.02, 1.3);
      mb.box(0.8, 0.5, 0.6, C.stoneL, 1.7, 0.1, 1.5).box(0.8, 0.5, 0.6, C.stone, 1.7, 0.6, 1.55, 0.2).box(0.8, 0.5, 0.6, C.stoneL, 0.9, 0.1, 2.0, 0.1);
      mb.box(0.2, 3.0, 0.2, C.woodD, 2.1, 0.1, -0.2).box(0.14, 0.14, 2.2, C.woodD, 2.1, 2.9, 0.6).box(0.12, 1.7, 0.12, C.woodD, 2.1, 1.6, 0.25, 0, -0.7);
      mb.box(0.03, 1.3, 0.03, C.rope, 2.1, 1.6, 1.6).box(0.5, 0.4, 0.5, C.stoneL, 2.1, 1.2, 1.6);
      mb.box(0.06, 0.8, 0.06, C.woodD, -2.0, 0.1, 1.9, 0, 0, -0.4).box(0.5, 0.07, 0.07, C.metalD, -1.8, 0.85, 1.9);
      lamp(mb, 0.5, -0.2, 1.3);
      o.glows = [[0.5, 1.56, -0.2, 0xffd27a, 1.3]];
      if (s >= 1) mb.rock(1.3, C.stone, -0.2, 1.9, -2.0, 1, 1.1, 1, 0.9).rock(0.5, C.stoneD, -2.3, 0.3, 1.2, 1, 0.8, 1, 1.5);
      if (s === 2) { crystals(mb, 1.2, -0.9, 0.8); crystals(mb, -2.2, -1.0, 0.6, C.purple); o.glows.push([1.2, 0.8, -0.9, 0x66e6ff, 1.8]); }
      break;
    }
    case 'storehouse': {
      const w = s === 0 ? 3.9 : 4.5;
      mb.box(w + 0.5, 0.22, 3.8, C.stone, 0, 0, 0);
      mb.box(w, 2.2, 3.2, C.plank, 0, 0.22, 0);
      for (let i = 0; i < 8; i++) mb.box(0.04, 2.2, 0.04, C.woodD, -w / 2 + 0.3 + (i * (w - 0.6)) / 7, 0.22, 1.61);
      for (const sx of [-1, 1]) mb.box(0.18, 2.2, 0.18, C.woodD, sx * w / 2, 0.22, 1.56).box(0.18, 2.2, 0.18, C.woodD, sx * w / 2, 0.22, -1.56);
      mb.box(w + 0.1, 0.16, 0.14, C.woodD, 0, 2.26, 1.6);
      roof(mb, w + 0.5, 3.9, 1.8, C.roofR, 0, 2.42, 0);
      // Big double doors, loft hatch and a hoist.
      mb.box(1.5, 1.7, 0.1, C.woodD, 0, 0.22, 1.62).box(0.07, 1.7, 0.12, C.woodL, 0, 0.22, 1.63).box(1.5, 0.08, 0.13, C.metalD, 0, 0.7, 1.63).box(1.5, 0.08, 0.13, C.metalD, 0, 1.5, 1.63);
      mb.box(0.7, 0.6, 0.08, C.woodD, 0, 2.6, 1.34).box(0.12, 0.12, 0.9, C.woodD, 0, 3.4, 1.7).box(0.03, 0.7, 0.03, C.rope, 0, 2.7, 2.1).box(0.3, 0.3, 0.3, C.plank, 0, 2.4, 2.1);
      barrel(mb, w / 2 + 0.42, 1.4); barrel(mb, w / 2 + 0.46, 0.75); barrel(mb, w / 2 + 0.44, 1.08, 0.56);
      crate(mb, -w / 2 - 0.4, 1.3, 0.62); crate(mb, -w / 2 - 0.36, 1.3, 0.46, 0.62, 0.7);
      sack(mb, -1.4, 2.0); sack(mb, -1.0, 2.15); sack(mb, -1.2, 2.05, 0.4);
      sack(mb, 1.3, 2.1);
      if (s >= 1) { win(mb, -1.5, 1.1, 1.61, 0, 0.44, 0.5, false); win(mb, 1.5, 1.1, 1.61, 0, 0.44, 0.5, false); lamp(mb, -w / 2 - 0.3, 2.2, 1.5); o.glows = [[-w / 2 - 0.3, 1.76, 2.2, 0xffd27a, 1.4]]; }
      if (s === 2) { flagPole(mb, w / 2 - 0.3, 3.8, 0, 1.3, team); mb.box(0.3, 0.5, 0.3, C.gold, 1.0, 0, 2.3).box(0.4, 0.5, 0.3, C.gold, 1.4, 0, 2.5, 0.4); }
      break;
    }
    case 'market': {
      mb.box(5.7, 0.12, 5.7, 0xe6d6b2, 0, 0, 0);
      for (let i = 0; i < 14; i++) mb.box(0.5 + mb.rand() * 0.4, 0.03, 0.4 + mb.rand() * 0.3, shade(0xe6d6b2, 0.85 + mb.rand() * 0.25), (mb.rand() - 0.5) * 5, 0.12, (mb.rand() - 0.5) * 5, mb.rand());
      const stalls: [number, number, number][] = [[-1.65, -1.5, C.roofR], [1.65, -1.5, C.roofB], [-1.65, 1.7, C.roofG], [1.65, 1.7, C.roofP]];
      for (let i = 0; i < 2 + s; i++) {
        const [x, z, col] = stalls[i];
        mb.box(1.8, 0.62, 0.95, C.wood, x, 0.12, z).box(1.9, 0.08, 1.05, C.woodL, x, 0.74, z);
        for (const [px, pz] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) mb.box(0.08, 1.8, 0.08, C.woodD, x + px, 0.12, z + pz);
        for (let k = 0; k < 6; k++) mb.box(0.33, 0.08, 1.4, k % 2 ? C.white : col, x - 0.82 + k * 0.33, 1.9, z, 0, 0.26);
        for (let k = 0; k < 6; k++) mb.cone(0.15, 0.2, k % 2 ? C.white : col, x - 0.82 + k * 0.33, 1.58, z + 0.72, 3);
        if (i % 2 === 0) {
          mb.sph(0.15, C.orange, x - 0.55, 0.92, z).sph(0.15, C.red, x - 0.2, 0.92, z).sph(0.15, C.leafL, x + 0.15, 0.92, z).sph(0.15, C.gold, x + 0.5, 0.92, z).sph(0.14, C.red, x - 0.38, 1.1, z);
        } else {
          // Potion stall.
          for (let k = 0; k < 5; k++) {
            const pc = [C.mana, C.purple, C.pink, C.leafL, C.gold][k];
            mb.sph(0.12, pc, x - 0.6 + k * 0.3, 0.94, z, 1, 1, 1, 6).cyl(0.04, 0.05, 0.14, C.glass, x - 0.6 + k * 0.3, 1.02, z, 5).cyl(0.05, 0.05, 0.04, C.woodD, x - 0.6 + k * 0.3, 1.16, z, 5);
          }
        }
        crate(mb, x + 1.15, z + 0.3, 0.45);
      }
      if (s >= 1) {
        mb.cyl(0.85, 0.95, 0.5, C.stone, 0, 0.12, 0.1, 12).cyl(0.7, 0.7, 0.06, C.water, 0, 0.6, 0.1, 12).cyl(0.13, 0.17, 1.1, C.stoneL, 0, 0.12, 0.1, 8).sph(0.2, C.gold, 0, 1.32, 0.1);
      } else { barrel(mb, 1.5, 1.5); crate(mb, -1.5, 1.6, 0.7); sack(mb, 0.9, 1.9); }
      // Bunting between poles.
      mb.cyl(0.05, 0.06, 2.8, C.woodD, -2.6, 0.12, 0.1, 5).cyl(0.05, 0.06, 2.8, C.woodD, 2.6, 0.12, 0.1, 5);
      for (let k = 0; k < 11; k++) {
        const t = k / 10;
        mb.add(new THREE.ConeGeometry(0.13, 0.26, 3), [C.red, C.gold, C.roofB, C.roofG, C.purple][k % 5], -2.6 + t * 5.2, 2.72 - Math.sin(t * Math.PI) * 0.45, 0.1, Math.PI, 0, 0);
      }
      break;
    }
    case 'barracks': {
      mb.box(4.9, 0.26, 4.0, C.stoneD, -0.3, 0, -0.5);
      stoneBox(mb, 4.3, 2.2, 3.3, C.stone, -0.3, 0.26, -0.5, 20);
      crenels(mb, 4.3, 3.3, 2.46, C.stoneL, -0.3, -0.5);
      mb.box(1.5, 2.5, 0.4, C.stoneL, -0.3, 0.26, 1.2);
      mb.box(1.0, 1.4, 0.2, C.dark, -0.3, 0.26, 1.34).arch(0.5, 0.2, C.dark, -0.3, 1.66, 1.34);
      for (const dx of [-0.3, 0, 0.3]) mb.box(0.06, 1.8, 0.06, C.metalD, -0.3 + dx, 0.26, 1.46);
      mb.box(1.0, 0.06, 0.06, C.metalD, -0.3, 1.0, 1.46).box(1.0, 0.06, 0.06, C.metalD, -0.3, 1.5, 1.46);
      mb.box(0.55, 1.2, 0.06, team, -1.7, 0.9, 1.17).box(0.55, 0.12, 0.07, C.gold, -1.7, 2.0, 1.17).box(0.55, 1.2, 0.06, team, 1.1, 0.9, 1.17).box(0.55, 0.12, 0.07, C.gold, 1.1, 2.0, 1.17);
      torch(mb, -1.05, 1.2, 1.2); torch(mb, 0.45, 1.2, 1.2);
      o.glows = [[-1.05, 1.86, 1.3, 0xffb060, 1.4], [0.45, 1.86, 1.3, 0xffb060, 1.4]];
      // Training dummy, archery target and a weapon rack.
      mb.cyl(0.07, 0.08, 1.3, C.woodD, 2.3, 0, 2.1, 5).box(0.95, 0.09, 0.09, C.woodD, 2.3, 0.95, 2.1).sph(0.23, C.straw, 2.3, 1.48, 2.1).cyl(0.26, 0.3, 0.6, C.straw, 2.3, 0.5, 2.1, 7);
      mb.add(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 10), C.red, 2.3, 0.8, 2.36, Math.PI / 2, 0, 0).add(new THREE.CylinderGeometry(0.2, 0.2, 0.07, 10), C.white, 2.3, 0.8, 2.37, Math.PI / 2, 0, 0).add(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 8), C.red, 2.3, 0.8, 2.38, Math.PI / 2, 0, 0);
      mb.box(1.2, 0.08, 0.3, C.woodD, -2.3, 0.9, 2.0).box(0.08, 0.9, 0.08, C.woodD, -2.85, 0, 2.0).box(0.08, 0.9, 0.08, C.woodD, -1.75, 0, 2.0);
      for (const dx of [-0.38, 0, 0.38]) mb.box(0.045, 1.4, 0.045, C.woodL, -2.3 + dx, 0.06, 2.05, 0, -0.15).cone(0.07, 0.22, C.metal, -2.3 + dx, 1.44, 1.84, 4);
      mb.add(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 10), team, -1.3, 0.4, 2.2, Math.PI / 2 - 0.3, 0, 0);
      if (s >= 1) tower(mb, 2.0, -2.0, 0.85, 3.6, C.stoneL, team);
      if (s === 2) { tower(mb, -2.6, -2.0, 0.85, 3.6, C.stoneL, team); mb.box(1.3, 0.2, 0.14, C.gold, -0.3, 2.3, 1.42); flagPole(mb, -0.3, 2.84, -0.5, 1.6, team); }
      break;
    }
    case 'camp':
    case 'rebelcamp': {
      mb.cyl(2.85, 2.95, 0.08, C.dirt, 0, 0, 0, 16);
      const n = type === 'rebelcamp' ? 2 : 2 + s;
      const spots: [number, number][] = [[-1.4, -1.2], [1.4, -1.2], [-1.6, 1.3], [1.6, 1.3]];
      for (let i = 0; i < n; i++) {
        const [x, z] = spots[i];
        const big = type === 'rebelcamp' ? 1.25 : 1;
        mb.cone(1.0 * big, 1.5 * big, C.cloth, x, 0.08, z, 8).cone(0.47 * big, 0.7 * big, team, x, 0.08 + 0.82 * big, z, 8);
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * 6.28 + 0.4;
          mb.add(new THREE.BoxGeometry(0.1, 1.5 * big, 0.03), team, x + Math.sin(a) * 0.52 * big, 0.08 + 0.72 * big, z + Math.cos(a) * 0.52 * big, 0, a, 0).cyl(0.04, 0.04, 0.2, C.woodD, x + Math.sin(a) * 1.15 * big, 0.06, z + Math.cos(a) * 1.15 * big, 4);
        }
        mb.box(0.42, 0.72, 0.06, C.dark, x, 0.08, z + 0.72 * big, 0, -0.55).cyl(0.03, 0.03, 0.4, C.woodD, x, 0.08 + 1.5 * big, z, 4).box(0.24, 0.14, 0.02, team, x + 0.13, 0.36 + 1.5 * big, z);
      }
      // Campfire with a cooking pot and log seats.
      for (let k = 0; k < 7; k++) mb.rock(0.1, C.stoneD, Math.sin(k * 0.9) * 0.42, 0.14, 0.3 + Math.cos(k * 0.9) * 0.42);
      mb.log(0.09, 0.8, C.woodD, 0, 0.18, 0.3, 0.6).log(0.09, 0.8, C.woodD, 0, 0.18, 0.3, -0.6).cone(0.22, 0.6, C.fire, 0, 0.2, 0.3, 6).cone(0.12, 0.4, C.gold, 0, 0.24, 0.3, 6);
      mb.box(0.05, 1.0, 0.05, C.metalD, -0.5, 0.08, 0.3, 0, 0, -0.35).box(0.05, 1.0, 0.05, C.metalD, 0.5, 0.08, 0.3, 0, 0, 0.35).sph(0.2, C.coal, 0, 0.74, 0.3, 1, 0.8, 1, 6);
      mb.log(0.16, 0.9, C.wood, -0.3, 0.2, 1.2, 0.3).log(0.16, 0.9, C.wood, 0.9, 0.2, 0.2, 1.4);
      o.glows = [[0, 0.6, 0.3, 0xff9a40, 2.2]];
      flagPole(mb, 0, 0.08, -1.95, 2.8, team);
      if (type === 'camp') { crate(mb, 2.2, 0.0, 0.5); sack(mb, -2.3, 0.1); }
      if (s >= 1 && type === 'camp') {
        mb.box(1.0, 0.08, 0.3, C.woodD, 0, 0.9, 2.3).box(0.08, 0.9, 0.08, C.woodD, -0.45, 0, 2.3).box(0.08, 0.9, 0.08, C.woodD, 0.45, 0, 2.3);
        for (const dx of [-0.3, 0, 0.3]) mb.box(0.04, 1.2, 0.04, C.woodL, dx, 0.06, 2.34, 0, -0.12);
      }
      break;
    }
    case 'tavern': {
      mb.box(4.5, 0.22, 3.8, C.stone, 0, 0, 0);
      stoneBox(mb, 4.1, 1.3, 3.3, C.stone, 0, 0.22, 0, 14);
      timberBox(mb, 4.3, 1.5, 3.5, 0, 1.52, 0);
      roof(mb, 4.9, 4.2, 2.0, C.roofG, 0, 3.02, 0);
      door(mb, 0, 0.22, 1.66, 0, 0.8, 1.15, 0x8a5a33);
      win(mb, -1.35, 0.72, 1.66, 0, 0.6, 0.55, true); win(mb, 1.35, 0.72, 1.66, 0, 0.6, 0.55, true);
      win(mb, -1.35, 2.05, 1.77, 0, 0.55, 0.55, true, C.roofR); win(mb, 1.35, 2.05, 1.77, 0, 0.55, 0.55, true, C.roofR); win(mb, 0, 2.05, 1.77, 0, 0.5, 0.55, true);
      flowerBox(mb, -1.35, 1.72, 1.96); flowerBox(mb, 1.35, 1.72, 1.96);
      // Hanging sign with a foaming mug.
      mb.box(0.1, 0.1, 1.0, C.woodD, 0.75, 2.75, 2.2).box(0.03, 0.3, 0.03, C.metalD, 0.75, 2.45, 2.55).box(0.75, 0.62, 0.07, C.woodL, 0.75, 1.84, 2.55).box(0.8, 0.07, 0.09, C.woodD, 0.75, 2.42, 2.55);
      mb.cyl(0.15, 0.15, 0.28, C.gold, 0.72, 1.98, 2.62, 8).sph(0.16, C.white, 0.72, 2.3, 2.62, 1, 0.5, 1, 6).box(0.08, 0.16, 0.04, C.gold, 0.92, 2.04, 2.62);
      barrel(mb, 2.55, 1.3); barrel(mb, -2.55, 1.3); barrel(mb, 2.55, 0.7); barrel(mb, 2.55, 1.0, 0.56);
      mb.add(new THREE.BoxGeometry(0.55, 1.6, 0.55), C.stoneD, 1.3, 4.3, -0.8, 0, 0, 0.06);
      mb.box(0.68, 0.14, 0.68, C.stone, 1.26, 5.0, -0.8);
      o.smoke = [[1.26, 5.3, -0.8]];
      lamp(mb, -2.2, 2.4, 1.6);
      o.glows = [[-2.2, 1.86, 2.4, 0xffd27a, 1.6], [0, 1.0, 1.9, 0xffc060, 2.0]];
      if (s >= 1) {
        mb.cyl(0.55, 0.55, 0.08, C.woodL, -2.1, 0.62, 2.7, 10).cyl(0.09, 0.12, 0.62, C.woodD, -2.1, 0, 2.7, 6).cyl(0.17, 0.17, 0.32, C.wood, -2.75, 0, 2.5, 6).cyl(0.17, 0.17, 0.32, C.wood, -1.5, 0, 2.95, 6);
        mb.cyl(0.08, 0.08, 0.16, C.gold, -2.2, 0.7, 2.6, 6).cyl(0.08, 0.08, 0.16, C.gold, -1.95, 0.7, 2.8, 6);
      }
      if (s === 2) { timberBox(mb, 1.5, 1.6, 2.3, 2.6, 0.22, -0.4); roof(mb, 2.7, 2.0, 1.0, C.roofG, 2.6, 1.82, -0.4, Math.PI / 2); win(mb, 2.6, 0.8, 0.76, 0, 0.5, 0.5, true); }
      break;
    }
    case 'smith': {
      mb.box(5.3, 0.18, 4.9, C.stoneD, 0, 0, 0);
      stoneBox(mb, 2.9, 2.1, 2.3, C.stone, -0.95, 0.18, -1.15, 14);
      roof(mb, 3.4, 2.9, 1.3, 0xa8412c, -0.95, 2.28, -1.15);
      mb.box(0.9, 1.3, 0.12, C.dark, -0.95, 0.18, 0.0).arch(0.45, 0.12, C.dark, -0.95, 1.48, 0.0);
      win(mb, -2.41, 0.9, -1.15, -Math.PI / 2, 0.5, 0.55, true);
      // Forge with glowing coals, a tall chimney and bellows.
      stoneBox(mb, 1.3, 1.0, 1.3, C.stoneD, 1.65, 0.18, -1.35, 6);
      mb.box(0.9, 0.12, 0.9, C.fire, 1.65, 1.18, -1.35).box(0.5, 0.08, 0.5, C.gold, 1.65, 1.28, -1.35).rock(0.14, C.coal, 1.4, 1.3, -1.2).rock(0.12, C.coal, 1.9, 1.3, -1.5);
      mb.box(0.75, 3.6, 0.75, C.stoneD, 1.65, 1.0, -2.05).box(0.9, 0.2, 0.9, C.dark, 1.65, 4.6, -2.05);
      o.smoke = [[1.65, 4.9, -2.05]];
      mb.add(new THREE.ConeGeometry(0.34, 0.9, 4), 0x8a5a33, 0.7, 1.0, -1.35, 0, 0.78, -Math.PI / 2).box(0.5, 0.06, 0.4, C.woodD, 0.55, 1.2, -1.35);
      // Anvil on a stump, quench trough, grindstone and wares.
      mb.cyl(0.32, 0.38, 0.5, C.wood, 0.9, 0.18, 1.1, 8).box(0.36, 0.2, 0.3, C.metalD, 0.9, 0.68, 1.1).box(0.9, 0.16, 0.36, C.metalD, 0.9, 0.88, 1.1).cone(0.16, 0.36, C.metalD, 1.46, 0.78, 1.1, 5);
      mb.box(0.08, 0.6, 0.08, C.woodD, 0.5, 1.02, 1.1, 0, 0, 0.9).box(0.24, 0.16, 0.16, C.metal, 0.3, 1.24, 1.1);
      mb.box(1.2, 0.42, 0.55, C.wood, -1.6, 0.18, 1.6).box(1.04, 0.06, 0.4, C.water, -1.6, 0.56, 1.6);
      mb.box(0.1, 1.2, 0.04, C.stoneL, -2.3, 0.4, 0.12).box(0.3, 0.08, 0.05, C.gold, -2.3, 0.6, 0.12).box(0.1, 1.2, 0.04, C.stoneL, -1.9, 0.4, 0.12).box(0.3, 0.08, 0.05, C.gold, -1.9, 0.6, 0.12);
      mb.rock(0.3, C.coal, 2.3, 0.3, 0.2).rock(0.24, C.coal, 2.1, 0.26, 0.6).rock(0.2, C.coal, 2.4, 0.24, 0.7);
      o.glows = [[1.65, 1.5, -1.35, 0xff7a22, 2.6]];
      if (s >= 1) {
        for (const [x, z] of [[0, 0.3], [2.3, 0.3], [0, 2.1], [2.3, 2.1]]) mb.box(0.14, 2.1, 0.14, C.woodD, x, 0.18, z);
        mb.box(2.8, 0.12, 2.3, 0xa8412c, 1.15, 2.3, 1.2, 0, 0.1).box(2.8, 0.08, 0.12, C.woodD, 1.15, 2.2, 2.3);
        mb.add(new THREE.CylinderGeometry(0.42, 0.42, 0.16, 12), C.stoneL, 2.1, 0.66, 1.75, 0, 0, Math.PI / 2).box(0.1, 0.6, 0.5, C.woodD, 2.1, 0.18, 1.75);
      }
      if (s === 2) {
        mb.add(new THREE.CylinderGeometry(0.36, 0.36, 0.07, 10), team, -1.0, 1.9, 0.04, Math.PI / 2, 0, 0).add(new THREE.CylinderGeometry(0.14, 0.14, 0.09, 8), C.gold, -1.0, 1.9, 0.06, Math.PI / 2, 0, 0);
        mb.box(0.5, 0.34, 0.3, C.gold, -0.4, 0.18, 1.9).box(0.34, 0.3, 0.3, C.metal, 0.1, 0.18, 2.1, 0.5);
      }
      break;
    }
    case 'spire': {
      // Rune circle, crooked tower, bent hat roof. The floating crystal is a separate animated mesh.
      mb.cyl(2.7, 2.8, 0.1, 0x6a5a8f, 0, 0, 0, 16).cyl(2.25, 2.25, 0.03, C.mana, 0, 0.1, 0, 20).cyl(2.0, 2.0, 0.04, 0x6a5a8f, 0, 0.1, 0, 20).cyl(1.5, 1.5, 0.03, C.manaD, 0, 0.12, 0, 6).cyl(1.3, 1.3, 0.04, 0x6a5a8f, 0, 0.12, 0, 6);
      const tiers = 2 + s;
      let y = 0.14;
      let cx = 0, cz = 0;
      for (let t = 0; t < tiers; t++) {
        const r = 1.25 - t * 0.17;
        const hh = 1.7;
        mb.cyl(r * 0.9, r, hh, t % 2 ? C.stoneL : C.stone, cx, y, cz, 8).cyl(r * 1.06, r * 0.96, 0.22, 0x7b6aa6, cx, y + hh - 0.1, cz, 8);
        for (let k = 0; k < 4; k++) {
          const a = mb.rand() * 6.28;
          mb.box(0.3, 0.16, 0.08, shade(C.stone, 0.86), cx + Math.sin(a) * r * 0.95, y + 0.3 + mb.rand() * 1.0, cz + Math.cos(a) * r * 0.95, a);
        }
        win(mb, cx, y + 0.7, cz + r * 0.94, 0, 0.3, 0.5, true);
        if (t === 0) door(mb, cx + r * 0.7, y, cz + r * 0.7, 0.78, 0.55, 0.95, C.roofP);
        if (t === 1) {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * 6.28;
            mb.box(0.5, 0.07, 0.34, C.plank, cx + Math.sin(a) * (r + 0.26), y, cz + Math.cos(a) * (r + 0.26), a).box(0.05, 0.36, 0.05, C.woodD, cx + Math.sin(a) * (r + 0.4), y + 0.05, cz + Math.cos(a) * (r + 0.4));
          }
        }
        y += hh;
        cx += 0.14 * (t % 2 ? -1 : 1);
        cz -= 0.08;
      }
      const rr = 1.25 - (tiers - 1) * 0.17;
      mb.cyl(rr * 1.35, rr * 1.2, 0.14, 0x6f3fbf, cx, y, cz, 10).cone(rr * 1.3, 1.5, C.roofP, cx, y + 0.1, cz, 10);
      mb.add(new THREE.ConeGeometry(rr * 0.62, 1.4, 8), C.roofP, cx + 0.3, y + 1.9, cz, 0, 0, -0.5);
      mb.cyl(rr * 0.9, rr * 0.98, 0.1, C.gold, cx, y + 0.5, cz, 10);
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * 6.28;
        mb.add(new THREE.OctahedronGeometry(0.1, 0), C.gold, cx + Math.sin(a) * rr * 0.86, y + 0.82, cz + Math.cos(a) * rr * 0.86, 0, a, 0, 1, 1.4, 0.4);
      }
      // Cauldron, potion shelf, mushrooms and loose crystals around the base.
      mb.sph(0.42, C.coal, 1.9, 0.44, 1.2, 1, 0.85, 1).cyl(0.4, 0.44, 0.08, C.metalD, 1.9, 0.62, 1.2, 8).cyl(0.34, 0.34, 0.04, 0x7dff6a, 1.9, 0.68, 1.2, 8).sph(0.09, 0x7dff6a, 1.8, 0.76, 1.25, 1, 1, 1, 5).sph(0.06, 0xb9ff9a, 2.02, 0.74, 1.1, 1, 1, 1, 5);
      for (const [dx, dz] of [[-0.3, 0], [0.3, 0], [0, 0.3]]) mb.box(0.06, 0.4, 0.06, C.metalD, 1.9 + dx, 0.1, 1.2 + dz);
      mushroom(mb, -1.9, 1.5, 0.7, C.purple); mushroom(mb, -2.2, 1.0, 0.45, C.roofT); mushroom(mb, -1.5, 1.95, 0.4, C.pink);
      crystals(mb, -1.8, -1.5, 0.55); crystals(mb, 2.0, -1.2, 0.45, C.purple);
      mb.box(0.9, 0.06, 0.3, C.woodD, 0.4, 0.7, 2.2).box(0.07, 0.7, 0.07, C.woodD, 0, 0.1, 2.2).box(0.07, 0.7, 0.07, C.woodD, 0.8, 0.1, 2.2);
      for (let k = 0; k < 3; k++) mb.sph(0.11, [C.pink, C.mana, C.gold][k], 0.12 + k * 0.28, 0.87, 2.2, 1, 1, 1, 6).cyl(0.035, 0.04, 0.1, C.glass, 0.12 + k * 0.28, 0.94, 2.2, 5);
      if (s >= 1) { tower(mb, -1.75, -0.2, 0.5, 2.3, C.stoneL, C.roofP); }
      if (s === 2) { mb.cyl(1.9, 1.9, 0.05, C.gold, 0, 0.13, 0, 24).cyl(1.8, 1.8, 0.06, 0x6a5a8f, 0, 0.13, 0, 24); crystals(mb, 0.3, -2.1, 0.7, C.gold); }
      o.crystal = [cx + 0.1, y + 3.6, cz];
      o.glows = [[cx + 0.1, y + 3.6, cz, 0x66e6ff, 4.2], [1.9, 0.9, 1.2, 0x7dff6a, 1.4], [0, 0.4, 0, 0x66e6ff, 5.5]];
      break;
    }
    case 'garden': {
      mb.box(3.7, 0.12, 3.7, 0x8a5f3a, 0, 0, 0);
      for (const [x, z, w, d] of [[0, -1.8, 3.8, 0.16], [0, 1.8, 3.8, 0.16], [-1.8, 0, 0.16, 3.8], [1.8, 0, 0.16, 3.8]]) mb.box(w, 0.3, d, C.wood, x, 0, z);
      const cols = [C.pink, C.gold, C.red, C.white, C.purple, C.mana];
      for (let i = 0; i < 26; i++) {
        const x = (mb.rand() - 0.5) * 3.1, z = (mb.rand() - 0.5) * 3.1;
        if (Math.hypot(x, z) < 0.7) continue;
        const c = cols[Math.floor(mb.rand() * cols.length)];
        mb.cyl(0.025, 0.025, 0.3, C.leafD, x, 0.12, z, 4).sph(0.12, c, x, 0.46, z, 1, 0.7, 1, 6).sph(0.05, C.gold, x, 0.52, z, 1, 1, 1, 4).sph(0.1, C.leaf, x + 0.08, 0.2, z, 1.2, 0.5, 0.8, 5);
      }
      mb.cyl(0.12, 0.16, 0.5, C.woodD, 0, 0.12, 0, 6).sph(0.55, C.leaf, 0, 0.95, 0, 1, 1, 1, 8).sph(0.38, C.leafL, 0, 1.55, 0, 1, 1, 1, 8).sph(0.22, C.blossom, 0, 1.98, 0, 1, 1, 1, 6);
      break;
    }
    case 'lantern': {
      mb.cyl(0.5, 0.6, 0.2, C.stoneD, 0, 0, 0, 8).cyl(0.34, 0.42, 0.3, C.stone, 0, 0.2, 0, 8);
      mb.cyl(0.07, 0.1, 1.5, C.metalD, 0, 0.5, 0, 6).box(0.5, 0.06, 0.5, C.metalD, 0, 2.0, 0);
      for (const [dx, dz] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) mb.box(0.05, 0.5, 0.05, C.metalD, dx, 2.06, dz);
      mb.gem(0.16, 0.44, C.mana, 0, 2.08, 0).pyr(0.62, 0.62, 0.3, C.roofP, 0, 2.56, 0).sph(0.07, C.gold, 0, 2.9, 0, 1, 1, 1, 5);
      mb.sph(0.2, C.leaf, 0.42, 0.14, 0.3, 1, 0.7, 1, 5).sph(0.08, C.pink, 0.42, 0.28, 0.3, 1, 1, 1, 5);
      o.glows = [[0, 2.3, 0, 0x8fe9ff, 2.6]];
      break;
    }
    case 'fountain': {
      mb.cyl(1.75, 1.85, 0.5, C.stone, 0, 0, 0, 12).cyl(1.5, 1.5, 0.08, C.water, 0, 0.44, 0, 12).cyl(1.86, 1.86, 0.12, C.stoneL, 0, 0.44, 0, 12).cyl(1.52, 1.52, 0.14, C.stoneL, 0, 0.42, 0, 12);
      mb.cyl(1.48, 1.48, 0.1, C.water, 0, 0.46, 0, 12);
      mb.cyl(0.3, 0.42, 1.1, C.stoneL, 0, 0.4, 0, 8).cyl(0.9, 0.5, 0.26, C.stone, 0, 1.4, 0, 10).cyl(0.78, 0.78, 0.06, C.water, 0, 1.62, 0, 10);
      mb.cyl(0.16, 0.22, 0.7, C.stoneL, 0, 1.6, 0, 8).sph(0.24, C.gold, 0, 2.46, 0, 1, 1.2, 1, 6).cone(0.14, 0.3, C.gold, 0, 2.62, 0, 5);
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * 6.28;
        mb.add(new THREE.CylinderGeometry(0.035, 0.05, 0.9, 5), 0xbfeaff, Math.sin(a) * 0.62, 1.2, Math.cos(a) * 0.62, Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5);
        mb.sph(0.09, C.gold, Math.sin(a + 0.5) * 1.2, 0.5, Math.cos(a + 0.5) * 1.2, 1, 0.3, 1, 5);
      }
      o.glows = [[0, 1.4, 0, 0x9fe3ff, 2.6]];
      break;
    }
    case 'statue': {
      mb.cyl(1.6, 1.75, 0.3, C.stoneD, 0, 0, 0, 8).box(2.0, 1.1, 2.0, C.stone, 0, 0.3, 0).box(2.3, 0.2, 2.3, C.stoneL, 0, 1.4, 0).box(2.2, 0.14, 2.2, C.stoneL, 0, 0.3, 0);
      mb.box(1.3, 0.5, 0.06, C.gold, 0, 0.6, 1.01);
      mb.jitter = 0.02;
      mb.push(0, 1.6, 0, 0, 1.3);
      const G = C.gold, GD = C.goldD;
      mb.box(0.21, 0.17, 0.32, GD, -0.16, 0, 0.05).box(0.21, 0.17, 0.32, GD, 0.16, 0, 0.05).cyl(0.3, 0.43, 0.6, G, 0, 0.15, 0, 8).cyl(0.4, 0.42, 0.09, GD, 0, 0.36, 0, 8);
      mb.sph(0.35, G, 0, 1.08, 0, 1, 1, 1, 10).sph(0.2, GD, 0, 0.93, 0.25, 1.25, 1, 0.6).cyl(0.3, 0.27, 0.16, G, 0, 1.36, 0, 10);
      for (let i = 0; i < 5; i++) mb.cone(0.07, 0.22, G, Math.sin(i * 1.257) * 0.26, 1.5, Math.cos(i * 1.257) * 0.26, 4);
      mb.box(0.66, 0.84, 0.08, GD, 0, 0.1, -0.36, 0, 0.12);
      mb.sph(0.14, G, -0.4, 0.66, 0.04).sph(0.14, G, 0.46, 0.96, 0.1).box(0.1, 1.1, 0.04, G, 0.56, 0.9, 0.2).box(0.3, 0.07, 0.08, GD, 0.56, 0.96, 0.2);
      mb.pop();
      for (const [x, z] of [[-1.3, 1.3], [1.3, 1.3], [-1.3, -1.3], [1.3, -1.3]]) mb.sph(0.34, C.leaf, x, 0.3, z, 1, 0.85, 1, 6).sph(0.1, C.pink, x + 0.1, 0.56, z + 0.1, 1, 1, 1, 5);
      break;
    }
    case 'tower': {
      mb.cyl(1.25, 1.42, 0.3, C.stoneD, 0, 0, 0, 10).cyl(0.95, 1.15, 3.2, C.stone, 0, 0.3, 0, 10);
      for (let k = 0; k < 8; k++) {
        const a = mb.rand() * 6.28;
        mb.box(0.36, 0.18, 0.08, shade(C.stone, mb.rand() < 0.5 ? 0.86 : 1.06), Math.sin(a) * 1.02, 0.6 + mb.rand() * 2.4, Math.cos(a) * 1.02, a);
      }
      mb.cyl(1.32, 1.05, 0.5, C.woodD, 0, 3.5, 0, 10).cyl(1.36, 1.36, 0.1, C.plank, 0, 4.0, 0, 10);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        mb.box(0.38, 0.44, 0.34, C.wood, Math.sin(a) * 1.14, 4.1, Math.cos(a) * 1.14, a);
        if (i % 2 === 0) mb.cyl(0.05, 0.05, 1.0, C.woodD, Math.sin(a) * 1.1, 4.5, Math.cos(a) * 1.1, 4);
      }
      coneRoof(mb, 1.4, 1.4, team === TEAM.rebel ? C.roofP : C.roofR, 0, 5.4, 0);
      mb.box(0.22, 0.52, 0.1, C.dark, 0, 1.9, 1.02).box(0.22, 0.52, 0.1, C.dark, 1.02, 1.9, 0, Math.PI / 2).box(0.22, 0.52, 0.1, C.dark, -1.02, 1.9, 0, Math.PI / 2);
      mb.box(0.5, 1.0, 0.05, team, 0, 2.5, 1.2).box(0.5, 0.1, 0.06, C.gold, 0, 3.42, 1.2);
      break;
    }
    case 'rubble': {
      const r = rng(level + 5);
      mb.cyl(2.0, 2.2, 0.06, 0x8a7a66, 0, 0, 0, 12);
      for (let i = 0; i < 12; i++) {
        const a = r() * 6.28, d = r() * 1.7;
        if (i % 3 === 0) mb.box(0.3 + r() * 0.5, 0.2 + r() * 0.3, 0.9 + r() * 0.8, i % 2 ? C.woodD : C.plank, Math.sin(a) * d, 0, Math.cos(a) * d, a, 0.15);
        else mb.rock(0.3 + r() * 0.42, i % 2 ? C.stoneD : C.stone, Math.sin(a) * d, 0.2, Math.cos(a) * d, 1, 0.7, 1, a);
      }
      mb.rock(0.2, C.coal, 0.3, 0.2, 0.2).cone(0.12, 0.3, C.fire, -0.4, 0.3, 0.3, 5);
      break;
    }
    case 'scaffold': {
      for (const [x, z] of [[-2.5, -2.5], [2.5, -2.5], [-2.5, 2.5], [2.5, 2.5]]) mb.box(0.16, 3.7, 0.16, C.woodL, x, 0, z);
      for (const y of [1.3, 2.7]) {
        mb.box(5.1, 0.12, 0.32, C.plank, 0, y, -2.5).box(5.1, 0.12, 0.32, C.plank, 0, y, 2.5).box(0.32, 0.12, 5.1, C.plank, -2.5, y, 0).box(0.32, 0.12, 5.1, C.plank, 2.5, y, 0);
      }
      mb.box(0.1, 4.0, 0.1, C.woodD, 2.5, 0, 0, 0, 0.6).box(0.1, 4.0, 0.1, C.woodD, -2.5, 0, 0, 0, -0.6).box(0.1, 4.0, 0.1, C.woodD, 0, 0, 2.5, 0, 0, 0.6);
      mb.box(0.08, 2.7, 0.08, C.woodD, 2.72, 0, 1.2).box(0.08, 2.7, 0.08, C.woodD, 2.72, 0, 1.8);
      for (let i = 0; i < 6; i++) mb.box(0.08, 0.06, 0.6, C.wood, 2.72, 0.3 + i * 0.42, 1.5);
      crate(mb, 2.2, 2.2, 0.5); mb.box(1.1, 0.2, 0.5, C.stoneL, -2.0, 0, 2.3, 0.2).box(0.9, 0.2, 0.4, C.stone, -2.0, 0.2, 2.3, 0.5);
      break;
    }
    case 'site': {
      mb.box(5.5, 0.07, 5.5, C.dirt, 0, 0, 0);
      for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) mb.cyl(0.08, 0.1, 0.7, C.woodD, x, 0, z, 5).box(0.2, 0.14, 0.02, C.red, x + 0.1, 0.52, z);
      mb.box(1.6, 0.12, 0.4, C.plank, -0.6, 0.07, 0.4, 0.3).box(1.6, 0.12, 0.4, C.woodL, -0.5, 0.19, 0.5, 0.5).box(0.9, 0.3, 0.6, C.stoneL, 1.0, 0.07, -0.6, 0.2).box(0.7, 0.3, 0.5, C.stone, 1.1, 0.37, -0.6, 0.6);
      mb.rock(0.3, C.soil, -1.4, 0.2, -1.2, 1.4, 0.7, 1.2).box(0.05, 0.9, 0.05, C.woodD, -1.4, 0.2, -1.2, 0, 0, 0.3).box(0.24, 0.3, 0.04, C.metalD, -1.56, 0.96, -1.2, 0, 0, 0.3);
      break;
    }
    case 'cart': {
      mb.box(2.0, 0.03, 3.6, C.shadow, 0, 0.005, 0.3);
      mb.box(1.5, 0.5, 2.0, C.wood, 0, 0.45, -0.6).box(1.6, 0.08, 2.1, C.woodD, 0, 0.92, -0.6);
      for (const [x, z] of [[-0.85, -0.1], [0.85, -0.1], [-0.85, -1.2], [0.85, -1.2]]) mb.log(0.4, 0.14, C.woodD, x, 0.4, z, 0, 10).log(0.12, 0.18, C.gold, x, 0.4, z, 0, 6);
      for (const [x, z] of [[-0.7, 0.3], [0.7, 0.3], [-0.7, -1.5], [0.7, -1.5]]) mb.box(0.07, 1.2, 0.07, C.woodD, x, 0.95, z);
      for (let k = 0; k < 5; k++) mb.box(0.34, 0.08, 2.1, k % 2 ? C.white : C.roofP, -0.68 + k * 0.34, 2.15, -0.6);
      for (let k = 0; k < 5; k++) mb.cone(0.16, 0.2, k % 2 ? C.white : C.roofP, -0.68 + k * 0.34, 1.86, 0.44, 3);
      mb.sph(0.25, C.gold, -0.3, 1.2, -0.9).sph(0.22, C.orange, 0.3, 1.18, -0.4);
      crate(mb, 0.2, -1.2, 0.5, 1.0);
      mb.gem(0.12, 0.4, C.mana, -0.4, 1.0, -0.3).gem(0.1, 0.3, C.purple, -0.15, 1.0, -0.15);
      mb.push(0, 0, 1.6, 0, 0.9);
      pony(mb, 0xbfa58a);
      mb.pop();
      break;
    }
  }
  o.geo = mb.build(type === 'cart' ? 0.4 : 1);
  const bb = o.geo.boundingBox!;
  o.h = bb.max.y;
  const def = (BUILDINGS as Record<string, { size: number } | undefined>)[type];
  if (def) {
    const ext = Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z);
    o.fit = Math.min(1, (def.size * TILE * 0.5 - 0.1) / ext);
  }
  return o;
}

const builtCache = new Map<string, Built>();
function built(type: BuildKind, level: number, team: number): Built {
  const key = `${type}:${level}:${team}`;
  let b = builtCache.get(key);
  if (!b) { b = buildBuilding(type, level, team); builtCache.set(key, b); }
  return b;
}
/** Buildings look different at levels 1-3, 4-6 and 7-10 (the keep changes more often). */
export function visLevel(type: string, level: number): number {
  if (type === 'keep') return Math.max(1, level <= 2 ? level : level <= 5 ? 3 : level <= 8 ? 6 : 9);
  return level <= 3 ? 1 : level <= 6 ? 4 : 7;
}

let flagGeo: THREE.BufferGeometry | null = null;
let millGeo: THREE.BufferGeometry | null = null;
let crystalGeo: THREE.BufferGeometry | null = null;

/**
 * A village building. The outer group is free for the caller to move and animate; the inner group is
 * scaled so the model fits its tile footprint. Extras: waving flag, windmill sails, floating crystal, glow halos.
 * userData: h (height), smoke (chimney tops), crystal (the tappable crystal mesh).
 */
export function buildingMesh(type: BType, level: number, team: number = TEAM.player): THREE.Group {
  const outer = new THREE.Group();
  const g = new THREE.Group();
  outer.add(g);
  const b = built(type, visLevel(type, Math.max(1, level)), team);
  g.scale.setScalar(b.fit);
  g.add(mesh(b.geo));
  outer.userData.h = b.h * b.fit;
  outer.userData.smoke = (b.smoke || []).map(p => [p[0] * b.fit, p[1] * b.fit, p[2] * b.fit]);
  if (b.flag) {
    if (!flagGeo) flagGeo = new MB().cyl(0.05, 0.06, 1.8, C.woodD, 0, 0, 0, 5).sph(0.1, C.gold, 0, 1.8, 0, 1, 1, 1, 6).build(0);
    const pole = mesh(flagGeo, true, 0);
    pole.position.set(b.flag[0], b.flag[1] - 0.15, b.flag[2]);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.7, 6, 1), new THREE.MeshToonMaterial({ color: team, side: THREE.DoubleSide }));
    cloth.geometry.translate(0.58, 0, 0);
    cloth.position.set(0, 1.35, 0);
    cloth.userData.flag = true;
    pole.add(cloth);
    g.add(pole);
    outer.userData.h = Math.max(outer.userData.h as number, (b.flag[1] + 1.9) * b.fit);
  }
  if (b.mill) {
    if (!millGeo) {
      const mb = new MB();
      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        mb.add(new THREE.BoxGeometry(0.1, 1.9, 0.07), C.woodD, Math.sin(a) * 0.95, Math.cos(a) * 0.95, 0, 0, 0, -a);
        mb.add(new THREE.BoxGeometry(0.46, 1.4, 0.04), C.cloth, Math.sin(a) * 1.15 + Math.cos(a) * 0.26, Math.cos(a) * 1.15 - Math.sin(a) * 0.26, 0.02, 0, 0, -a);
      }
      mb.add(new THREE.CylinderGeometry(0.16, 0.16, 0.34, 8), C.woodD, 0, 0, 0, Math.PI / 2, 0, 0).add(new THREE.CylinderGeometry(0.09, 0.09, 0.4, 6), C.gold, 0, 0, 0.05, Math.PI / 2, 0, 0);
      millGeo = mb.build(0);
    }
    const sails = mesh(millGeo, true, 0.04);
    sails.position.set(b.mill[0], b.mill[1], b.mill[2]);
    sails.userData.spin = 1.1;
    g.add(sails);
  }
  if (b.crystal) {
    if (!crystalGeo) {
      const mb = new MB();
      mb.jitter = 0.12;
      mb.add(new THREE.OctahedronGeometry(1, 0), C.mana, 0, 0, 0, 0, 0, 0, 0.55, 1.1, 0.55);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * 6.28 + 0.4;
        mb.add(new THREE.OctahedronGeometry(1, 0), k % 2 ? C.purple : 0xb8f4ff, Math.sin(a) * 1.05, (k % 2 ? 0.3 : -0.3), Math.cos(a) * 1.05, 0, a, 0.3, 0.14, 0.34, 0.14);
      }
      crystalGeo = mb.build(0);
    }
    const cr = new THREE.Mesh(crystalGeo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    if (artOpts.outline) cr.add(new THREE.Mesh(crystalGeo, outlineMat(0.07)));
    cr.position.set(b.crystal[0], b.crystal[1], b.crystal[2]);
    cr.userData.floatY = b.crystal[1];
    g.add(cr);
    outer.userData.crystal = cr;
    outer.userData.h = (b.crystal[1] + 1.6) * b.fit;
  }
  for (const gl of b.glows || []) {
    const sp = glowSprite(gl[3], gl[4]);
    sp.position.set(gl[0], gl[1], gl[2]);
    g.add(sp);
  }
  return outer;
}

export type PropKind = 'tower' | 'hut' | 'rebelcamp' | 'rubble' | 'scaffold' | 'site' | 'cart' | 'enemykeep';
export function propMesh(kind: PropKind, variant = 0, team: number = TEAM.enemy): THREE.Mesh {
  if (kind === 'enemykeep') return mesh(built('keep', [2, 3, 6, 9][Math.min(3, variant)], team).geo);
  return mesh(built(kind, variant, team).geo, kind !== 'site', kind === 'site' || kind === 'rubble' ? 0 : 0.055);
}

// ---------------------------------------------------------------- obstacles, creatures, scenery

/** Things on village tiles that the player taps to clear: oak, pine, boulder, giant mushroom, mana shard. */
export function obstacleMesh(kind: number, variant: number): THREE.Mesh {
  const v = variant % 3;
  const geo = cached(`ob:${kind}:${v}`, () => {
    const mb = new MB(kind * 10 + v + 1);
    const s = 0.52 + v * 0.05;
    if (kind === 0) { tree(mb, 0, 0, s, 1 + (v === 2 ? 2 : 0)); mb.rock(0.2, C.woodD, 0.2, 0.06, 0.16, 1.6, 0.5, 1).rock(0.18, C.woodD, -0.22, 0.06, -0.1, 1.5, 0.5, 1); }
    else if (kind === 1) tree(mb, 0, 0, s * 1.05, 0);
    else if (kind === 2) { mb.rock(0.62, C.stoneD, 0, 0.42, 0, 1.1, 0.9, 1, v).rock(0.36, C.stone, 0.48, 0.24, 0.3, 1, 0.8, 1, v + 1).rock(0.26, C.stoneL, -0.46, 0.18, 0.34).sph(0.3, C.moss, -0.1, 0.84, -0.1, 1.3, 0.35, 1.1, 6); }
    else if (kind === 3) { mushroom(mb, 0, 0, 1.25, [C.red, C.purple, C.roofT][v]); mushroom(mb, 0.5, 0.36, 0.55, [C.orange, C.pink, C.red][v]); }
    else { crystals(mb, 0, 0, 0.9, [C.mana, C.purple, 0x7dffb0][v]); mb.rock(0.3, C.stoneD, 0.1, 0.1, 0.1, 1.6, 0.5, 1.4); }
    return mb.build(0.8);
  });
  return mesh(geo, true, 0.045);
}

/** A dragon for the Summon Dragon spell: body mesh plus two wings that the caller flaps. */
export function dragonMesh(): THREE.Group {
  const g = new THREE.Group();
  const body = cached('dragon:body', () => {
    const mb = new MB(7);
    const red = 0xd93a2b, belly = 0xf2c46b;
    mb.sph(1.1, red, 0, 0, 0, 1, 0.8, 2.0, 10).sph(0.9, belly, 0, -0.3, 0.1, 0.8, 0.6, 1.7, 8);
    mb.sph(0.6, red, 0, 0.5, 2.2, 1, 0.9, 1.3).sph(0.75, red, 0, 0.9, 3.2, 0.9, 0.8, 1.1, 8).sph(0.45, red, 0, 0.75, 4.0, 1, 0.7, 1.2);
    mb.add(new THREE.ConeGeometry(0.12, 0.7, 5), belly, -0.4, 1.6, 2.9, -0.5, 0, 0.2).add(new THREE.ConeGeometry(0.12, 0.7, 5), belly, 0.4, 1.6, 2.9, -0.5, 0, -0.2);
    mb.sph(0.13, 0xfff27a, -0.42, 1.15, 3.6, 1, 1, 0.6, 6).sph(0.13, 0xfff27a, 0.42, 1.15, 3.6, 1, 1, 0.6, 6).sph(0.06, C.dark, -0.46, 1.15, 3.7, 1, 1, 1, 4).sph(0.06, C.dark, 0.46, 1.15, 3.7, 1, 1, 1, 4);
    for (let i = 0; i < 6; i++) mb.sph(0.8 - i * 0.12, red, 0, -0.05 * i, -1.6 - i * 0.85, 1, 0.8, 1.2, 7);
    mb.add(new THREE.ConeGeometry(0.5, 0.9, 4), belly, 0, -0.3, -7.0, -1.4, 0, 0);
    for (let i = 0; i < 9; i++) mb.cone(0.16, 0.5, belly, 0, 0.75 - Math.abs(i - 3) * 0.06, 2.4 - i * 0.9, 4);
    for (const sx of [-1, 1]) mb.sph(0.3, red, sx * 0.7, -0.8, 1.0, 1, 1.4, 1, 6).sph(0.3, red, sx * 0.7, -0.8, -1.0, 1, 1.4, 1, 6);
    return mb.build(0);
  });
  g.add(mesh(body, false, 0.08));
  const wing = cached('dragon:wing', () => {
    const mb = new MB(9);
    mb.add(new THREE.CylinderGeometry(0.12, 0.16, 4.2, 5), 0xa8281c, 2.0, 0.1, 0.6, 0, 0, -1.45);
    for (let i = 0; i < 4; i++) mb.add(new THREE.BoxGeometry(1.05, 0.06, 2.6 - i * 0.35), i % 2 ? 0xf2a65a : 0xf2c46b, 0.6 + i * 1.05, 0.02, -0.5 + i * 0.1, 0, 0.12, 0);
    return mb.build(0);
  });
  for (const sx of [-1, 1]) {
    const w = mesh(wing, false, 0.06);
    w.scale.x = sx;
    w.position.set(sx * 0.7, 0.5, 0.4);
    w.userData.wing = sx;
    g.add(w);
  }
  return g;
}

/** One merged mesh of trees, rocks, mushrooms and bushes scattered between two radii. */
export function scenery(seed: number, inner: number, outer: number, count: number, keepClear?: (x: number, z: number) => boolean): THREE.Mesh {
  const r = rng(seed);
  const mb = new MB(seed);
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = inner + Math.pow(r(), 0.8) * (outer - inner);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (keepClear && keepClear(x, z)) continue;
    const roll = r();
    if (roll < 0.58) tree(mb, x, z, 1.1 + r() * 1.3, r() < 0.12 ? 3 : Math.floor(r() * 3));
    else if (roll < 0.74) mb.rock(0.5 + r() * 0.9, r() < 0.5 ? C.stone : C.stoneD, x, 0.3, z, 1, 0.8, 1, r() * 6);
    else if (roll < 0.82) mushroom(mb, x, z, 0.8 + r() * 1.4, [C.red, C.purple, C.roofT, C.orange][Math.floor(r() * 4)]);
    else if (roll < 0.86) crystals(mb, x, z, 0.8 + r() * 0.9, r() < 0.5 ? C.mana : C.purple);
    else mb.sph(0.6 + r() * 0.5, r() < 0.5 ? C.leaf : C.leafL, x, 0.35, z, 1.2, 0.8, 1.2, 7);
  }
  return mesh(mb.build(0.9), true, 0);
}

/** Flowers and grass tufts: cheap colour on the ground, no shadows. */
export function meadow(seed: number, radius: number, count: number, keepClear?: (x: number, z: number) => boolean): THREE.Mesh {
  const r = rng(seed);
  const mb = new MB(seed);
  const cols = [C.white, C.pink, C.gold, 0xb69cff, C.leafL, C.leafL, C.grassD, C.grassD];
  for (let i = 0; i < count; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * radius;
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    if (keepClear && keepClear(x, z)) { r(); continue; }
    const col = cols[Math.floor(r() * cols.length)];
    if (col === C.grassD) mb.cyl(1.2 + r() * 1.6, 1.4 + r() * 1.6, 0.03, C.grassD, x, 0, z, 9);
    else if (col === C.leafL) mb.cone(0.16, 0.42, C.leafL, x, 0, z, 4).cone(0.13, 0.32, C.leaf, x + 0.16, 0, z + 0.08, 4).cone(0.12, 0.28, C.leafD, x - 0.1, 0, z + 0.14, 4);
    else mb.sph(0.13, col, x, 0.22, z, 1, 0.6, 1, 6).cyl(0.02, 0.02, 0.22, C.leafD, x, 0, z, 4).sph(0.05, C.gold, x, 0.27, z, 1, 1, 1, 4);
  }
  return mesh(mb.build(0), false, 0);
}

/** Distant snow-capped peaks. */
export function mountains(seed: number, radius: number, count: number): THREE.Mesh {
  const r = rng(seed);
  const mb = new MB(seed);
  mb.jitter = 0.1;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r() * 0.2;
    const d = radius * (0.9 + r() * 0.35);
    const h = radius * (0.22 + r() * 0.22);
    const w = h * (0.75 + r() * 0.4);
    const x = Math.sin(a) * d, z = Math.cos(a) * d;
    mb.cone(w, h, r() < 0.5 ? 0x7f86c9 : 0x8f7fc4, x, -2, z, 6);
    mb.cone(w * 0.36, h * 0.36, 0xf4f7ff, x, -2 + h * 0.645, z, 6);
  }
  const m = new THREE.Mesh(mb.build(0), toonMat());
  return m;
}

/** A floating island: rock underside, grassy top, a few trees and a thin waterfall. */
export function island(seed: number): THREE.Mesh {
  const r = rng(seed);
  const mb = new MB(seed);
  mb.cyl(5, 4.2, 0.9, C.grass, 0, 0, 0, 9).cyl(4.3, 2.6, 2.2, 0x9a7a5c, 0, -2.2, 0, 8).cone(2.7, 4.2, 0x8a6a4f, 0, -6.4, 0, 7);
  mb.add(new THREE.ConeGeometry(2.7, 4.2, 7), 0x8a6a4f, 0, -4.3, 0, Math.PI, 0, 0);
  for (let i = 0; i < 5; i++) mb.rock(0.7 + r() * 0.8, i % 2 ? 0x9a7a5c : C.stoneD, (r() - 0.5) * 6, -1.2 - r() * 2, (r() - 0.5) * 6);
  for (let i = 0; i < 4; i++) tree(mb, (r() - 0.5) * 6, (r() - 0.5) * 6, 0.9 + r() * 0.5, Math.floor(r() * 4));
  mb.push(0, 0.9, 0);
  for (let i = 0; i < 4; i++) tree(mb, (r() - 0.5) * 6, (r() - 0.5) * 6, 0.8 + r() * 0.6, i === 0 ? 3 : Math.floor(r() * 3));
  mb.pop();
  crystals(mb, 1.5, 1.0, 1.4, C.mana);
  mb.box(0.5, 9, 0.2, 0xbfeaff, 4.4, -8.4, 0.6).box(1.0, 0.1, 0.8, C.water, 3.9, 0.86, 0.6);
  return mesh(mb.build(0), false, 0);
}

export function cloud(seed: number): THREE.Mesh {
  const r = rng(seed);
  const mb = new MB(seed);
  mb.jitter = 0.02;
  for (let i = 0; i < 5; i++) mb.sph(2 + r() * 2, C.white, (i - 2) * 2.4, r() * 0.9, r() * 1.5, 1.2, 0.7, 1, 8);
  return new THREE.Mesh(mb.build(0), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.94, fog: false }));
}

// ---------------------------------------------------------------- walls and outskirts (they grow with the realm)

/** What the village defences are called at each realm size (index = tiers of rivals conquered). */
export const WALL_NAMES = [
  'Picket Fence', 'Timber Palisade', 'Watchtower Palisade', 'Stone Ramparts', 'Towered Curtain Wall',
  'Moated Fortress', 'Marble Bastion', 'Arcane Citadel', 'Imperial Stronghold', 'Throne of the World',
];

function addGlows(g: THREE.Group, glows: [number, number, number, number, number][]): void {
  for (const gl of glows) {
    const sp = glowSprite(gl[3], gl[4]);
    sp.position.set(gl[0], gl[1], gl[2]);
    g.add(sp);
  }
}
/** Wooden lookout: four legs, a railed platform, a little roof and a banner. */
function lookout(mb: MB, x: number, z: number, h: number, team: number): void {
  for (const [dx, dz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) mb.box(0.2, h, 0.2, C.woodD, x + dx, 0, z + dz);
  mb.box(0.12, h * 1.2, 0.12, C.wood, x, 0, z - 0.8, 0, 0, 0.5).box(0.12, h * 1.2, 0.12, C.wood, x, 0, z + 0.8, 0, 0, -0.5);
  mb.box(2.3, 0.16, 2.3, C.plank, x, h, z);
  for (const [dx, dz, w, d] of [[0, -1.05, 2.3, 0.1], [0, 1.05, 2.3, 0.1], [-1.05, 0, 0.1, 2.3], [1.05, 0, 0.1, 2.3]]) mb.box(w, 0.5, d, C.wood, x + dx, h + 0.16, z + dz);
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mb.box(0.12, 1.5, 0.12, C.woodD, x + dx, h + 0.16, z + dz);
  mb.pyr(2.8, 2.8, 1.1, C.straw, x, h + 1.66, z).sph(0.1, C.gold, x, h + 2.8, z, 1, 1, 1, 5);
  mb.box(0.5, 0.9, 0.05, team, x, h - 1.1, z + 0.92);
}
/** Small golden monarch for monuments. */
function goldFigure(mb: MB, x: number, y: number, z: number, s: number): void {
  mb.push(x, y, z, 0, s);
  mb.cyl(0.3, 0.43, 0.6, C.gold, 0, 0.15, 0, 8).box(0.21, 0.17, 0.32, C.goldD, -0.16, 0, 0.05).box(0.21, 0.17, 0.32, C.goldD, 0.16, 0, 0.05);
  mb.sph(0.35, C.gold, 0, 1.08, 0, 1, 1, 1, 8).cyl(0.3, 0.27, 0.16, C.gold, 0, 1.36, 0, 8);
  for (let i = 0; i < 5; i++) mb.cone(0.07, 0.22, C.gold, Math.sin(i * 1.257) * 0.26, 1.5, Math.cos(i * 1.257) * 0.26, 4);
  mb.box(0.66, 0.84, 0.08, C.goldD, 0, 0.1, -0.36, 0, 0.12).sph(0.14, C.gold, 0.46, 0.96, 0.1).box(0.1, 1.1, 0.04, C.gold, 0.56, 0.9, 0.2);
  mb.pop();
}

/**
 * The defences around the village. Stage 0 is a picket fence; each ring of rivals conquered upgrades it:
 * palisade, watchtowers, stone ramparts, towers, a moat, marble, arcane crystals, gold.
 */
export function walls(stage: number, half: number, gate: number, team: number): THREE.Group {
  const g = new THREE.Group();
  const st = Math.max(0, Math.min(9, stage));
  const mb = new MB(60 + st);
  const glows: [number, number, number, number, number][] = [];
  /** Calls fn at regular steps along all four sides, skipping the gate gap in the south wall. */
  const sides = (step: number, fn: (x: number, z: number, nx: number, nz: number, i: number) => void) => {
    const n = Math.round((half * 2) / step);
    for (let i = 0; i <= n; i++) {
      const t = -half + (i / n) * half * 2;
      fn(t, -half, 0, -1, i);
      fn(-half, t, -1, 0, i + 1);
      fn(half, t, 1, 0, i + 2);
      if (Math.abs(t) > gate + 0.5) fn(t, half, 0, 1, i);
    }
  };
  /** A continuous band along all four sides (split for the gate), pushed outwards by `off`. */
  const run = (hh: number, y: number, color: number, thick: number, off = 0) => {
    mb.box(half * 2 + thick, hh, thick, color, 0, y, -half - off);
    mb.box(thick, hh, half * 2 + thick, color, -half - off, y, 0).box(thick, hh, half * 2 + thick, color, half + off, y, 0);
    const len = half - gate;
    for (const sx of [-1, 1]) mb.box(len, hh, thick, color, sx * (gate + len / 2), y, half + off);
  };
  const corners: [number, number][] = [[-half, -half], [half, -half], [-half, half], [half, half]];

  if (st === 0) {
    sides(1.7, (x, z, _nx, _nz, i) => { mb.cyl(0.11, 0.13, 0.95, i % 2 ? C.wood : C.woodD, x, 0, z, 5).cone(0.12, 0.2, C.woodL, x, 0.95, z, 5); });
    run(0.09, 0.7, C.wood, 0.07);
    run(0.09, 0.36, C.wood, 0.07);
    for (const sx of [-1, 1]) mb.box(0.36, 2.7, 0.36, C.woodD, sx * (gate + 0.2), 0, half).cone(0.3, 0.4, C.wood, sx * (gate + 0.2), 2.7, half, 4);
    mb.box(gate * 2 + 0.8, 0.3, 0.2, C.wood, 0, 2.3, half).box(1.5, 0.8, 0.08, C.plank, 0, 1.5, half + 0.12).box(0.9, 0.5, 0.1, team, 0, 1.64, half + 0.14);
  } else if (st <= 2) {
    const h0 = st === 1 ? 1.5 : 2.1;
    sides(1.15, (x, z, _nx, _nz, i) => {
      const h = h0 + (i % 3) * 0.14;
      mb.cyl(0.24, 0.27, h, i % 2 ? C.wood : C.woodD, x, 0, z, 6).cone(0.25, 0.4, C.woodL, x, h, z, 6);
    });
    run(0.14, h0 * 0.62, C.woodD, 0.12);
    if (st === 2) run(0.14, h0 * 0.3, C.woodD, 0.12);
    for (const [x, z] of corners) {
      if (st === 1) mb.cyl(0.55, 0.65, 2.7, C.woodD, x, 0, z, 8).cone(0.62, 0.9, C.wood, x, 2.7, z, 8);
      else lookout(mb, x, z, 3.4, team);
    }
    for (const sx of [-1, 1]) {
      const gx = sx * (gate + 0.7);
      if (st === 1) mb.cyl(0.5, 0.58, 4.3, C.woodD, gx, 0, half, 8).cone(0.58, 0.9, C.wood, gx, 4.3, half, 8);
      else lookout(mb, gx + sx * 0.5, half, 3.8, team);
      mb.box(0.6, 1.3, 0.05, team, gx, 2.0, half + 0.62).box(0.6, 0.1, 0.06, C.gold, gx, 3.2, half + 0.62);
      torch(mb, gx - sx * 0.62, 1.5, half + 0.2);
      glows.push([gx - sx * 0.62, 2.15, half + 0.3, 0xffb060, 1.6]);
    }
    mb.box(gate * 2 + 1.6, 0.45, 0.45, C.wood, 0, 3.7, half).box(gate * 2 + 1.6, 0.14, 0.7, C.woodD, 0, 4.15, half);
    mb.box(1.6, 1.0, 0.1, C.gold, 0, 3.4, half + 0.3).box(1.36, 0.76, 0.12, team, 0, 3.52, half + 0.31);
    if (st === 2) for (const t of [-half / 2, half / 2]) { lookout(mb, t, -half, 3.2, team); lookout(mb, -half, t, 3.2, team); lookout(mb, half, t, 3.2, team); }
  } else {
    const wallH = [2.3, 3.0, 3.3, 3.6, 3.9, 4.2, 4.5][st - 3];
    const col = st < 6 ? C.stone : st < 8 ? 0xf2ede4 : 0xfaf2dc;
    const colD = st < 6 ? C.stoneD : st < 8 ? 0xcfc8ba : 0xd9c79a;
    const colL = st < 6 ? C.stoneL : 0xffffff;
    const roofCol = st < 6 ? C.roofB : st < 8 ? C.roofT : C.gold;
    const thick = 1.2;
    run(0.45, 0, colD, thick + 0.5);
    run(wallH, 0.2, col, thick);
    run(0.2, wallH + 0.2, colL, thick + 0.25);
    if (st >= 6) run(0.22, wallH - 0.5, C.gold, 0.12, thick / 2 + 0.02);
    sides(1.35, (x, z, nx, nz) => { mb.box(nx ? 0.55 : 0.7, 0.55, nz ? 0.55 : 0.7, colL, x + nx * 0.4, wallH + 0.4, z + nz * 0.4); });
    // Raised brickwork and buttresses break up the long faces.
    sides(3.1, (x, z, nx, nz, i) => {
      if (i % 3 === 0) mb.box(nx ? 0.5 : 1.0, wallH * 0.8, nz ? 0.5 : 1.0, colD, x + nx * (thick / 2 + 0.15), 0.2, z + nz * (thick / 2 + 0.15));
      else mb.box(nx ? 0.08 : 0.5, 0.22, nz ? 0.08 : 0.5, shade(col, i % 2 ? 0.88 : 1.05), x + nx * (thick / 2), 0.7 + ((i * 7) % 5) * 0.35, z + nz * (thick / 2));
    });
    if (st >= 4) {
      sides(8.2, (x, z, nx, nz, i) => {
        if (i === 0 || Math.abs(x) > half - 3 && Math.abs(z) > half - 3) return;
        mb.box(nx ? 0.06 : 0.75, 1.5, nz ? 0.06 : 0.75, team, x + nx * (thick / 2 + 0.04), wallH - 1.9, z + nz * (thick / 2 + 0.04));
        mb.box(nx ? 0.07 : 0.75, 0.12, nz ? 0.07 : 0.75, C.gold, x + nx * (thick / 2 + 0.05), wallH - 0.5, z + nz * (thick / 2 + 0.05));
      });
    }
    const towerAt = (x: number, z: number, r: number, h: number) => {
      tower(mb, x, z, r, h, colL, roofCol, team);
      if (st >= 7) {
        mb.gem(r * 0.3, r * 1.1, C.mana, x, h + 0.42 + r * 2.5, z);
        glows.push([x, h + 0.9 + r * 2.9, z, 0x8fe9ff, 3.2]);
      }
    };
    for (const [x, z] of corners) towerAt(x, z, 1.55, wallH + 2.3);
    if (st >= 4) {
      const mids = st >= 6 ? [-half / 2.6, half / 2.6] : [0];
      for (const t of mids) { towerAt(t, -half, 1.2, wallH + 1.6); towerAt(-half, t, 1.2, wallH + 1.6); towerAt(half, t, 1.2, wallH + 1.6); }
      for (const sx of [-1, 1]) towerAt(sx * half * 0.56, half, 1.2, wallH + 1.6);
    }
    // Gatehouse: twin towers, an arch with a raised portcullis, banner and torches.
    for (const sx of [-1, 1]) {
      const gx = sx * (gate + 1.5);
      towerAt(gx, half, 1.7, wallH + 3.0);
      torch(mb, sx * (gate - 0.1), 1.7, half + 0.75);
      glows.push([sx * (gate - 0.1), 2.35, half + 0.85, 0xffb060, 1.8]);
    }
    mb.box(gate * 2 + 0.6, 1.5, 1.6, col, 0, wallH + 0.3, half).box(gate * 2 + 0.6, 0.2, 1.9, colL, 0, wallH + 1.8, half);
    for (let i = 0; i < 5; i++) mb.box(0.6, 0.5, 0.5, colL, -gate + 0.6 + i * ((gate * 2 - 1.2) / 4), wallH + 2.0, half + 0.65);
    for (let i = 0; i < 7; i++) mb.box(0.09, 1.0, 0.09, C.metalD, -gate + 0.5 + i * ((gate * 2 - 1.0) / 6), wallH - 0.7, half);
    mb.box(gate * 2 - 0.6, 0.09, 0.1, C.metalD, 0, wallH - 0.4, half);
    mb.box(1.9, 1.3, 0.1, C.gold, 0, wallH + 0.4, half + 0.84).box(1.6, 1.04, 0.12, team, 0, wallH + 0.53, half + 0.85);
    if (st >= 5) {
      // Drawbridge over the moat, with chains.
      mb.box(gate * 2 - 0.5, 0.2, 5.4, C.plank, 0, 0.12, half + 3.2);
      for (let i = 0; i < 6; i++) mb.box(gate * 2 - 0.4, 0.06, 0.12, C.woodD, 0, 0.32, half + 0.9 + i * 0.9);
      for (const sx of [-1, 1]) {
        mb.box(0.3, 0.8, 0.3, colD, sx * (gate - 0.3), 0.12, half + 5.7);
        mb.add(new THREE.BoxGeometry(0.07, 0.07, 5.6), C.metalD, sx * (gate - 0.4), wallH * 0.5 + 0.4, half + 3.2, 0.52, 0, 0);
      }
    }
    if (st === 9) {
      for (const [x, z] of corners) mb.cone(0.5, 3.4, C.gold, x, wallH + 2.3 + 0.42 + 3.2, z, 8);
      mb.cone(0.5, 2.2, C.gold, 0, wallH + 2.0, half, 8).sph(0.3, C.red, 0, wallH + 4.3, half, 1, 1, 1, 6);
    }
    if (st >= 5) {
      const out = half + 4.7;
      const shore = new THREE.Mesh(new THREE.PlaneGeometry(out * 2 + 1.4, out * 2 + 1.4), flatToon(0xd8c79c));
      shore.rotation.x = -Math.PI / 2;
      shore.position.y = 0.006;
      shore.receiveShadow = true;
      const water = new THREE.Mesh(new THREE.PlaneGeometry(out * 2, out * 2), new THREE.MeshToonMaterial({ color: st >= 7 ? 0x6fe0ff : C.water }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.009;
      water.receiveShadow = true;
      g.add(shore, water);
    }
  }
  g.add(mesh(mb.build(1), true, 0.05));
  addGlows(g, glows);
  return g;
}

/**
 * The land in front of the gate. It starts as empty meadow and fills in as the realm grows:
 * fields, cottages, lamps and a windmill, a hamlet, watchtowers, statues, obelisks, a triumphal arch, a golden globe.
 * userData.blockers lists [x, z, radius] circles the King should walk around.
 */
export function outskirts(stage: number, wall: number, team: number): THREE.Group {
  const g = new THREE.Group();
  const st = Math.max(0, Math.min(9, stage));
  const mb = new MB(80 + st);
  const glows: [number, number, number, number, number][] = [];
  const blockers: [number, number, number][] = [];
  const z0 = wall + (st >= 5 ? 3 : 0);
  const scratch: Built = { geo: null as unknown as THREE.BufferGeometry, fit: 1, h: 0 };
  const field = (x: number, z: number, w: number, d: number, kind: number) => {
    mb.box(w, 0.1, d, C.soil, x, 0, z);
    const rows = Math.floor(w / 0.9);
    for (let r = 0; r < rows; r++) mb.box(0.5, 0.28, d - 0.6, [C.leafL, C.straw, C.leaf, C.strawD][(r + kind) % 4], x - w / 2 + 0.5 + r * 0.9, 0.1, z);
    const fx = x + (x < 0 ? w / 2 + 0.35 : -w / 2 - 0.35);
    for (let k = 0; k <= Math.floor(d / 1.6); k++) mb.box(0.1, 0.62, 0.1, C.woodD, fx, 0, z - d / 2 + k * 1.6);
    mb.box(0.06, 0.07, d, C.wood, fx, 0.46, z).box(0.06, 0.07, d, C.wood, fx, 0.26, z);
    mb.log(0.34, 0.7, C.straw, x + (x < 0 ? -1 : 1) * (w / 2 - 0.9), 0.44, z + d / 2 + 0.8, 0.5);
  };
  const cottage = (x: number, z: number, ry: number, s: number, roofCol: number) => {
    mb.push(x, 0, z, ry, 0.82);
    house(mb, s, roofCol, scratch);
    mb.pop();
    blockers.push([x, z, 2.5]);
  };
  if (st >= 1) {
    field(-15, z0 + 13, 9, 7, 0);
    field(14, z0 + 12, 8, 6, 1);
    mb.cyl(0.04, 0.04, 1.2, C.woodD, -9.4, 0, z0 + 16, 5).box(0.9, 0.07, 0.07, C.woodD, -9.4, 0.8, z0 + 16).sph(0.18, C.straw, -9.4, 1.22, z0 + 16, 1, 1, 1, 6).cone(0.2, 0.22, C.woodD, -9.4, 1.36, z0 + 16, 6);
  }
  if (st >= 2) {
    cottage(-7.6, z0 + 10, Math.PI / 2, 0, C.roofR);
    cottage(7.6, z0 + 19.5, -Math.PI / 2, 0, C.roofR);
    field(-16, z0 + 25, 8, 6, 2);
    field(17, z0 + 24, 9, 7, 3);
    // Well and signpost.
    mb.cyl(0.7, 0.8, 0.6, C.stone, 5.4, 0, z0 + 27, 10).cyl(0.52, 0.52, 0.05, C.water, 5.4, 0.58, z0 + 27, 10);
    mb.box(0.1, 1.5, 0.1, C.woodD, 4.75, 0.5, z0 + 27).box(0.1, 1.5, 0.1, C.woodD, 6.05, 0.5, z0 + 27).gable(1.7, 1.2, 0.5, C.roofR, 5.4, 2.0, z0 + 27);
    blockers.push([5.4, z0 + 27, 1.1]);
    mb.box(0.12, 1.7, 0.12, C.woodD, 3.5, 0, z0 + 6.4).box(1.0, 0.3, 0.06, C.plank, 3.8, 1.25, z0 + 6.4, 0.2).box(0.9, 0.3, 0.06, C.woodL, 3.2, 0.85, z0 + 6.4, -0.25);
  }
  if (st >= 3) {
    cottage(-7.6, z0 + 20.5, Math.PI / 2, 1, C.roofB);
    for (let k = 0; k < 4; k++) {
      const x = k % 2 ? 3.4 : -3.4, z = z0 + 9 + k * 8;
      lamp(mb, x, z, 2.0);
      glows.push([x, 2.26, z, 0xffd27a, 1.8]);
    }
    for (let k = 0; k < 22; k++) for (const sx of [-1, 1]) mb.box(0.3, 0.14, 0.6, k % 2 ? C.stone : C.stoneD, sx * 2.75, 0, z0 + 1 + k * 2);
    // Windmill on the far side of the fields.
    mb.cyl(1.1, 1.6, 4.6, C.cream, 25, 0, z0 + 33, 8).cyl(1.65, 1.7, 0.4, C.stone, 25, 0, z0 + 33, 8);
    coneRoof(mb, 1.4, 1.5, C.roofR, 25, 4.6, z0 + 33);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + 0.5;
      mb.add(new THREE.BoxGeometry(0.16, 3.4, 0.1), C.woodD, 25 + Math.sin(a) * 1.7, 4.2 + Math.cos(a) * 1.7, z0 + 34.7, 0, 0, -a);
      mb.add(new THREE.BoxGeometry(0.8, 2.6, 0.05), C.cloth, 25 + Math.sin(a) * 2.0 + Math.cos(a) * 0.45, 4.2 + Math.cos(a) * 2.0 - Math.sin(a) * 0.45, z0 + 34.74, 0, 0, -a);
    }
    blockers.push([25, z0 + 33, 2.2]);
  }
  if (st >= 4) {
    cottage(7.8, z0 + 30, -Math.PI / 2, 1, C.roofB);
    cottage(-7.8, z0 + 31, Math.PI / 2, 1, C.roofR);
    cottage(24, z0 + 11, -Math.PI / 2, 0, C.roofR);
    cottage(-25, z0 + 12, Math.PI / 2, 1, C.roofG);
    // A roadside stall.
    mb.box(1.8, 0.62, 0.95, C.wood, 6.2, 0, z0 + 37.5);
    for (const [px, pz] of [[-0.85, -0.42], [0.85, -0.42], [-0.85, 0.42], [0.85, 0.42]]) mb.box(0.08, 1.8, 0.08, C.woodD, 6.2 + px, 0, z0 + 37.5 + pz);
    for (let k = 0; k < 6; k++) mb.box(0.33, 0.08, 1.4, k % 2 ? C.white : C.roofG, 6.2 - 0.82 + k * 0.33, 1.78, z0 + 37.5, 0, 0.26);
    mb.sph(0.15, C.orange, 5.8, 0.78, z0 + 37.5).sph(0.15, C.red, 6.2, 0.78, z0 + 37.5).sph(0.15, C.gold, 6.6, 0.78, z0 + 37.5);
    blockers.push([6.2, z0 + 37.5, 1.3]);
  }
  if (st >= 5) {
    for (const sx of [-1, 1]) {
      tower(mb, sx * 27, z0 + 40, 1.3, 5.2, C.stoneL, C.roofB, team);
      blockers.push([sx * 27, z0 + 40, 1.7]);
      for (const dz of [13, 29]) flagPole(mb, sx * 3.5, 0, z0 + dz, 3.4, team);
    }
  }
  if (st >= 6) {
    for (const sx of [-1, 1]) {
      mb.cyl(1.0, 1.15, 0.3, C.stoneD, sx * 4.9, 0, z0 + 5, 8).box(1.5, 1.3, 1.5, 0xf2ede4, sx * 4.9, 0.3, z0 + 5).box(1.75, 0.2, 1.75, C.gold, sx * 4.9, 1.6, z0 + 5);
      goldFigure(mb, sx * 4.9, 1.8, z0 + 5, 1.25);
      blockers.push([sx * 4.9, z0 + 5, 1.2]);
    }
  }
  if (st >= 7) {
    for (const sx of [-1, 1]) {
      const x = sx * 12, z = z0 + 43;
      mb.box(2.2, 0.4, 2.2, C.stoneD, x, 0, z).add(new THREE.CylinderGeometry(0.5, 0.9, 5.2, 4), 0xf2ede4, x, 3.0, z, 0, Math.PI / 4, 0);
      mb.gem(0.5, 1.6, C.mana, x, 5.5, z);
      glows.push([x, 6.3, z, 0x8fe9ff, 4.2]);
      blockers.push([x, z, 1.4]);
    }
    crystals(mb, -20, z0 + 20, 1.2); crystals(mb, 22, z0 + 19, 1.0, C.purple);
  }
  if (st >= 8) {
    // Triumphal arch over the road.
    const z = z0 + 39;
    for (const sx of [-1, 1]) {
      mb.box(2.0, 6.4, 2.0, 0xf7efd9, sx * 4.2, 0, z).box(2.3, 0.5, 2.3, C.gold, sx * 4.2, 0, z).box(2.3, 0.3, 2.3, C.gold, sx * 4.2, 6.2, z);
      blockers.push([sx * 4.2, z, 1.5]);
      goldFigure(mb, sx * 4.2, 8.4, z, 1.1);
    }
    mb.box(10.6, 1.9, 2.2, 0xf7efd9, 0, 6.5, z).box(11, 0.3, 2.5, C.gold, 0, 8.4, z).box(2.6, 1.3, 0.1, team, 0, 6.8, z + 1.12);
    mb.arch(2.2, 2.0, 0xe9dfc4, 0, 4.3, z);
  }
  if (st >= 9) {
    // The world, in gold, on a plinth.
    const x = -21, z = z0 + 37;
    mb.cyl(2.6, 3.0, 0.5, C.stoneD, x, 0, z, 12).cyl(1.6, 2.0, 1.6, 0xf7efd9, x, 0.5, z, 10).cyl(1.9, 1.9, 0.2, C.gold, x, 2.1, z, 10);
    mb.sph(2.0, C.gold, x, 4.6, z, 1, 1, 1, 12).add(new THREE.TorusGeometry(2.5, 0.12, 6, 24), C.goldD, x, 4.6, z, Math.PI / 2 - 0.4, 0, 0);
    mb.sph(0.5, C.leaf, x + 1.2, 5.4, z + 1.3, 1.4, 1, 0.5, 6).sph(0.6, C.leaf, x - 0.9, 4.2, z + 1.7, 1.2, 1.3, 0.4, 6);
    goldFigure(mb, x, 6.5, z, 1.0);
    glows.push([x, 4.8, z, 0xffe27a, 8]);
    blockers.push([x, z, 3]);
  }
  g.add(mesh(mb.build(1), true, 0.05));
  addGlows(g, glows);
  g.userData.blockers = blockers;
  return g;
}
