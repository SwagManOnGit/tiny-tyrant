// Conquest map: an SVG "zoom level" per tier. Your realm sits in the middle, the three rivals of the tier surround it.
import { EARTH_AREA, FINAL_ID, TERRITORIES, TIERS, fmt, fmtArea, rng } from './data';
import type { Game } from './state';

const RIVAL = ['#f4907a', '#f6c453', '#c79be8'];
const RIVAL_D = ['#b24a36', '#a8791a', '#7d4fa6'];

function blob(r: () => number, cx: number, cy: number, rad: number, wobble: number, n = 28): string {
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = rad + (r() - 0.5) * 2 * wobble;
    pts.push(`${(cx + Math.sin(a) * rr).toFixed(1)},${(cy - Math.cos(a) * rr).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

function sector(r: () => number, cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const pts: string[] = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const rr = r1 + (r() - 0.5) * 26;
    pts.push(`${(cx + Math.sin(a) * rr).toFixed(1)},${(cy - Math.cos(a) * rr).toFixed(1)}`);
  }
  for (let i = steps; i >= 0; i--) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const rr = r0 + (r() - 0.5) * 8;
    pts.push(`${(cx + Math.sin(a) * rr).toFixed(1)},${(cy - Math.cos(a) * rr).toFixed(1)}`);
  }
  return 'M' + pts.join('L') + 'Z';
}

function lines(name: string): string[] {
  const words = name.split(' ');
  if (words.length < 3 && name.length < 14) return [name];
  let best = 1, diff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(' ').length - words.slice(i).join(' ').length);
    if (d < diff) { diff = d; best = i; }
  }
  return [words.slice(0, best).join(' '), words.slice(best).join(' ')];
}

const stars = (n: number, x: number, y: number) => {
  let s = '';
  for (let i = 0; i < 3; i++) {
    s += `<path transform="translate(${x - 26 + i * 26},${y}) scale(0.95)" d="M0-11l3.200 6.600 7.300 1-5.300 5.100 1.300 7.200L0 5.400l-6.500 3.500 1.300-7.200-5.300-5.100 7.300-1z" fill="${i < n ? '#ffc83d' : '#ffffff55'}" stroke="#7a5a2a" stroke-width="1.500"/>`;
  }
  return s;
};

/** SVG for one tier (0-8), or the globe for the final battle (9). */
export function mapSvg(game: Game, tier: number, labels: (id: number) => string): string {
  const s = game.s;
  const defs = `<defs>
    <radialGradient id="sea" cx="50%" cy="45%" r="70%"><stop offset="0" stop-color="#bfe9ff"/><stop offset="1" stop-color="#7cc8f2"/></radialGradient>
    <pattern id="waves" width="46" height="24" patternUnits="userSpaceOnUse"><path d="M2 14c6-7 12-7 18 0s12 7 18 0" fill="none" stroke="#ffffff66" stroke-width="2.500" stroke-linecap="round"/></pattern>
  </defs>`;
  if (tier >= 9) {
    const won = s.conquered[FINAL_ID];
    const r = rng(77);
    const lands = [blob(r, 220, 230, 78, 22, 18), blob(r, 360, 210, 92, 26, 20), blob(r, 300, 380, 70, 20, 16), blob(r, 430, 370, 46, 14, 14), blob(r, 190, 370, 36, 12, 12)];
    return `<svg class="map-svg" style="background:#2b2f55" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">${defs}
      <rect width="600" height="600" fill="#2b2f55"/>
      ${Array.from({ length: 40 }, (_, i) => `<circle cx="${(r() * 600).toFixed(0)}" cy="${(r() * 600).toFixed(0)}" r="${i % 5 ? 1.500 : 2.600}" fill="#fff" opacity="${(0.4 + r() * 0.6).toFixed(2)}"/>`).join('')}
      <clipPath id="globe"><circle cx="300" cy="300" r="215"/></clipPath>
      <circle cx="300" cy="300" r="215" fill="url(#sea)" stroke="#1e3f8a" stroke-width="6"/>
      <g clip-path="url(#globe)"><rect width="600" height="600" fill="url(#waves)"/>
        ${lands.map(d => `<path d="${d}" fill="${won ? '#6aa8ff' : '#9a7bd6'}" stroke="${won ? '#1e3f8a' : '#4d3a80'}" stroke-width="4" stroke-linejoin="round"/>`).join('')}
        <ellipse cx="240" cy="200" rx="150" ry="110" fill="#ffffff22"/>
      </g>
      ${won
        ? `<path transform="translate(300,62) scale(4.200)" d="M-9-3l4.500 4L0-6l4.500 7L9-3 7 7H-7z" fill="#ffc83d" stroke="#8a5a00" stroke-width="1.200" stroke-linejoin="round"/>
           <text class="map-big" x="300" y="560" text-anchor="middle">EARTH IS YOURS</text>`
        : `<g class="map-terr avail" data-terr="${FINAL_ID}" tabindex="0" role="button">
             <circle cx="300" cy="300" r="215" fill="#ffffff01"/>
             <g class="map-pulse"><circle cx="300" cy="300" r="62" fill="#e24a4a" stroke="#7a1f1f" stroke-width="5"/>
             <path transform="translate(300,300) scale(3.400)" d="M-7-9v18M-6-8h12l-3 4 3 4H-6z" fill="#fff" stroke="#fff" stroke-width="1.500" stroke-linejoin="round" stroke-linecap="round"/></g>
             <text class="map-name" x="300" y="408" text-anchor="middle">The United Earth</text>
             <text class="map-name" x="300" y="432" text-anchor="middle">Rebellion</text>
             <text class="map-sub" x="300" y="455" text-anchor="middle">${labels(FINAL_ID)}</text>
           </g>
           <text class="map-big" x="300" y="560" text-anchor="middle">THE FINAL BATTLE</text>`}
    </svg>`;
  }

  const r = rng(500 + tier * 31);
  const cx = 300, cy = 300, R0 = 92, R1 = 262;
  const ids = [tier * 3, tier * 3 + 1, tier * 3 + 2];
  let body = '';
  ids.forEach((id, k) => {
    const t = TERRITORIES[id];
    const a0 = (k * 2 * Math.PI) / 3 + 0.05;
    const a1 = ((k + 1) * 2 * Math.PI) / 3 - 0.05;
    const mid = (a0 + a1) / 2;
    const done = s.conquered[id];
    const avail = game.canAttack(id);
    const lx = cx + Math.sin(mid) * 180;
    const ly = cy - Math.cos(mid) * 180;
    const nm = lines(t.name);
    body += `<g class="map-terr ${done ? 'done' : avail ? 'avail' : 'locked'}" data-terr="${id}" tabindex="0" role="button">
      <path d="${sector(r, cx, cy, R0 + 12, R1, a0, a1)}" fill="${done ? '#8fbcff' : RIVAL[k]}" stroke="${done ? '#1e3f8a' : RIVAL_D[k]}" stroke-width="5" stroke-linejoin="round"/>
      ${nm.map((l, i) => `<text class="map-name" x="${lx.toFixed(0)}" y="${(ly - 14 + i * 21 - (nm.length - 1) * 10).toFixed(0)}" text-anchor="middle">${l}</text>`).join('')}
      <text class="map-sub" x="${lx.toFixed(0)}" y="${(ly + 14 + (nm.length - 1) * 10).toFixed(0)}" text-anchor="middle">${fmtArea(t.area)}</text>
      ${done ? stars(s.stars[id], lx, ly + 40 + (nm.length - 1) * 10)
        : `<text class="map-tag" x="${lx.toFixed(0)}" y="${(ly + 36 + (nm.length - 1) * 10).toFixed(0)}" text-anchor="middle">${labels(id)}</text>`}
    </g>`;
  });
  const own = game.area();
  const before = tier === 0 ? 'Your Village' : 'Your Realm';
  return `<svg class="map-svg" viewBox="0 0 600 600" xmlns="http://www.w3.org/2000/svg">${defs}
    <rect width="600" height="600" fill="url(#sea)"/><rect width="600" height="600" fill="url(#waves)"/>
    <path d="${blob(r, cx, cy, R1 + 26, 10, 40)}" fill="#e9d9a6" stroke="#b79a5a" stroke-width="4"/>
    ${body}
    <path d="${blob(r, cx, cy, R0, 7, 24)}" fill="#4f8df7" stroke="#1e3f8a" stroke-width="5" stroke-linejoin="round"/>
    <path transform="translate(300,270) scale(2.400)" d="M-9-3l4.500 4L0-6l4.500 7L9-3 7 7H-7z" fill="#ffc83d" stroke="#8a5a00" stroke-width="1.300" stroke-linejoin="round"/>
    <text class="map-name light" x="300" y="312" text-anchor="middle">${before}</text>
    <text class="map-sub light" x="300" y="332" text-anchor="middle">${fmtArea(Math.min(own, tierAreaBefore(tier)))}</text>
    <text class="map-foot" x="300" y="590" text-anchor="middle">${TIERS[tier].name} · each about ${fmtArea(TIERS[tier].area)}</text>
  </svg>`;
}

/** Land the player held when this tier opened. */
function tierAreaBefore(tier: number): number {
  let a = 0.004;
  for (const t of TERRITORIES) if (t.tier < tier) a += t.area;
  return a;
}

export function earthPercent(area: number): string {
  const p = (area / EARTH_AREA) * 100;
  if (p >= 99.999) return '100%';
  if (p >= 1) return p.toFixed(1) + '%';
  if (p >= 0.001) return p.toFixed(4) + '%';
  // Tiny shares read better as a fraction than as a wall of zeros.
  return '1/' + fmt(EARTH_AREA / area);
}
