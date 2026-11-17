// Economy, population, magic and progression. Pure logic: no DOM, no three.js.
import {
  BType, BUILDINGS, BTYPES, BOOST_MAX, BOOST_SECONDS, BUFFER_MINUTES, BUY_MARKUP, CRIT_CHANCE, CRIT_MULT, Cost,
  DECOR_JOY_CAP, EARTH_AREA, ENCH_MAX, EnchId, FINAL_ID, FOOD_PER_CITIZEN, FOOD_PER_HOUSING, GOBLIN_EVERY,
  GOBLIN_STAY, GOBLIN_TAPS, GRID, HOME_AREA, JOB_ORDER, KEEP_TILE, MAX_KEEP, OBSTACLES, OBSTACLE_EVERY, OBSTACLE_MAX,
  OFFLINE_MAX, QUESTS, RES, Res, SELL_RATE, SPELLS, SpellId, TAXES, TERRITORIES, TROOPS, TROOP_MAX_LEVEL, TType, TTYPES,
  baseStorage, buildCost, buildTime, builderCount, campCap, enchantCost, houseCap, isDecor, keepPop, loot, manaCap,
  manaPerMin, maxCount, obstacleReward, prodPerMin, researchCost, rng, sizeOf, spellCost, storehouseCap, tapMana,
  tavernJoy, taxPerCitizen, trainSpeed, tribute, troopCost, workerSlots,
} from './data';

export interface Building {
  id: number;
  type: BType;
  gx: number;        // first tile of the footprint
  gz: number;
  level: number;     // 0 while the first construction is running
  buf: number;       // produced goods waiting to be collected
  want: number;      // workers the player wants here (-1 = as many as possible)
  busy: number;      // construction seconds left
  busyTotal: number;
}

export interface Obstacle { id: number; kind: number; gx: number; gz: number; hp: number }

export interface SaveData {
  v: 2;
  res: Record<Res, number>;
  pop: number;
  tax: number;
  buildings: Building[];
  nextId: number;
  keepBuf: Record<Res, number>;
  army: Record<TType, number>;
  queue: { t: TType; left: number }[];
  troopLv: Record<TType, number>;
  conquered: boolean[];
  stars: number[];
  boost: number;
  quest: number;
  merchantIn: number;
  merchantHere: number;
  lastSeen: number;
  mana: number;
  ench: Record<EnchId, number>;
  obstacles: Obstacle[];
  obIn: number;
  goblinIn: number;
  deeds: Record<string, number>;
  /** Guided tour progress (-1 = finished) and one-time tips already shown. */
  tut: number;
  tips: Record<string, number>;
  flags: { collected: boolean; researched: boolean; won: boolean; intro: boolean };
  stats: {
    won: number; lost: number; trained: Record<TType, number>; play: number; ads: number;
    built: number; cleared: number; goblins: number; spells: number; taps: number; collected: number; enchants: number;
  };
}

export type GameEvent =
  | { t: 'built'; b: Building; first: boolean }
  | { t: 'collect'; b: Building; got: Cost }
  | { t: 'full'; b: Building }
  | { t: 'trained'; troop: TType }
  | { t: 'quest'; text: string; reward: Cost }
  | { t: 'merchant' }
  | { t: 'starving' }
  | { t: 'goblin'; on: boolean; caught: boolean }
  | { t: 'deed'; name: string };

const zeroRes = (): Record<Res, number> => ({ gold: 0, food: 0, wood: 0, stone: 0 });
const zeroTroops = (): Record<TType, number> => ({ peasant: 0, archer: 0, knight: 0, rider: 0, mage: 0, catapult: 0 });
const zeroEnch = (): Record<EnchId, number> => ({ harvest: 0, focus: 0, drums: 0, skin: 0, haste: 0, vault: 0, charm: 0, midas: 0 });

function seedObstacles(): Obstacle[] {
  const r = rng(4242);
  const out: Obstacle[] = [];
  const used = new Set<number>();
  let id = 1;
  while (out.length < 24) {
    const gx = Math.floor(r() * GRID), gz = Math.floor(r() * GRID);
    // Leave the middle clear so the first buildings have room.
    if (gx >= 7 && gx <= 18 && gz >= 7 && gz <= 18) continue;
    if (used.has(gx * 100 + gz)) continue;
    used.add(gx * 100 + gz);
    const roll = r();
    const kind = roll < 0.3 ? 0 : roll < 0.55 ? 1 : roll < 0.8 ? 2 : roll < 0.94 ? 3 : 4;
    out.push({ id: id++, kind, gx, gz, hp: OBSTACLES[kind].hits });
  }
  return out;
}

export function freshSave(): SaveData {
  return {
    v: 2,
    res: { gold: 300, food: 250, wood: 260, stone: 80 },
    pop: 10,
    tax: 1,
    buildings: [{ id: 1, type: 'keep', gx: KEEP_TILE, gz: KEEP_TILE, level: 1, buf: 0, want: -1, busy: 0, busyTotal: 0 }],
    nextId: 100,
    keepBuf: zeroRes(),
    army: zeroTroops(),
    queue: [],
    troopLv: { peasant: 1, archer: 1, knight: 1, rider: 1, mage: 1, catapult: 1 },
    conquered: TERRITORIES.map(() => false),
    stars: TERRITORIES.map(() => 0),
    boost: 0,
    quest: 0,
    merchantIn: 75,
    merchantHere: 0,
    lastSeen: Date.now(),
    mana: 0,
    ench: zeroEnch(),
    obstacles: seedObstacles(),
    obIn: OBSTACLE_EVERY,
    goblinIn: 95,
    deeds: {},
    tut: 0,
    tips: {},
    flags: { collected: false, researched: false, won: false, intro: false },
    stats: { won: 0, lost: 0, trained: zeroTroops(), play: 0, ads: 0, built: 0, cleared: 0, goblins: 0, spells: 0, taps: 0, collected: 0, enchants: 0 },
  };
}

