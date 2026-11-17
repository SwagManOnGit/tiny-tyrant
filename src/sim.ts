// Battle simulation. Pure logic so it can run headless for balancing; battleview.ts draws it.
import { FINAL_ID, SPELLS, SpellId, TDef, TROOPS, TType, TTYPES, kingStats, rng, spellPower, troopMult } from './data';

export type UnitKind = TType | 'king' | 'boss';
export type BldKind = 'keep' | 'tower' | 'hut' | 'camp';

export interface Ent {
  id: number;
  team: 0 | 1;            // 0 = player, 1 = enemy
  unit: boolean;
  type: UnitKind | BldKind;
  x: number; z: number; r: number;
  hp: number; maxHp: number;
  dmg: number; cd: number; cdLeft: number; range: number; speed: number; splash: number; bldMult: number;
  prefers: TDef['prefers'];
  proj: TDef['proj'];
  target: Ent | null;
  think: number;
  homeX: number; homeZ: number;
  hunter: boolean;
  alive: boolean;
  face: number;
  moving: boolean;
  atkT: number;           // seconds since the last attack (drives the lunge animation)
  hurtT: number;          // seconds since last hit
  spawn: number;
  variant: number;
  merc: boolean;
  stun: number;           // seconds left frozen by a spell
}

export interface Proj {
  x: number; y: number; z: number;
  sx: number; sz: number; tx: number; tz: number;
  t: number; dur: number;
  kind: 'arrow' | 'bolt' | 'rock';
  dmg: number; splash: number; bldMult: number;
  team: 0 | 1;
  target: Ent | null;
  alive: boolean;
}

export type SimEvent =
  | { t: 'hit'; x: number; z: number; heavy: boolean }
  | { t: 'die'; e: Ent }
  | { t: 'shoot'; kind: Proj['kind'] }
  | { t: 'boom'; x: number; z: number; r: number; kind: Proj['kind'] }
  | { t: 'spawn'; e: Ent }
  | { t: 'rally' }
  | { t: 'keepFall' }
  | { t: 'cast'; kind: SpellId; x: number; z: number; r: number; dur: number }
  | { t: 'impact'; kind: SpellId; x: number; z: number; r: number };

export interface BattleConfig {
  terr: number;
  army: Record<TType, number>;
  troopLv: Record<TType, number>;
  keep: number;
  mercs?: { t: TType; n: number } | null;
  /** Enchantment multipliers and Spire level (spell strength). */
  dmgMult?: number;
  hpMult?: number;
  spire?: number;
}

export interface BattleResult {
  win: boolean;
  stars: number;
  pct: number;
  lootFrac: number;
  lost: Record<TType, number>;
  time: number;
}

export interface EnemyPlan {
  mult: number;
  baseR: number;
  deployR: number;
  fieldR: number;
  blds: { type: BldKind; x: number; z: number; variant: number }[];
  units: { type: UnitKind; x: number; z: number }[];
  duration: number;
  final: boolean;
}

const BOSS: TDef = {
  id: 'peasant', name: 'Supreme Commander Barnaby', desc: '', hp: 3000, dmg: 50, cd: 1.5, range: 0, speed: 1.7, splash: 2.4,
  prefers: 'any', bldMult: 1, housing: 0, pop: 0, cost: {}, train: 0, unlock: 0, proj: null, r: 1.15,
};

