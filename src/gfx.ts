// Shared renderer, world dressing (sky, mountains, floating islands), particles and input helpers.
import * as THREE from 'three';
import { C, artOpts, cloud, flatToon, island, mountains } from './models';

export class Gfx {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  w = 1;
  h = 1;
  lowPower: boolean;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.lowPower = Math.min(window.innerWidth, window.innerHeight) < 520 || (navigator.hardwareConcurrency || 4) <= 4;
    artOpts.outline = true;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.resize();
  }

  /** Returns true when the drawing size changed. */
  resize(): boolean {
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    if (w === this.w && h === this.h) return false;
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lowPower ? 1.5 : 2));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    return true;
  }

  /** Renders small portraits of models on a throwaway transparent renderer. */
  thumbs(items: { key: string; obj: THREE.Object3D; yaw?: number }[], size = 176): Record<string, string> {
    const out: Record<string, string> = {};
    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    } catch {
      return out;
    }
    r.setSize(size, size, false);
    r.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c9a0, 1.5));
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.1);
    sun.position.set(4, 8, 6);
    scene.add(sun);
    const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
    const box = new THREE.Box3();
    const sphere = new THREE.Sphere();
    for (const it of items) {
      scene.add(it.obj);
      it.obj.rotation.y = it.yaw === undefined ? -0.6 : it.yaw;
      it.obj.updateMatrixWorld(true);
      // Glow halos would inflate the bounds, so measure meshes only.
      box.makeEmpty();
      it.obj.traverse(o => { if ((o as THREE.Mesh).isMesh && !o.userData.outline) box.expandByObject(o); });
      box.getBoundingSphere(sphere);
      const d = (sphere.radius / Math.sin((cam.fov * Math.PI) / 360)) * 0.9;
      cam.position.set(sphere.center.x, sphere.center.y + d * 0.42, sphere.center.z + d * 0.9);
      cam.lookAt(sphere.center);
      r.render(scene, cam);
      out[it.key] = r.domElement.toDataURL('image/png');
      scene.remove(it.obj);
    }
    r.dispose();
    r.forceContextLoss();
    return out;
  }
}

let skyTex: THREE.CanvasTexture | null = null;
function sky(): THREE.CanvasTexture {
  if (!skyTex) {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d')!;
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#2b7fe6');
    grad.addColorStop(0.42, '#6cc4ff');
    grad.addColorStop(0.62, '#bfe6ff');
    grad.addColorStop(0.78, '#ffe9cf');
    grad.addColorStop(1, '#ffd9b0');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    skyTex = new THREE.CanvasTexture(c);
    skyTex.colorSpace = THREE.SRGBColorSpace;
  }
  return skyTex;
}

let grassTex: THREE.CanvasTexture | null = null;
/** Painterly grass: soft blotches plus little blade strokes, tiled across the lawn. */
export function grassTexture(): THREE.CanvasTexture {
  if (!grassTex) {
    const S = 256;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, S, S);
    let seed = 7;
    const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 46; i++) {
      const x = r() * S, y = r() * S, rad = 14 + r() * 30;
      const dark = r() < 0.55;
      // Draw wrapped copies so the tile has no seams.
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        grad.addColorStop(0, dark ? 'rgba(150,190,150,0.5)' : 'rgba(255,255,220,0.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    g.lineCap = 'round';
    for (let i = 0; i < 520; i++) {
      const x = r() * S, y = r() * S;
      g.strokeStyle = r() < 0.5 ? 'rgba(120,170,120,0.55)' : 'rgba(240,255,200,0.6)';
      g.lineWidth = 1 + r();
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 4);
      g.stroke();
    }
    grassTex = new THREE.CanvasTexture(c);
    grassTex.colorSpace = THREE.SRGBColorSpace;
    grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
    grassTex.anisotropy = 4;
  }
  return grassTex;
}

export interface Stage {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  clouds: THREE.Mesh[];
  islands: THREE.Mesh[];
}