export interface BattleOutcome {
  terr: number;
  win: boolean;
  stars: number;
  lootFrac: number;
  lost: Record<TType, number>;
}

// ---------------------------------------------------------------- royal deeds (achievements)

interface DeedDef { id: string; name: string; desc: string; goals: number[]; val: (g: Game) => number }
export const DEEDS: DeedDef[] = [
  { id: 'builder', name: 'Master Builder', desc: 'Finish buildings', goals: [5, 12, 20, 30], val: g => g.s.stats.built },
  { id: 'keep', name: 'Home Improvement', desc: 'Raise your Keep to level', goals: [3, 5, 8, 10], val: g => g.keep },
  { id: 'conquer', name: 'Collector of Lands', desc: 'Conquer territories', goals: [3, 9, 18, 27, 28], val: g => g.conqueredCount() },
  { id: 'army', name: 'Drill Sergeant', desc: 'Train troops', goals: [10, 60, 250, 1000], val: g => TTYPES.reduce((n, t) => n + g.s.stats.trained[t], 0) },
  { id: 'tapper', name: 'Crystal Botherer', desc: 'Tap the Spire crystal', goals: [50, 500, 3000, 12000], val: g => g.s.stats.taps },
  { id: 'clear', name: 'Groundskeeper', desc: 'Clear trees, rocks and shrooms', goals: [5, 25, 80, 200], val: g => g.s.stats.cleared },
  { id: 'goblin', name: 'Goblin Wrangler', desc: 'Catch loot goblins', goals: [1, 5, 15, 40], val: g => g.s.stats.goblins },
  { id: 'mage', name: 'Battle Mage', desc: 'Cast spells in battle', goals: [1, 10, 40, 120], val: g => g.s.stats.spells },
  { id: 'ench', name: 'Enchanter', desc: 'Buy enchantment levels', goals: [3, 15, 40, 80], val: g => g.s.stats.enchants },
  { id: 'haul', name: 'Tax Day', desc: 'Collect from buildings', goals: [20, 200, 1000, 4000], val: g => g.s.stats.collected },
  { id: 'joy', name: 'Beloved Tyrant', desc: 'Reach happiness of', goals: [70, 85, 95], val: g => g.happiness().value },
  { id: 'pop', name: 'Standing Room Only', desc: 'Grow your population to', goals: [30, 150, 600, 1200], val: g => Math.floor(g.s.pop) },
];
export interface DeedView { id: string; name: string; desc: string; tier: number; tiers: number; goal: number; value: number; ready: boolean; done: boolean; reward: { gold: number; mana: number } }

export class Game {
  s: SaveData;
  onEvent: (e: GameEvent) => void = () => {};
  /** The loot goblin currently scampering about (never saved). */
  goblin: { left: number; hp: number } | null = null;
  private silent = false;
  private popFrac = 0;
  private staff = new Map<number, number>();
  private starveWarned = false;
  private rand = rng(Date.now() & 0xffff);
  /** Bumped whenever buildings or obstacles change, so views know to rebuild. */
  rev = 0;

  constructor(save?: SaveData | null) {
    this.s = save ? Game.migrate(save) : freshSave();
    this.fixLayout();
    this.computeStaff();
  }

  static migrate(raw: SaveData): SaveData {
    const f = freshSave();
    const s = { ...f, ...raw } as SaveData;
    s.v = 2;
    s.res = { ...f.res, ...raw.res };
    s.keepBuf = { ...f.keepBuf, ...raw.keepBuf };
    s.army = { ...f.army, ...raw.army };
    s.troopLv = { ...f.troopLv, ...raw.troopLv };
    s.ench = { ...f.ench, ...(raw.ench || {}) };
    s.deeds = { ...(raw.deeds || {}) };
    s.tips = { ...(raw.tips || {}) };
    if (typeof raw.tut !== 'number') s.tut = raw.flags && raw.flags.intro ? -1 : 0;
    s.flags = { ...f.flags, ...raw.flags };
    s.stats = { ...f.stats, ...raw.stats, trained: { ...f.stats.trained, ...(raw.stats ? raw.stats.trained : {}) } };
    s.conquered = TERRITORIES.map((_, i) => !!(raw.conquered && raw.conquered[i]));
    // Every conquest is a three-star conquest now (the keep's fall topples the whole town).
    s.stars = TERRITORIES.map((_, i) => (s.conquered[i] ? 3 : 0));
    if (!Array.isArray(s.buildings) || !s.buildings.some(b => b.type === 'keep')) s.buildings = f.buildings;
    if (!Array.isArray(s.queue)) s.queue = [];
    if (!Array.isArray(s.obstacles)) s.obstacles = f.obstacles;
    if (typeof s.mana !== 'number') s.mana = 0;
    if (s.nextId < 100) s.nextId = 100 + s.buildings.length + s.obstacles.length;
    return s;
  }

  /** Older saves placed buildings on numbered plots; give anything without tile coordinates a spot on the grid. */
  private fixLayout(): void {
    const loose = this.s.buildings.filter(b => typeof b.gx !== 'number' || typeof b.gz !== 'number');
    if (!loose.length) return;
    for (const b of loose) { b.gx = -99; b.gz = -99; delete (b as unknown as { plot?: number }).plot; }
    const keep = loose.find(b => b.type === 'keep');
    if (keep) { keep.gx = KEEP_TILE; keep.gz = KEEP_TILE; }
    this.s.obstacles = this.s.obstacles.filter(o => !(o.gx >= KEEP_TILE && o.gx < KEEP_TILE + 4 && o.gz >= KEEP_TILE && o.gz < KEEP_TILE + 4));
    for (const b of loose) {
      if (b.type === 'keep') continue;
      const spot = this.findSpot(sizeOf(b.type));
      if (spot) { b.gx = spot.gx; b.gz = spot.gz; }
    }
  }