/** Deterministic layout and strength of the enemy stronghold for a territory. */
export function enemyPlan(terr: number): EnemyPlan {
  const final = terr === FINAL_ID;
  const i = terr;
  const rand = rng(1337 + terr * 7919);
  const mult = Math.pow(1.066, i) * (final ? 1.04 : 1);
  const nHuts = final ? 16 : Math.min(18, 3 + Math.floor(i * 0.65));
  const nTowers = final ? 10 : Math.min(9, Math.floor((i + 1) / 2.6));
  const nCamps = final ? 4 : 0;
  const nDef = final ? 28 : Math.min(36, 2 + Math.floor(i * 0.95 + i * i * 0.014));

  // Ring slots around the keep.
  const slots: { x: number; z: number; ring: number }[] = [];
  const need = nHuts + nTowers + nCamps;
  let ring = 0;
  let lastR = 6.5;
  while (slots.length < need) {
    const rad = 6.5 + ring * 5.5;
    const n = Math.floor((2 * Math.PI * rad) / 6.2);
    const off = rand() * Math.PI * 2;
    const take = Math.min(n, need - slots.length);
    // Spread a partly filled ring evenly instead of leaving a gap on one side.
    for (let k = 0; k < take; k++) {
      const a = off + (k / take) * Math.PI * 2 + (rand() - 0.5) * 0.12;
      slots.push({ x: Math.sin(a) * rad, z: Math.cos(a) * rad, ring });
    }
    lastR = rad;
    ring++;
  }
  const blds: EnemyPlan['blds'] = [{ type: 'keep', x: 0, z: 0, variant: i < 3 ? 0 : i < 9 ? 1 : i < 18 ? 2 : 3 }];
  const kinds: BldKind[] = slots.map(() => 'hut');
  for (let k = 0; k < nTowers; k++) kinds[Math.floor(((k + 0.5) / nTowers) * slots.length)] = 'tower';
  for (let c = 0; c < nCamps; c++) {
    let idx = Math.floor(((c + 0.25) / nCamps) * slots.length);
    for (let k = 0; k < slots.length && kinds[idx] !== 'hut'; k++) idx = (idx + 1) % slots.length;
    kinds[idx] = 'camp';
  }
  slots.forEach((s, k) => blds.push({ type: kinds[k], x: s.x, z: s.z, variant: Math.floor(rand() * 3) }));

  const baseR = lastR + 3.5;
  const tier = Math.floor(i / 3);
  const units: EnemyPlan['units'] = [];
  for (let k = 0; k < nDef; k++) {
    const roll = rand();
    let type: UnitKind = 'peasant';
    if (tier >= 5 && roll < 0.14) type = 'mage';
    else if (tier >= 3 && roll < 0.26) type = 'rider';
    else if (tier >= 2 && roll < 0.5) type = 'knight';
    else if (tier >= 1 && roll < 0.78) type = 'archer';
    const a = rand() * Math.PI * 2;
    const rad = 3.5 + rand() * (baseR - 4.5);
    units.push({ type, x: Math.sin(a) * rad, z: Math.cos(a) * rad });
  }
  if (final) units.push({ type: 'boss', x: 0, z: 4.6 });

  return { mult, baseR, deployR: baseR + 3, fieldR: baseR + 19, blds, units, duration: final ? 300 : 180, final };
}

function statsOf(type: UnitKind, keep: number): TDef {
  if (type === 'boss') return BOSS;
  if (type === 'king') {
    const k = kingStats(keep);
    return { ...TROOPS.knight, hp: k.hp, dmg: k.dmg, cd: 0.8, speed: 2.9, r: 0.62, prefers: 'any' };
  }
  return TROOPS[type];
}

/** Rough strength numbers for the "how hard is this" label. */
export function armyPower(army: Record<TType, number>, lv: Record<TType, number>, keep: number): number {
  let p = 0;
  for (const t of TTYPES) {
    const d = TROOPS[t];
    const m = troopMult(lv[t]);
    p += army[t] * Math.sqrt(d.hp * m * (d.dmg * m / d.cd) * (d.range > 0 ? 1.5 : 1) * (d.splash > 0 ? 1.6 : 1));
  }
  const k = kingStats(keep);
  return p + Math.sqrt(k.hp * k.dmg / 0.8);
}
export function enemyPower(terr: number): number {
  const plan = enemyPlan(terr);
  let p = 0;
  for (const u of plan.units) {
    const d = statsOf(u.type, 1);
    p += Math.sqrt(d.hp * plan.mult * (d.dmg * plan.mult / d.cd) * (d.range > 0 ? 1.5 : 1));
  }
  for (const b of plan.blds) {
    if (b.type === 'tower') p += Math.sqrt(260 * plan.mult * 13 * plan.mult) * 1.6;
    else if (b.type === 'camp') p += 60 * plan.mult;
    else p += 3 * plan.mult;
  }
  return p;
}