/** Sky, haze, sun, endless lawn, hills, snowy peaks and floating islands. `extent` is half the width the shadow map must cover. */
export function makeStage(gfx: Gfx, extent: number, grass: number = C.grass): Stage {
  const scene = new THREE.Scene();
  scene.background = sky();
  scene.fog = new THREE.Fog(0xf3ecdf, extent * 2.4, extent * 7.5);

  scene.add(new THREE.HemisphereLight(0xf2f6ff, 0x9fcf7a, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0cf, 2.15);
  sun.position.set(extent * 0.6, extent * 1.3, extent * 0.5);
  sun.castShadow = true;
  const size = gfx.lowPower ? 1024 : 2048;
  sun.shadow.mapSize.set(size, size);
  const cam = sun.shadow.camera;
  cam.left = -extent; cam.right = extent; cam.top = extent; cam.bottom = -extent;
  cam.near = 1; cam.far = extent * 4;
  cam.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);

  const tex = grassTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(extent * 0.9, extent * 0.9);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(extent * 9, 48), flatToon(grass, tex));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const hillMat = flatToon(0x6fc457);
  const hillMat2 = flatToon(0x8ad66b);
  const hillMat3 = flatToon(0x9a8fd0);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + (i % 2) * 0.2;
    const d = extent * (3.2 + (i % 3) * 0.9);
    const r = extent * (0.9 + ((i * 7) % 5) * 0.22);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), i % 5 === 4 ? hillMat3 : i % 2 ? hillMat : hillMat2);
    hill.scale.y = 0.32 + ((i * 3) % 4) * 0.06;
    hill.position.set(Math.sin(a) * d, -0.5, Math.cos(a) * d);
    scene.add(hill);
  }
  const peaks = mountains(31, extent * 6.4, 22);
  (peaks.material as THREE.Material) = new THREE.MeshToonMaterial({ vertexColors: true, fog: false });
  scene.add(peaks);

  const islands: THREE.Mesh[] = [];
  const spots: [number, number, number, number][] = [[-1.5, 1.05, -2.3, 1.5], [1.9, 1.3, -1.9, 1.1], [0.2, 1.6, -3.1, 1.9]];
  spots.forEach((p, i) => {
    const isl = island(40 + i);
    isl.position.set(p[0] * extent, p[1] * extent, p[2] * extent);
    isl.scale.setScalar((extent / 22) * p[3]);
    isl.userData.baseY = isl.position.y;
    scene.add(isl);
    islands.push(isl);
  });

  const clouds: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const cl = cloud(i + 3);
    const a = (i / 8) * Math.PI * 2;
    cl.position.set(Math.sin(a) * extent * 3, extent * (1.5 + (i % 3) * 0.3), Math.cos(a) * extent * 3);
    cl.scale.setScalar(extent / 14);
    scene.add(cl);
    clouds.push(cl);
  }
  return { scene, sun, clouds, islands };
}

export function driftClouds(stage: Stage, dt: number, extent: number, t = 0): void {
  for (const c of stage.clouds) {
    c.position.x += dt * extent * 0.02;
    if (c.position.x > extent * 4) c.position.x = -extent * 4;
  }
  stage.islands.forEach((isl, i) => {
    isl.position.y = (isl.userData.baseY as number) + Math.sin(t * 0.4 + i * 2) * extent * 0.02;
    isl.rotation.y += dt * 0.02;
  });
}

/** Shared waddle / lunge animation for the little people. */
export function animateUnit(m: THREE.Object3D, t: number, moving: boolean, atkT: number, phase: number): void {
  const base = (m.userData.baseScale as number) || 1;
  if (moving) {
    m.rotation.z = Math.sin(t * 13 + phase) * 0.14;
    m.scale.set(base, base * (1 + Math.sin(t * 26 + phase) * 0.05), base);
  } else {
    m.rotation.z *= 0.8;
    m.scale.set(base, base * (1 + Math.sin(t * 3 + phase) * 0.025), base);
  }
  if (atkT < 0.28) {
    const k = Math.sin((atkT / 0.28) * Math.PI);
    m.rotation.x = k * 0.45;
    m.scale.y = base * (1 - k * 0.12);
  } else {
    m.rotation.x = 0;
  }
}

interface Particle {
  x: number; y: number; z: number; vx: number; vy: number; vz: number;
  life: number; max: number; size: number; color: number; grav: number; smoke: boolean;
}

/** Cheap instanced particle bursts: sparkles, wood chips, coins and chimney smoke. */
export class Particles {
  mesh: THREE.InstancedMesh;
  private parts: Particle[] = [];
  private max: number;
  private m4 = new THREE.Matrix4();
  private v3 = new THREE.Vector3();
  private s3 = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private col = new THREE.Color();