  /** Wipes everything back to a brand new kingdom. */
  reset(): void {
    this.s = freshSave();
    this.popFrac = 0;
    this.procQuestFor = -2;
    this.starveWarned = false;
    this.goblin = null;
    this.rev++;
    this.computeStaff();
  }

  serialize(): string {
    this.s.lastSeen = Date.now();
    return JSON.stringify(this.s);
  }

  private emit(e: GameEvent): void {
    if (!this.silent) this.onEvent(e);
  }

  // ------------------------------------------------------------ lookups

  get keepB(): Building { return this.s.buildings.find(b => b.type === 'keep')!; }
  get keep(): number { return this.keepB.level; }
  byId(id: number): Building | undefined { return this.s.buildings.find(b => b.id === id); }
  ofType(t: BType): Building[] { return this.s.buildings.filter(b => b.type === t); }
  count(t: BType): number { return this.s.buildings.reduce((n, b) => n + (b.type === t ? 1 : 0), 0); }
  /** Highest finished level of a building type (0 when none is built). */
  levelOf(t: BType): number { return this.s.buildings.reduce((m, b) => (b.type === t ? Math.max(m, b.level) : m), 0); }
  buildersBusy(): number { return this.s.buildings.reduce((n, b) => n + (b.busy > 0 ? 1 : 0), 0); }
  buildersTotal(): number { return builderCount(this.keep); }
  ench(id: EnchId): number { return this.s.ench[id] || 0; }

  popCap(): number {
    let cap = keepPop(this.keep);
    for (const b of this.s.buildings) if (b.type === 'house' && b.level > 0) cap += houseCap(b.level);
    return cap;
  }
  cap(): number {
    let cap = baseStorage(this.keep);
    for (const b of this.s.buildings) if (b.type === 'storehouse' && b.level > 0) cap += storehouseCap(b.level);
    return Math.round(cap * (1 + 0.1 * this.ench('vault')));
  }
  armyCap(): number {
    let cap = 0;
    for (const b of this.s.buildings) if (b.type === 'camp' && b.level > 0) cap += campCap(b.level);
    return cap;
  }
  armyUsed(): number {
    let n = 0;
    for (const t of TTYPES) n += this.s.army[t] * TROOPS[t].housing;
    return n;
  }
  armyCount(): number {
    let n = 0;
    for (const t of TTYPES) n += this.s.army[t];
    return n;
  }
  queuedHousing(): number { return this.s.queue.reduce((n, q) => n + TROOPS[q.t].housing, 0); }
  troopUnlocked(t: TType): boolean { return this.levelOf('barracks') >= TROOPS[t].unlock; }
  maxTroopLevel(): number { return Math.min(TROOP_MAX_LEVEL, this.levelOf('smith') + 1); }
  conqueredCount(): number { return this.s.conquered.reduce((n, c) => n + (c ? 1 : 0), 0); }
  /** First territory still standing, or -1 when the Earth is yours. */
  nextTarget(): number { return this.s.conquered.findIndex(c => !c); }
  /** The tier currently being fought over (9 = final battle). */
  currentTier(): number {
    const n = this.nextTarget();
    return n < 0 ? 9 : TERRITORIES[n].tier;
  }
  canAttack(id: number): boolean {
    if (this.s.conquered[id]) return false;
    return TERRITORIES[id].tier <= this.currentTier();
  }
  area(): number {
    if (this.s.conquered[FINAL_ID]) return EARTH_AREA;
    let a = HOME_AREA;
    TERRITORIES.forEach((t, i) => { if (this.s.conquered[i] && !t.final) a += t.area; });
    return a;
  }
  decorJoy(): number {
    let j = 0;
    for (const b of this.s.buildings) if (b.level > 0) j += BUILDINGS[b.type].joy || 0;
    return Math.min(DECOR_JOY_CAP, j);
  }

  happiness(): { value: number; parts: [string, number][] } {
    const parts: [string, number][] = [['Base mood', 50]];
    const tav = this.levelOf('tavern');
    if (tav > 0) parts.push(['Tavern', tavernJoy(tav)]);
    const decor = this.decorJoy();
    if (decor > 0) parts.push(['Decorations', decor]);
    const tax = TAXES[this.s.tax];
    if (tax.joy) parts.push([tax.name + ' taxes', tax.joy]);
    parts.push(this.s.res.food > 0 ? ['Well fed', 8] : ['Starving', -25]);
    if (this.s.pop >= this.popCap()) parts.push(['Overcrowded', -6]);
    const glory = Math.min(15, this.conqueredCount());
    if (glory) parts.push(['Glory of conquest', glory]);
    if (this.s.boost > 0) parts.push(['Royal festival', 10]);
    const value = Math.max(0, Math.min(100, parts.reduce((n, p) => n + p[1], 0)));
    return { value, parts };
  }
  productivity(): number {
    return (0.75 + 0.5 * this.happiness().value / 100) * (this.s.boost > 0 ? 2 : 1) * (1 + 0.08 * this.ench('harvest'));
  }
  growthFactor(): number {
    const h = this.happiness().value;
    return h < 25 ? -1 : h < 45 ? 0.4 : h < 65 ? 1 : h < 80 ? 1.5 : 2;
  }
  /** Multiplier on construction time from the Brownie Builders enchantment. */
  buildSpeed(): number { return Math.max(0.5, 1 - 0.05 * this.ench('haste')); }
  /** Troop multipliers from enchantments, applied in battle. */
  battleMods(): { dmg: number; hp: number } {
    return { dmg: 1 + 0.04 * this.ench('drums'), hp: 1 + 0.04 * this.ench('skin') };
  }