export class Sim {
  cfg: BattleConfig;
  plan: EnemyPlan;
  ents: Ent[] = [];
  projs: Proj[] = [];
  events: SimEvent[] = [];
  reserve: Record<UnitKind, number>;
  time: number;
  elapsed = 0;
  over = false;
  win = false;
  overT = 0;
  bldTotal = 0;
  bldDown = 0;
  rallyT = 0;       // seconds of rally left
  rallyCd = 0;
  king: Ent | null = null;
  enemyKeep!: Ent;
  /** Where the summoned dragon is right now (for the view). */
  dragon: { x: number; z: number } | null = null;
  private effects: { kind: SpellId; x: number; z: number; t: number; dur: number; dmg: number; r: number; tick: number }[] = [];
  private nextId = 1;
  private dead: Record<TType, number> = { peasant: 0, archer: 0, knight: 0, rider: 0, mage: 0, catapult: 0 };
  private rand: () => number;
  private dirty = false;
  private idleT = 0;

  constructor(cfg: BattleConfig) {
    this.cfg = cfg;
    this.plan = enemyPlan(cfg.terr);
    this.rand = rng(99 + cfg.terr);
    this.time = this.plan.duration;
    this.reserve = { peasant: 0, archer: 0, knight: 0, rider: 0, mage: 0, catapult: 0, king: 1, boss: 0 };
    for (const t of TTYPES) this.reserve[t] = cfg.army[t] || 0;
    if (cfg.mercs) this.reserve[cfg.mercs.t] += cfg.mercs.n;

    const m = this.plan.mult;
    const i = cfg.terr;
    for (const b of this.plan.blds) {
      const e = this.blank(1, false, b.type, b.x, b.z);
      e.variant = b.variant;
      if (b.type === 'keep') {
        e.r = 3.0; e.hp = 1100 * m * (1 + i * 0.1);
        if (i >= 6) { e.dmg = 10 * m; e.range = 8; e.cd = 1.2; e.proj = 'arrow'; }
        this.enemyKeep = e;
      } else if (b.type === 'tower') {
        e.r = 1.5; e.hp = 260 * m; e.dmg = 13 * m; e.range = 8.5; e.cd = 1.1; e.proj = 'arrow';
      } else if (b.type === 'camp') {
        e.r = 2.0; e.hp = 420 * m; e.spawn = 4 + this.rand() * 4;
      } else {
        e.r = 2.0; e.hp = 260 * m;
      }
      e.maxHp = e.hp;
      this.ents.push(e);
      this.bldTotal++;
    }
    for (const u of this.plan.units) this.addUnit(1, u.type, u.x, u.z, m, false);
  }

  private blank(team: 0 | 1, unit: boolean, type: Ent['type'], x: number, z: number): Ent {
    return {
      id: this.nextId++, team, unit, type, x, z, r: 0.5, hp: 1, maxHp: 1, dmg: 0, cd: 1, cdLeft: 0, range: 0, speed: 0,
      splash: 0, bldMult: 1, prefers: 'any', proj: null, target: null, think: 0, homeX: x, homeZ: z, hunter: false,
      alive: true, face: team === 0 ? Math.PI : 0, moving: false, atkT: 9, hurtT: 9, spawn: 0, variant: 0, merc: false, stun: 0,
    };
  }

  private addUnit(team: 0 | 1, type: UnitKind, x: number, z: number, mult: number, hunter: boolean): Ent {
    const d = statsOf(type, this.cfg.keep);
    const e = this.blank(team, true, type, x, z);
    e.r = d.r;
    e.hp = e.maxHp = d.hp * mult;
    e.dmg = d.dmg * mult;
    e.cd = d.cd; e.range = d.range; e.speed = d.speed; e.splash = d.splash; e.bldMult = d.bldMult;
    e.prefers = team === 1 ? 'unit' : d.prefers;
    e.proj = d.proj;
    e.hunter = hunter;
    e.think = this.rand() * 0.3;
    e.variant = Math.floor(this.rand() * 4);
    this.ents.push(e);
    return e;
  }

