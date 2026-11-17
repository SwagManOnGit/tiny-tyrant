// Headless balance check: plays every territory with the army a player is expected to have.
// Run with: npm run balance
import { TERRITORIES, TROOPS, TType, TTYPES, campCap, maxCount, tierKeep } from '../src/data';
import { armyPower, enemyPower, runHeadless } from '../src/sim';

function expectedArmy(keep: number, scale: number): { army: Record<TType, number>; lv: Record<TType, number>; cap: number } {
  const cap = Math.floor(maxCount('camp', keep) * campCap(keep) * scale);
  const army: Record<TType, number> = { peasant: 0, archer: 0, knight: 0, rider: 0, mage: 0, catapult: 0 };
  const unlocked = TTYPES.filter(t => TROOPS[t].unlock <= keep);
  const share: Record<TType, number> = { peasant: 0.3, archer: 0.3, knight: 0.4, rider: 0.15, mage: 0.2, catapult: 0.2 };
  let total = 0;
  for (const t of unlocked) total += share[t];
  let used = 0;
  for (const t of unlocked) {
    const n = Math.floor((cap * share[t]) / total / TROOPS[t].housing);
    army[t] = n;
    used += n * TROOPS[t].housing;
  }
  army.peasant += cap - used;
  const troopLevel = keep >= 3 ? keep : 1;
  const lv: Record<TType, number> = { peasant: troopLevel, archer: troopLevel, knight: troopLevel, rider: troopLevel, mage: troopLevel, catapult: troopLevel };
  return { army, lv, cap };
}

const rows: string[] = [];
for (const t of TERRITORIES) {
  const keep = tierKeep(t.tier);
  const line: string[] = [String(t.id).padStart(2), t.name.padEnd(28).slice(0, 28), 'K' + keep];
  for (const scale of [0.6, 1]) {
    for (const lvDelta of [-1, 0]) {
      const e = expectedArmy(keep, scale);
      for (const k of TTYPES) e.lv[k] = Math.max(1, e.lv[k] + lvDelta);
      const r = runHeadless({ terr: t.id, army: e.army, troopLv: e.lv, keep });
      let lost = 0, had = 0;
      for (const k of TTYPES) { lost += r.lost[k] * TROOPS[k].housing; had += e.army[k] * TROOPS[k].housing; }
      const ratio = armyPower(e.army, e.lv, keep) / enemyPower(t.id);
      line.push(`${r.win ? 'W' + r.stars : 'L ' }${String(Math.round(r.pct * 100)).padStart(4)}% t${String(Math.round(r.time)).padStart(3)} lost${String(Math.round((lost / Math.max(1, had)) * 100)).padStart(4)}% p${ratio.toFixed(2)}`);
    }
  }
  rows.push(line.join(' | '));
}
console.log('id | name | keep | 60% army, lv-1 | 60% army, lv | full army, lv-1 | full army, lv');
console.log(rows.join('\n'));