  // ------------------------------------------------------------ grid

  /** True when a size x size footprint at (gx, gz) is inside the village and overlaps nothing. */
  canPlace(size: number, gx: number, gz: number, ignoreId = 0): boolean {
    if (gx < 0 || gz < 0 || gx + size > GRID || gz + size > GRID) return false;
    for (const b of this.s.buildings) {
      if (b.id === ignoreId) continue;
      const bs = sizeOf(b.type);
      if (gx < b.gx + bs && gx + size > b.gx && gz < b.gz + bs && gz + size > b.gz) return false;
    }
    for (const o of this.s.obstacles) {
      if (o.gx >= gx && o.gx < gx + size && o.gz >= gz && o.gz < gz + size) return false;
    }
    return true;
  }
  /** Closest free footprint to a tile (default: the middle of the village). */
  findSpot(size: number, nearX = GRID / 2, nearZ = GRID / 2, ignoreId = 0): { gx: number; gz: number } | null {
    let best: { gx: number; gz: number } | null = null;
    let bestD = Infinity;
    for (let gx = 0; gx <= GRID - size; gx++) {
      for (let gz = 0; gz <= GRID - size; gz++) {
        const d = Math.hypot(gx + size / 2 - nearX, gz + size / 2 - nearZ);
        if (d >= bestD || !this.canPlace(size, gx, gz, ignoreId)) continue;
        best = { gx, gz };
        bestD = d;
      }
    }
    return best;
  }
  move(id: number, gx: number, gz: number): boolean {
    const b = this.byId(id);
    if (!b || !this.canPlace(sizeOf(b.type), gx, gz, id)) return false;
    b.gx = gx;
    b.gz = gz;
    this.rev++;
    return true;
  }

  // ------------------------------------------------------------ jobs

  private computeStaff(): void {
    this.staff.clear();
    let free = Math.floor(this.s.pop);
    for (const type of JOB_ORDER) {
      for (const b of this.s.buildings) {
        if (b.type !== type || b.level < 1) continue;
        const slots = workerSlots(b.type, b.level);
        const want = b.want < 0 ? slots : Math.min(slots, b.want);
        const n = Math.min(want, free);
        free -= n;
        this.staff.set(b.id, n);
      }
    }
  }
  staffOf(b: Building): number { return this.staff.get(b.id) || 0; }
  employed(): number {
    let n = 0;
    this.staff.forEach(v => { n += v; });
    return n;
  }
  setWant(id: number, n: number): void {
    const b = this.byId(id);
    if (!b) return;
    const slots = workerSlots(b.type, b.level);
    b.want = n >= slots ? -1 : Math.max(0, n);
    this.computeStaff();
  }
  /** Units per minute this building makes right now. */
  rateOf(b: Building): number {
    if (b.level < 1 || !BUILDINGS[b.type].produces) return 0;
    const slots = workerSlots(b.type, b.level);
    return prodPerMin(b.type, b.level) * (slots ? this.staffOf(b) / slots : 0) * this.productivity();
  }
  bufCap(b: Building): number {
    if (b.type === 'keep') return 0;
    return prodPerMin(b.type, Math.max(1, b.level)) * BUFFER_MINUTES;
  }
  private incomeMult(): number { return (this.s.boost > 0 ? 2 : 1) * (1 + 0.06 * this.ench('charm')); }
  /** Per-minute income at the keep (taxes + tribute). */
  keepRate(): Record<Res, number> {
    const out = zeroRes();
    const mult = this.incomeMult();
    out.gold += this.s.pop * taxPerCitizen(this.keep) * TAXES[this.s.tax].mult * mult;
    this.s.conquered.forEach((c, i) => {
      if (!c) return;
      const tr = tribute(i);
      for (const r of RES) out[r] += (tr[r] || 0) * mult;
    });
    return out;
  }
  taxRate(): number { return this.s.pop * taxPerCitizen(this.keep) * TAXES[this.s.tax].mult * this.incomeMult(); }
  foodUse(): number { return this.s.pop * FOOD_PER_CITIZEN + this.armyUsed() * FOOD_PER_HOUSING; }
  /** Net per-minute flow of every resource (what the top bar shows). */
  rates(): Record<Res, number> {
    const out = this.keepRate();
    for (const b of this.s.buildings) {
      const p = BUILDINGS[b.type].produces;
      if (p) out[p] += this.rateOf(b);
    }
    out.food -= this.foodUse();
    return out;
  }

  // ------------------------------------------------------------ tick