  canDeployAt(x: number, z: number): boolean {
    const d = Math.hypot(x, z);
    return d >= this.plan.deployR && d <= this.plan.fieldR;
  }
  reserveLeft(): number {
    let n = this.reserve.king;
    for (const t of TTYPES) n += this.reserve[t];
    return n;
  }
  deploy(type: UnitKind, x: number, z: number): Ent | null {
    if (this.over || this.reserve[type] <= 0 || !this.canDeployAt(x, z)) return null;
    this.reserve[type]--;
    const mult = type === 'king' ? 1 : troopMult(this.cfg.troopLv[type as TType] || 1);
    const e = this.addUnit(0, type, x + (this.rand() - 0.5) * 0.6, z + (this.rand() - 0.5) * 0.6, mult, false);
    e.hp = e.maxHp = e.hp * (this.cfg.hpMult || 1);
    e.dmg *= this.cfg.dmgMult || 1;
    e.face = Math.atan2(-x, -z);
    if (type === 'king') this.king = e;
    this.events.push({ t: 'spawn', e });
    return e;
  }
  canRally(): boolean { return !!this.king && this.king.alive && this.rallyCd <= 0 && !this.over; }
  rally(): boolean {
    if (!this.canRally()) return false;
    this.rallyT = 8;
    this.rallyCd = 30;
    for (const e of this.ents) if (e.alive && e.team === 0) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.25);
    this.events.push({ t: 'rally' });
    return true;
  }
  surrender(): void {
    if (!this.over) { this.over = true; this.win = false; }
  }
  pct(): number { return this.bldTotal ? this.bldDown / this.bldTotal : 0; }
  /** Toppling the keep is a full three-star victory; otherwise stars track how much of the town is rubble. */
  stars(): number {
    if (this.win) return 3;
    const p = this.pct();
    return p >= 0.8 ? 2 : p >= 0.5 ? 1 : 0;
  }
  result(): BattleResult {
    const lost = { ...this.dead };
    const m = this.cfg.mercs;
    if (m) lost[m.t] = Math.max(0, lost[m.t] - m.n);   // hired swords take the first losses
    // Never report more losses than the player actually brought.
    for (const t of TTYPES) lost[t] = Math.min(lost[t], this.cfg.army[t] || 0);
    const stars = this.stars();
    return {
      win: this.win, stars, pct: this.pct(), lost, time: this.elapsed,
      lootFrac: this.win ? 1 : this.pct() * 0.4,
    };
  }

  private damage(e: Ent, amount: number): void {
    if (!e.alive) return;
    e.hp -= amount;
    e.hurtT = 0;
    if (e.hp > 0) return;
    e.hp = 0;
    e.alive = false;
    this.dirty = true;
    this.events.push({ t: 'die', e });
    if (!e.unit) {
      this.bldDown++;
      if (e === this.enemyKeep) {
        this.win = true;
        this.over = true;
        this.events.push({ t: 'keepFall' });
        // The keep held the town together: once it falls, every other building gives up and collapses too.
        for (const b of this.ents) {
          if (!b.alive || b.unit || b.team !== 1) continue;
          b.alive = false;
          b.hp = 0;
          this.bldDown++;
          this.events.push({ t: 'die', e: b });
        }
      }
    } else if (e.team === 0 && e.type !== 'king' && e.type !== 'boss') {
      this.dead[e.type as TType]++;
    }
  }

  private pick(u: Ent): Ent | null {
    let best: Ent | null = null;
    let bestD = Infinity;
    const ents = this.ents;
    if (u.team === 1) {
      // Defenders react to anything close, or anything hitting the base.
      const guard = this.plan.baseR + 1.5;
      for (const e of ents) {
        if (!e.alive || e.team !== 0) continue;
        const d = Math.hypot(e.x - u.x, e.z - u.z);
        if (d >= bestD) continue;
        if (u.hunter || d < 11 || Math.hypot(e.x, e.z) < guard) { best = e; bestD = d; }
      }
      return best;
    }
    const pref = u.prefers;
    if (pref === 'tower' || pref === 'building') {
      for (const e of ents) {
        if (!e.alive || e.team !== 1 || e.unit) continue;
        if (pref === 'tower' && e.type !== 'tower') continue;
        const d = Math.hypot(e.x - u.x, e.z - u.z) - e.r;
        if (d < bestD) { best = e; bestD = d; }
      }
      if (best) return best;
    }
    const unitReach = pref === 'unit' ? 14 : 6.5;
    for (const e of ents) {
      if (!e.alive || e.team !== 1 || !e.unit) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z);
      if (d < unitReach && d < bestD) { best = e; bestD = d; }
    }
    if (best) return best;
    for (const e of ents) {
      if (!e.alive || e.team !== 1) continue;
      const d = Math.hypot(e.x - u.x, e.z - u.z) - e.r;
      if (d < bestD) { best = e; bestD = d; }
    }
    return best;
  }

  private attack(u: Ent, t: Ent): void {
    u.cdLeft = u.cd;
    u.atkT = 0;
    if (u.proj) {
      const dist = Math.hypot(t.x - u.x, t.z - u.z);
      const speed = u.proj === 'arrow' ? 20 : u.proj === 'bolt' ? 13 : 10;
      this.projs.push({
        x: u.x, y: 1.2, z: u.z, sx: u.x, sz: u.z, tx: t.x, tz: t.z, t: 0, dur: Math.max(0.12, dist / speed),
        kind: u.proj, dmg: u.dmg, splash: u.splash, bldMult: u.bldMult, team: u.team, target: t, alive: true,
      });
      this.events.push({ t: 'shoot', kind: u.proj });
      return;
    }
    if (u.splash > 0) {
      for (const e of this.ents) {
        if (e.alive && e.team !== u.team && Math.hypot(e.x - t.x, e.z - t.z) <= u.splash + e.r) {
          this.damage(e, u.dmg * (e.unit ? 1 : u.bldMult));
        }
      }
      this.events.push({ t: 'boom', x: t.x, z: t.z, r: u.splash, kind: 'rock' });
    } else {
      this.damage(t, u.dmg * (t.unit ? 1 : u.bldMult));
      this.events.push({ t: 'hit', x: t.x, z: t.z, heavy: u.type === 'king' || u.type === 'rider' });
    }
  }

  step(dt: number): void {
    if (this.over) { this.overT += dt; this.stepProjs(dt); return; }
    this.time -= dt;
    this.elapsed += dt;
    if (this.rallyT > 0) this.rallyT -= dt;
    if (this.rallyCd > 0) this.rallyCd -= dt;
    const ents = this.ents;
    let playerAlive = 0;
    let enemyUnits = 0;
    for (const e of ents) {
      if (!e.alive || !e.unit) continue;
      if (e.team === 0) playerAlive++; else enemyUnits++;
    }

    for (let n = ents.length, k = 0; k < n; k++) {
      const u = ents[k];
      if (!u.alive) continue;
      u.atkT += dt;
      u.hurtT += dt;
      if (u.stun > 0) { u.stun -= dt; u.moving = false; continue; }
      const haste = u.team === 0 && this.rallyT > 0;
      u.cdLeft = Math.max(0, u.cdLeft - dt * (haste ? 1.5 : 1));

      if (!u.unit) {
        if (u.type === 'camp') {
          u.spawn -= dt;
          if (u.spawn <= 0 && enemyUnits < 52) {
            u.spawn = 9;
            const roll = this.rand();
            const type: UnitKind = roll < 0.4 ? 'peasant' : roll < 0.65 ? 'archer' : roll < 0.9 ? 'knight' : 'mage';
            const e = this.addUnit(1, type, u.x + (this.rand() - 0.5) * 3, u.z + (this.rand() - 0.5) * 3, this.plan.mult * 0.8, true);
            this.events.push({ t: 'spawn', e });
            enemyUnits++;
          }
        }
        if (u.dmg > 0) {
          u.think -= dt;
          if (u.think <= 0 || (u.target && !u.target.alive)) {
            u.think = 0.3;
            u.target = null;
            let bd = u.range + u.r;
            for (const e of ents) {
              if (!e.alive || e.team !== 0) continue;
              const d = Math.hypot(e.x - u.x, e.z - u.z);
              if (d < bd) { bd = d; u.target = e; }
            }
          }
          if (u.target && u.cdLeft <= 0) this.attack(u, u.target);
        }
        continue;
      }

      u.think -= dt;
      if (u.think <= 0 || (u.target && !u.target.alive)) {
        u.think = 0.4 + this.rand() * 0.2;
        u.target = this.pick(u);
      }
      const t = u.target;
      u.moving = false;
      if (t) {
        const dx = t.x - u.x, dz = t.z - u.z;
        const dist = Math.hypot(dx, dz) || 0.001;
        const reach = (u.range > 0 ? u.range : u.r + 0.4) + t.r;
        u.face = Math.atan2(dx, dz);
        if (dist > reach) {
          const sp = u.speed * (haste ? 1.4 : 1) * dt;
          u.x += (dx / dist) * sp;
          u.z += (dz / dist) * sp;
          u.moving = true;
        } else if (u.cdLeft <= 0) {
          this.attack(u, t);
        }
      } else if (u.team === 1) {
        const dx = u.homeX - u.x, dz = u.homeZ - u.z;
        const dist = Math.hypot(dx, dz);
        if (dist > 0.6) {
          u.x += (dx / dist) * u.speed * 0.7 * dt;
          u.z += (dz / dist) * u.speed * 0.7 * dt;
          u.face = Math.atan2(dx, dz);
          u.moving = true;
        }
      }
    }

    this.stepEffects(dt);
    this.separate();
    this.stepProjs(dt);

    if (this.dirty) {
      this.dirty = false;
      this.ents = this.ents.filter(e => e.alive);
    }

    if (!this.over) {
      if (this.time <= 0) { this.time = 0; this.over = true; }
      else if (playerAlive === 0 && this.reserveLeft() === 0) {
        this.idleT += dt;
        if (this.idleT > 1.2) this.over = true;
      } else this.idleT = 0;
    }
  }

  /** Casts a battle spell at a point on the field. Paying the mana is the caller's job. */
  cast(id: SpellId, x: number, z: number): boolean {
    if (this.over) return false;
    const def = SPELLS.find(s => s.id === id)!;
    const power = spellPower(this.cfg.spire || 1);
    let dur = 0;
    if (id === 'fireball') {
      dur = 0.6;
      this.effects.push({ kind: id, x, z, t: 0, dur, dmg: 120 * power, r: def.radius, tick: 0 });
    } else if (id === 'heal') {
      for (const e of this.ents) {
        if (e.alive && e.team === 0 && e.unit && Math.hypot(e.x - x, e.z - z) <= def.radius) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.45);
      }
    } else if (id === 'freeze') {
      for (const e of this.ents) {
        if (e.alive && e.team === 1 && Math.hypot(e.x - x, e.z - z) <= def.radius + e.r) e.stun = 4.5;
      }
    } else {
      dur = 3.4;
      this.effects.push({ kind: id, x: -(this.plan.fieldR + 10), z, t: 0, dur, dmg: 150 * power, r: def.radius, tick: 0 });
    }
    this.events.push({ t: 'cast', kind: id, x, z, r: def.radius, dur });
    return true;
  }

  private stepEffects(dt: number): void {
    if (!this.effects.length) return;
    for (const f of this.effects) {
      f.t += dt;
      if (f.kind === 'fireball') {
        if (f.t < f.dur) continue;
        for (const e of this.ents) {
          if (e.alive && e.team === 1 && Math.hypot(e.x - f.x, e.z - f.z) <= f.r + e.r) this.damage(e, f.dmg * (e.unit ? 1 : 1.4));
        }
        this.events.push({ t: 'impact', kind: 'fireball', x: f.x, z: f.z, r: f.r });
        f.t = Infinity;
      } else {
        const span = this.plan.fieldR + 10;
        f.x = -span + 2 * span * Math.min(1, f.t / f.dur);
        this.dragon = { x: f.x, z: f.z };
        f.tick -= dt;
        if (f.tick <= 0) {
          f.tick = 0.2;
          for (const e of this.ents) {
            if (e.alive && e.team === 1 && Math.hypot(e.x - f.x, e.z - f.z) <= f.r + e.r) this.damage(e, f.dmg * (e.unit ? 1 : 1.2));
          }
          if (Math.abs(f.x) < this.plan.fieldR) this.events.push({ t: 'impact', kind: 'dragon', x: f.x, z: f.z, r: f.r });
        }
        if (f.t >= f.dur) { f.t = Infinity; this.dragon = null; }
      }
    }
    this.effects = this.effects.filter(f => f.t !== Infinity);
  }

  private separate(): void {
    const ents = this.ents;
    const n = ents.length;
    for (let a = 0; a < n; a++) {
      const u = ents[a];
      if (!u.alive || !u.unit) continue;
      for (let b = 0; b < n; b++) {
        if (a === b) continue;
        const o = ents[b];
        if (!o.alive) continue;
        if (o.unit && b < a) continue;       // unit pairs are handled once
        const dx = u.x - o.x, dz = u.z - o.z;
        const min = u.r + o.r;
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
        const d = Math.hypot(dx, dz);
        if (d >= min) continue;
        const push = min - d;
        let nx: number, nz: number;
        if (d < 0.001) { const ang = this.rand() * 6.283; nx = Math.sin(ang); nz = Math.cos(ang); }
        else { nx = dx / d; nz = dz / d; }
        if (o.unit) {
          u.x += nx * push * 0.5; u.z += nz * push * 0.5;
          o.x -= nx * push * 0.5; o.z -= nz * push * 0.5;
        } else {
          // Slide around buildings rather than sticking to them.
          u.x += nx * push + -nz * push * 0.35;
          u.z += nz * push + nx * push * 0.35;
        }
      }
    }
  }

  private stepProjs(dt: number): void {
    let any = false;
    for (const p of this.projs) {
      if (!p.alive) { any = true; continue; }
      if (p.target && p.target.alive) { p.tx = p.target.x; p.tz = p.target.z; }
      p.t += dt;
      const k = Math.min(1, p.t / p.dur);
      p.x = p.sx + (p.tx - p.sx) * k;
      p.z = p.sz + (p.tz - p.sz) * k;
      const arc = p.kind === 'rock' ? 5 : p.kind === 'bolt' ? 1.2 : 0.8;
      p.y = 1.2 + Math.sin(k * Math.PI) * arc;
      if (k < 1) continue;
      p.alive = false;
      any = true;
      if (p.splash > 0) {
        for (const e of this.ents) {
          if (!e.alive || e.team === p.team) continue;
          if (Math.hypot(e.x - p.tx, e.z - p.tz) <= p.splash + e.r) this.damage(e, p.dmg * (e.unit ? 1 : p.bldMult));
        }
        this.events.push({ t: 'boom', x: p.tx, z: p.tz, r: p.splash, kind: p.kind });
      } else if (p.target && p.target.alive) {
        this.damage(p.target, p.dmg * (p.target.unit ? 1 : p.bldMult));
        this.events.push({ t: 'hit', x: p.tx, z: p.tz, heavy: false });
      }
    }
    if (any) this.projs = this.projs.filter(p => p.alive);
  }

  /** Drops the whole reserve near one side of the base: tanks first, ranged behind. Used for headless runs and the auto button. */
  autoDeploy(angle = 0): void {
    const front: UnitKind[] = ['knight', 'rider', 'king', 'peasant'];
    const back: UnitKind[] = ['archer', 'mage', 'catapult'];
    const place = (types: UnitKind[], rad: number) => {
      let k = 0;
      for (const t of types) {
        while (this.reserve[t] > 0) {
          const spread = ((k % 9) - 4) * 0.09 + (Math.floor(k / 9) % 2) * 0.045;
          const row = Math.floor(k / 9) * 1.1;
          const a = angle + spread;
          const r = Math.min(this.plan.fieldR, rad + row);
          if (!this.deploy(t, Math.sin(a) * r, Math.cos(a) * r)) break;
          k++;
        }
      }
    };
    place(front, this.plan.deployR + 0.5);
    place(back, this.plan.deployR + 4);
  }
}

/** Runs a whole battle without drawing it. */
export function runHeadless(cfg: BattleConfig): BattleResult {
  const sim = new Sim(cfg);
  sim.autoDeploy(0);
  let guard = 0;
  while (!sim.over && guard++ < 30 * 400) {
    sim.step(1 / 30);
    if (sim.canRally() && sim.elapsed > 6) sim.rally();
  }
  return sim.result();
}