  constructor(scene: THREE.Scene, max = 320) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ fog: false }), max);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.col.set(0xffffff));
    scene.add(this.mesh);
  }
  puff(x: number, y: number, z: number, n: number, color: number, speed: number, size: number, life = 0.6, grav = 0): void {
    for (let i = 0; i < n && this.parts.length < this.max; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({
        x, y, z, vx: Math.sin(a) * speed * (0.4 + Math.random()), vy: speed * (0.3 + Math.random()), vz: Math.cos(a) * speed * (0.4 + Math.random()),
        life, max: life, size: size * (0.6 + Math.random() * 0.8), color, grav, smoke: false,
      });
    }
  }
  /** A slow puff that swells and drifts (chimney smoke, magic motes). */
  waft(x: number, y: number, z: number, color: number, size: number, life: number, rise = 0.9): void {
    if (this.parts.length >= this.max) return;
    this.parts.push({
      x, y, z, vx: (Math.random() - 0.5) * 0.35 + 0.25, vy: rise * (0.7 + Math.random() * 0.6), vz: (Math.random() - 0.5) * 0.35,
      life, max: life, size, color, grav: 0, smoke: true,
    });
  }
  update(dt: number): void {
    let k = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (!p.smoke) { p.vx *= 1 - dt * 2; p.vz *= 1 - dt * 2; }
      if (p.y < 0.08) { p.y = 0.08; p.vy = Math.abs(p.vy) * 0.35; }
      const f = p.life / p.max;
      const s = p.smoke ? p.size * Math.sin(Math.min(1, 1.15 - f) * Math.PI) * (1.6 - f) : p.size * f * 2;
      this.m4.compose(this.v3.set(p.x, p.y, p.z), this.q, this.s3.set(s, s, s));
      this.mesh.setMatrixAt(k, this.m4);
      this.mesh.setColorAt(k++, this.col.set(p.color));
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/** Pointer helper: turns mouse / touch into tap, drag, pinch and wheel callbacks. */
export class Pointer {
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number }>();
  private moved = false;
  private pinch = 0;
  private off: (() => void)[] = [];
  onTap: (x: number, y: number) => void = () => {};
  onDrag: (dx: number, dy: number, x: number, y: number) => void = () => {};
  onZoom: (factor: number) => void = () => {};
  /** Fires with down = true on press and down = false when the press moves, lifts or becomes a pinch. */
  onHold: (x: number, y: number, down: boolean) => void = () => {};
  /** Fires when the last finger or the mouse button lifts. */
  onUp: () => void = () => {};

  constructor(el: HTMLElement) {
    const add = <K extends keyof HTMLElementEventMap>(type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      el.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    add('pointerdown', e => {
      try { el.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      this.pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
      if (this.pts.size === 1) { this.moved = false; this.onHold(e.clientX, e.clientY, true); }
      else { this.moved = true; this.pinch = this.spread(); this.onHold(0, 0, false); }
    });
    add('pointermove', e => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pts.size >= 2) {
        const s = this.spread();
        if (this.pinch > 0 && s > 0) this.onZoom(this.pinch / s);
        this.pinch = s;
        return;
      }
      if (!this.moved && Math.hypot(p.x - p.sx, p.y - p.sy) > 9) { this.moved = true; this.onHold(0, 0, false); }
      if (this.moved) this.onDrag(dx, dy, p.x, p.y);
    });
    const up = (e: PointerEvent) => {
      const p = this.pts.get(e.pointerId);
      if (!p) return;
      this.pts.delete(e.pointerId);
      this.onHold(0, 0, false);
      if (this.pts.size === 0) this.onUp();
      if (!this.moved && this.pts.size === 0 && e.type === 'pointerup') this.onTap(p.x, p.y);
    };
    add('pointerup', up);
    add('pointercancel', up);
    add('wheel', e => { e.preventDefault(); this.onZoom(e.deltaY > 0 ? 1.1 : 0.9); }, { passive: false });
    add('contextmenu', e => e.preventDefault());
  }
  private spread(): number {
    const a = Array.from(this.pts.values());
    return a.length < 2 ? 0 : Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  }
  dispose(): void {
    for (const f of this.off) f();
    this.off = [];
  }
}