  tick(dt: number): void {
    const s = this.s;
    s.stats.play += dt;
    if (s.boost > 0) s.boost = Math.max(0, s.boost - dt);
    this.computeStaff();

    for (const b of s.buildings) {
      if (b.busy > 0) {
        b.busy -= dt;
        if (b.busy <= 0) {
          b.busy = 0;
          b.level++;
          this.rev++;
          if (b.level === 1) s.stats.built++;
          this.emit({ t: 'built', b, first: b.level === 1 });
        }
      }
      const rate = this.rateOf(b);
      if (rate > 0) b.buf = Math.min(this.bufCap(b), b.buf + rate * dt / 60);
    }

    const kr = this.keepRate();
    for (const r of RES) {
      if (kr[r] > 0) s.keepBuf[r] = Math.min(kr[r] * BUFFER_MINUTES, s.keepBuf[r] + kr[r] * dt / 60);
    }

    s.res.food -= this.foodUse() * dt / 60;
    if (s.res.food <= 0) {
      s.res.food = 0;
      if (!this.starveWarned) { this.starveWarned = true; this.emit({ t: 'starving' }); }
    } else if (s.res.food > 20) {
      this.starveWarned = false;
    }

    // Population drifts towards the housing cap, faster when people are happy.
    const cap = this.popCap();
    const g = this.growthFactor();
    if (g > 0 && s.pop < cap) {
      this.popFrac += g * Math.max(4, cap * 0.15) * dt / 60;
    } else if (g < 0 && s.pop > 4) {
      this.popFrac -= Math.max(1, s.pop * 0.03) * dt / 60;
    } else if (s.pop > cap) {
      this.popFrac -= dt / 20;
    }
    if (this.popFrac >= 1) {
      const n = Math.floor(this.popFrac);
      this.popFrac -= n;
      s.pop = Math.min(cap, s.pop + n);
    } else if (this.popFrac <= -1) {
      const n = Math.floor(-this.popFrac);
      this.popFrac += n;
      s.pop = Math.max(4, s.pop - n);
    }

    if (s.queue.length) {
      const q = s.queue[0];
      q.left -= dt * trainSpeed(Math.max(1, this.levelOf('barracks')));
      if (q.left <= 0) {
        s.queue.shift();
        s.army[q.t]++;
        s.stats.trained[q.t]++;
        this.emit({ t: 'trained', troop: q.t });
      }
    }

    if (s.merchantHere > 0) {
      s.merchantHere = Math.max(0, s.merchantHere - dt);
      if (s.merchantHere === 0) s.merchantIn = 200;
    } else {
      s.merchantIn -= dt;
      if (s.merchantIn <= 0) {
        s.merchantHere = 75;
        this.emit({ t: 'merchant' });
      }
    }

    // Mana trickles in from the Spire's apprentices.
    const spire = this.spire();
    if (spire > 0) {
      const mc = manaCap(spire);
      if (s.mana < mc) s.mana = Math.min(mc, s.mana + manaPerMin(spire) * dt / 60);
    }

    // New trees, rocks and shrooms sprout on free tiles.
    s.obIn -= dt;
    if (s.obIn <= 0) {
      s.obIn = OBSTACLE_EVERY;
      if (s.obstacles.length < OBSTACLE_MAX) this.sprout();
    }

    // The loot goblin only visits while someone is watching.
    if (!this.silent) {
      if (this.goblin) {
        this.goblin.left -= dt;
        if (this.goblin.left <= 0) {
          this.goblin = null;
          s.goblinIn = GOBLIN_EVERY * (0.8 + this.rand() * 0.4);
          this.emit({ t: 'goblin', on: false, caught: false });
        }
      } else {
        s.goblinIn -= dt;
        if (s.goblinIn <= 0) {
          this.goblin = { left: GOBLIN_STAY, hp: GOBLIN_TAPS };
          this.emit({ t: 'goblin', on: true, caught: false });
        }
      }
    }

    this.checkQuest();
  }

  private sprout(): void {
    for (let tries = 0; tries < 30; tries++) {
      const gx = Math.floor(this.rand() * GRID), gz = Math.floor(this.rand() * GRID);
      if (!this.canPlace(1, gx, gz)) continue;
      const roll = this.rand();
      const kind = roll < 0.28 ? 0 : roll < 0.5 ? 1 : roll < 0.74 ? 2 : roll < 0.9 ? 3 : 4;
      this.s.obstacles.push({ id: this.s.nextId++, kind, gx, gz, hp: OBSTACLES[kind].hits });
      this.rev++;
      return;
    }
  }

  /** Fast-forwards the realm while the player was away. Returns what piled up. */
  offline(seconds: number): { seconds: number; gains: Record<Res, number> } {
    const total = Math.min(OFFLINE_MAX, Math.max(0, seconds));
    const before = this.pending();
    this.silent = true;
    const merchantIn = this.s.merchantIn;
    const play = this.s.stats.play;
    let left = total;
    while (left > 0) {
      const step = Math.min(5, left);
      this.tick(step);
      left -= step;
    }
    this.s.merchantIn = Math.min(merchantIn, 30);
    this.s.merchantHere = 0;
    this.s.stats.play = play;
    this.silent = false;
    const after = this.pending();
    const gains = zeroRes();
    for (const r of RES) gains[r] = Math.max(0, after[r] - before[r]);
    return { seconds: total, gains };
  }
  /** Everything waiting in building buffers. */
  pending(): Record<Res, number> {
    const out = { ...this.s.keepBuf };
    for (const b of this.s.buildings) {
      const p = BUILDINGS[b.type].produces;
      if (p) out[p] += b.buf;
    }
    return out;
  }

  // ------------------------------------------------------------ resources

  canAfford(c: Cost): boolean {
    for (const r of RES) if ((c[r] || 0) > this.s.res[r] + 1e-6) return false;
    return true;
  }
  missing(c: Cost): Res | null {
    for (const r of RES) if ((c[r] || 0) > this.s.res[r] + 1e-6) return r;
    return null;
  }
  pay(c: Cost): void {
    for (const r of RES) if (c[r]) this.s.res[r] = Math.max(0, this.s.res[r] - c[r]!);
  }
  /** Adds resources. Rewards and loot may overflow storage; collected goods may not. */
  gain(c: Cost, capped = false): Cost {
    const got: Cost = {};
    const cap = this.cap();
    for (const r of RES) {
      const v = c[r] || 0;
      if (v <= 0) continue;
      const take = capped ? Math.max(0, Math.min(v, cap - this.s.res[r])) : v;
      if (take > 0) { this.s.res[r] += take; got[r] = take; }
    }
    return got;
  }

  // ------------------------------------------------------------ building

  /** Why `type` cannot be built right now, or null when it can. */
  buildBlock(type: BType): string | null {
    const d = BUILDINGS[type];
    if (this.keep < d.unlock) return 'Needs Keep level ' + d.unlock;
    if (this.count(type) >= maxCount(type, this.keep)) {
      const next = d.max.findIndex(m => m > this.count(type));
      return next >= 0 ? 'More at Keep level ' + (next + 1) : 'Maximum built';
    }
    if (this.buildersBusy() >= this.buildersTotal()) return 'All builders are busy';
    const miss = this.missing(buildCost(type, 1));
    if (miss) return 'Not enough ' + miss;
    return null;
  }
  build(type: BType, gx: number, gz: number): Building | null {
    if (this.buildBlock(type) || !this.canPlace(sizeOf(type), gx, gz)) return null;
    this.pay(buildCost(type, 1));
    const t = Math.max(1, buildTime(type, 1) * this.buildSpeed());
    const b: Building = { id: this.s.nextId++, type, gx, gz, level: 0, buf: 0, want: -1, busy: t, busyTotal: t };
    this.s.buildings.push(b);
    this.rev++;
    return b;
  }
  /** Builds at the free spot closest to the keep (used by tests and the headless bot). */
  buildAuto(type: BType): Building | null {
    const spot = this.findSpot(sizeOf(type));
    return spot ? this.build(type, spot.gx, spot.gz) : null;
  }
  /** Decorations can be sold back for half their price. */
  demolish(id: number): boolean {
    const b = this.byId(id);
    if (!b || !isDecor(b.type)) return false;
    const c = buildCost(b.type, 1);
    const back: Cost = {};
    for (const r of RES) if (c[r]) back[r] = Math.floor(c[r]! / 2);
    this.gain(back);
    this.s.buildings = this.s.buildings.filter(x => x.id !== id);
    this.rev++;
    return true;
  }
  maxLevel(b: Building): number { return b.type === 'keep' ? MAX_KEEP : isDecor(b.type) ? 1 : this.keep; }
  upgradeBlock(b: Building): string | null {
    if (b.busy > 0) return 'Under construction';
    if (isDecor(b.type)) return 'Decorations cannot be upgraded';
    if (b.level >= this.maxLevel(b)) return b.type === 'keep' ? 'Maximum level' : 'Upgrade the Keep first';
    if (this.buildersBusy() >= this.buildersTotal()) return 'All builders are busy';
    const miss = this.missing(buildCost(b.type, b.level + 1));
    if (miss) return 'Not enough ' + miss;
    return null;
  }
  upgrade(id: number): boolean {
    const b = this.byId(id);
    if (!b || this.upgradeBlock(b)) return false;
    this.pay(buildCost(b.type, b.level + 1));
    b.busy = b.busyTotal = Math.max(1, buildTime(b.type, b.level + 1) * this.buildSpeed());
    this.rev++;
    return true;
  }
  finishBuilds(): void {
    for (const b of this.s.buildings) if (b.busy > 0) b.busy = 0.01;
  }
  finishTraining(): void {
    const s = this.s;
    while (s.queue.length) {
      const q = s.queue.shift()!;
      s.army[q.t]++;
      s.stats.trained[q.t]++;
    }
    this.emit({ t: 'trained', troop: 'peasant' });
  }

  hasGoods(b: Building): boolean {
    if (b.type === 'keep') return RES.some(r => this.s.keepBuf[r] >= 1);
    return b.buf >= 1;
  }
  collect(id: number, quiet = false): Cost | null {
    const b = this.byId(id);
    if (!b || !this.hasGoods(b)) return null;
    let got: Cost;
    if (b.type === 'keep') {
      got = this.gain(this.s.keepBuf, true);
      for (const r of RES) this.s.keepBuf[r] -= got[r] || 0;
    } else {
      const p = BUILDINGS[b.type].produces!;
      got = this.gain({ [p]: Math.floor(b.buf) }, true);
      b.buf -= got[p] || 0;
    }
    if (!RES.some(r => (got[r] || 0) > 0)) {
      if (!quiet) this.emit({ t: 'full', b });
      return null;
    }
    this.s.flags.collected = true;
    this.s.stats.collected++;
    this.emit({ t: 'collect', b, got });
    return got;
  }
  collectAll(): void {
    for (const b of this.s.buildings) if (this.hasGoods(b)) this.collect(b.id);
  }

  // ------------------------------------------------------------ army

  trainBlock(t: TType): string | null {
    if (!this.count('barracks') || this.levelOf('barracks') < 1) return 'Build the Barracks first';
    if (!this.troopUnlocked(t)) return 'Needs Barracks level ' + TROOPS[t].unlock;
    if (this.armyUsed() + this.queuedHousing() + TROOPS[t].housing > this.armyCap()) return this.armyCap() ? 'Army camps are full' : 'Build an Army Camp first';
    if (this.s.pop - TROOPS[t].pop < 4) return 'Not enough citizens to recruit';
    const miss = this.missing(troopCost(t, this.s.troopLv[t]));
    if (miss) return 'Not enough ' + miss;
    return null;
  }
  train(t: TType): boolean {
    if (this.trainBlock(t)) return false;
    this.pay(troopCost(t, this.s.troopLv[t]));
    this.s.pop -= TROOPS[t].pop;
    this.s.queue.push({ t, left: TROOPS[t].train });
    return true;
  }
  cancelTraining(i: number): void {
    const q = this.s.queue[i];
    if (!q) return;
    this.s.queue.splice(i, 1);
    this.gain(troopCost(q.t, this.s.troopLv[q.t]));
    this.s.pop += TROOPS[q.t].pop;
  }
  dismiss(t: TType): void {
    if (this.s.army[t] > 0) { this.s.army[t]--; this.s.pop += TROOPS[t].pop; }
  }

  researchBlock(t: TType): string | null {
    const lv = this.s.troopLv[t];
    if (this.levelOf('smith') < 1) return 'Build a Blacksmith first';
    if (lv >= TROOP_MAX_LEVEL) return 'Maximum level';
    if (lv >= this.maxTroopLevel()) return 'Upgrade the Blacksmith first';
    const miss = this.missing(researchCost(t, lv + 1));
    if (miss) return 'Not enough ' + miss;
    return null;
  }
  research(t: TType): boolean {
    if (this.researchBlock(t)) return false;
    this.pay(researchCost(t, this.s.troopLv[t] + 1));
    this.s.troopLv[t]++;
    this.s.flags.researched = true;
    return true;
  }

  /** Lot size for one market trade. */
  tradeLot(): number { return Math.max(50, Math.round(this.cap() * 0.1 / 50) * 50); }
  sellPrice(r: Exclude<Res, 'gold'>): number {
    return SELL_RATE[r] * (1 + 0.04 * (this.levelOf('market') - 1));
  }
  trade(r: Exclude<Res, 'gold'>, sell: boolean): boolean {
    if (this.levelOf('market') < 1) return false;
    const lot = this.tradeLot();
    if (sell) {
      if (this.s.res[r] < lot) return false;
      this.s.res[r] -= lot;
      this.s.res.gold += lot * this.sellPrice(r);
    } else {
      const price = lot * SELL_RATE[r] * BUY_MARKUP;
      if (this.s.res.gold < price) return false;
      this.s.res.gold -= price;
      this.s.res[r] += lot;
    }
    return true;
  }
  setTax(i: number): void { this.s.tax = Math.max(0, Math.min(TAXES.length - 1, i)); }

  // ------------------------------------------------------------ magic and clickers

  spire(): number { return this.levelOf('spire'); }
  manaCap(): number { return this.spire() > 0 ? manaCap(this.spire()) : 0; }
  tapPower(): number { return tapMana(Math.max(1, this.spire()), this.ench('focus')); }
  /** One tap on the Spire crystal. */
  tapCrystal(): { gain: number; crit: boolean; full: boolean } | null {
    const spire = this.spire();
    if (spire < 1) return null;
    const cap = manaCap(spire);
    this.s.stats.taps++;
    if (this.s.mana >= cap) return { gain: 0, crit: false, full: true };
    const crit = this.rand() < CRIT_CHANCE;
    const gain = Math.min(cap - this.s.mana, this.tapPower() * (crit ? CRIT_MULT : 1));
    this.s.mana += gain;
    return { gain, crit, full: false };
  }
  enchantBlock(id: EnchId): string | null {
    const lv = this.ench(id);
    if (this.spire() < 1) return 'Build an Arcane Spire first';
    if (lv >= ENCH_MAX) return 'Fully enchanted';
    if (lv >= this.spire()) return 'Upgrade the Spire first';
    if (this.s.mana + 1e-6 < enchantCost(lv)) return 'Not enough mana';
    return null;
  }
  enchant(id: EnchId): boolean {
    if (this.enchantBlock(id)) return false;
    this.s.mana -= enchantCost(this.ench(id));
    this.s.ench[id] = this.ench(id) + 1;
    this.s.stats.enchants++;
    return true;
  }
  spellBlock(id: SpellId): string | null {
    const def = SPELLS.find(s => s.id === id)!;
    if (this.spire() < def.unlock) return this.spire() < 1 ? 'Needs an Arcane Spire' : 'Needs Spire level ' + def.unlock;
    if (this.s.mana + 1e-6 < spellCost(id, this.spire())) return 'Not enough mana';
    return null;
  }
  paySpell(id: SpellId): boolean {
    if (this.spellBlock(id)) return false;
    this.s.mana -= spellCost(id, this.spire());
    this.s.stats.spells++;
    return true;
  }

  /** One whack at a tree, rock or mushroom. Returns what dropped when it finally gives way. */
  hitObstacle(id: number): { done: boolean; res: Res | 'mana'; amount: number } | null {
    const o = this.s.obstacles.find(x => x.id === id);
    if (!o) return null;
    o.hp--;
    const def = OBSTACLES[o.kind];
    if (o.hp > 0) return { done: false, res: def.res, amount: 0 };
    this.s.obstacles = this.s.obstacles.filter(x => x.id !== id);
    this.s.stats.cleared++;
    this.rev++;
    const amount = obstacleReward(o.kind, this.keep, this.ench('midas'));
    if (def.res === 'mana') this.s.mana += amount;
    else this.gain({ [def.res]: amount });
    return { done: true, res: def.res, amount };
  }

  goblinJackpot(): Cost {
    const m = Math.pow(2.3, this.keep - 1) * (1 + 0.2 * this.ench('midas'));
    return { gold: Math.round(180 * m), wood: Math.round(90 * m), stone: Math.round(70 * m) };
  }
  /** One tap on the loot goblin. Coins fly on every tap; the last one bursts the sack. */
  tapGoblin(): { coins: number; done: boolean; reward: Cost } | null {
    if (!this.goblin) return null;
    const jack = this.goblinJackpot();
    const coins = Math.max(1, Math.round((jack.gold || 0) * 0.05));
    this.s.res.gold += coins;
    this.goblin.hp--;
    if (this.goblin.hp > 0) return { coins, done: false, reward: {} };
    this.goblin = null;
    this.s.goblinIn = GOBLIN_EVERY * (0.8 + this.rand() * 0.4);
    this.s.stats.goblins++;
    this.gain(jack);
    this.emit({ t: 'goblin', on: false, caught: true });
    return { coins, done: true, reward: jack };
  }

  deedReward(tier: number): { gold: number; mana: number } {
    return { gold: Math.round(120 * Math.pow(3, tier) * Math.pow(1.6, this.keep - 1)), mana: Math.round(30 * Math.pow(2.6, tier)) };
  }
  deeds(): DeedView[] {
    return DEEDS.map(d => {
      const tier = this.s.deeds[d.id] || 0;
      const done = tier >= d.goals.length;
      const goal = d.goals[Math.min(tier, d.goals.length - 1)];
      const value = d.val(this);
      return { id: d.id, name: d.name, desc: d.desc, tier, tiers: d.goals.length, goal, value, ready: !done && value >= goal, done, reward: this.deedReward(tier) };
    });
  }
  deedsReady(): number { return this.deeds().reduce((n, d) => n + (d.ready ? 1 : 0), 0); }
  claimDeed(id: string): { gold: number; mana: number } | null {
    const d = this.deeds().find(x => x.id === id);
    if (!d || !d.ready) return null;
    this.s.deeds[id] = d.tier + 1;
    this.s.res.gold += d.reward.gold;
    this.s.mana += d.reward.mana;
    this.emit({ t: 'deed', name: d.name });
    return d.reward;
  }

  // ------------------------------------------------------------ ad rewards

  addBoost(): void { this.s.boost = Math.min(BOOST_MAX, this.s.boost + BOOST_SECONDS); this.s.stats.ads++; }
  merchantOffer(): Cost {
    const m = Math.pow(2.3, this.keep - 1);
    return { gold: Math.round(220 * m), food: Math.round(150 * m), wood: Math.round(150 * m), stone: Math.round(110 * m) };
  }
  takeMerchant(): Cost {
    const offer = this.merchantOffer();
    this.gain(offer);
    this.s.merchantHere = 0;
    this.s.merchantIn = 200;
    this.s.stats.ads++;
    return offer;
  }
  /** Bonus troops an ad can add to a single battle. */
  mercenaries(): { t: TType; n: number } {
    const t: TType = this.troopUnlocked('knight') ? 'knight' : 'peasant';
    const n = Math.max(4, Math.round(Math.max(14, this.armyCap()) * 0.3 / TROOPS[t].housing));
    return { t, n };
  }

  // ------------------------------------------------------------ war

  applyBattle(o: BattleOutcome): Cost {
    const s = this.s;
    for (const t of TTYPES) s.army[t] = Math.max(0, s.army[t] - (o.lost[t] || 0));
    const full = loot(o.terr);
    const got: Cost = {};
    for (const r of RES) got[r] = Math.round((full[r] || 0) * o.lootFrac);
    this.gain(got);
    if (o.win) {
      s.conquered[o.terr] = true;
      s.stars[o.terr] = 3;
      s.stats.won++;
      if (o.terr === FINAL_ID) s.flags.won = true;
    } else {
      s.stats.lost++;
    }
    this.checkQuest();
    return got;
  }
  reviveTroops(lost: Record<TType, number>): void {
    for (const t of TTYPES) this.s.army[t] += lost[t] || 0;
    this.s.stats.ads++;
  }
  score(): number {
    return this.conqueredCount() * 1000 + this.keep * 100 + this.s.stars.reduce((a, b) => a + b, 0) * 10;
  }

  // ------------------------------------------------------------ quests

  quest(): { text: string; reward: Cost; done: boolean } | null {
    const i = this.s.quest;
    if (i < QUESTS.length) return { text: QUESTS[i].text, reward: QUESTS[i].reward, done: this.questDone(QUESTS[i].id) };
    const n = this.nextTarget();
    if (n < 0) return null;
    const l = loot(n);
    return {
      text: (TERRITORIES[n].final ? 'Crush ' : 'Conquer ') + TERRITORIES[n].name,
      reward: { gold: Math.round((l.gold || 0) * 0.3) },
      done: false,
    };
  }
  private built(t: BType): boolean { return this.levelOf(t) >= 1; }
  private questDone(id: string): boolean {
    const s = this.s;
    switch (id) {
      case 'farm': return this.built('farm');
      case 'lumber': return this.built('lumber');
      case 'house': return this.built('house');
      case 'collect': return s.flags.collected;
      case 'clear3': return s.stats.cleared >= 3;
      case 'barracks': return this.built('barracks');
      case 'camp': return this.built('camp');
      case 'train6': return s.stats.trained.peasant >= 6;
      case 'conq0': return s.conquered[0];
      case 'quarry': return this.built('quarry');
      case 'store': return this.built('storehouse');
      case 'keep2': return this.keep >= 2;
      case 'tier0': return s.conquered[0] && s.conquered[1] && s.conquered[2];
      case 'spire': return this.built('spire');
      case 'tap25': return s.stats.taps >= 25;
      case 'ench1': return s.stats.enchants >= 1;
      case 'market': return this.built('market');
      case 'tavern': return this.built('tavern');
      case 'archers': return s.stats.trained.archer >= 5;
      case 'keep3': return this.keep >= 3;
      case 'smith': return this.built('smith');
      case 'research': return s.flags.researched;
    }
    return false;
  }
  private procQuestFor = -2;
  private checkQuest(): void {
    const s = this.s;
    if (s.quest < QUESTS.length) {
      const q = QUESTS[s.quest];
      if (this.questDone(q.id)) {
        s.quest++;
        this.gain(q.reward);
        this.emit({ t: 'quest', text: q.text, reward: q.reward });
      }
      return;
    }
    // Endless chain: one bounty per territory, paid when it falls.
    const n = this.nextTarget();
    if (this.procQuestFor === -2) { this.procQuestFor = n; return; }
    if (n !== this.procQuestFor) {
      const prev = this.procQuestFor;
      this.procQuestFor = n;
      if (prev >= 0 && s.conquered[prev]) {
        const reward = { gold: Math.round((loot(prev).gold || 0) * 0.3) };
        this.gain(reward);
        this.emit({ t: 'quest', text: 'Conquer ' + TERRITORIES[prev].name, reward });
      }
    }
  }
}

export { BTYPES };
