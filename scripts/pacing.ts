// Headless playthrough: a simple greedy "player" runs the whole campaign so we can see how long each tier
// takes and catch soft-locks (a price nobody can ever afford, a tier nobody can beat).
// Run with: npm run pacing
import { BTYPES, BType, FINAL_ID, TERRITORIES, TROOPS, TTYPES, TType, fmtTime } from '../src/data';
import { armyPower, enemyPower, runHeadless } from '../src/sim';
import { Game } from '../src/state';

const game = new Game(null);
const g = game;
const BUILD_ORDER: BType[] = ['farm', 'lumber', 'house', 'barracks', 'camp', 'quarry', 'storehouse', 'market', 'tavern', 'smith', 'spire', 'house', 'farm', 'camp', 'lumber', 'quarry', 'storehouse', 'market'];
const SHARE: Record<TType, number> = { peasant: 0.3, archer: 0.3, knight: 0.4, rider: 0.15, mage: 0.2, catapult: 0.2 };

function act(): void {
  g.collectAll();
  // Build anything new that is allowed.
  for (const t of BUILD_ORDER) {
    if (!g.buildBlock(t)) g.buildAuto(t);
  }
  // Upgrades: keep first, then whatever is cheapest.
  if (!g.upgradeBlock(g.keepB)) g.upgrade(g.keepB.id);
  const ups = g.s.buildings.filter(b => b.type !== 'keep' && !g.upgradeBlock(b)).sort((a, b) => a.level - b.level);
  if (ups.length) g.upgrade(ups[0].id);
  for (const t of TTYPES) if (g.troopUnlocked(t) && !g.researchBlock(t)) g.research(t);
  // Fill the camps with a mixed army.
  const cap = g.armyCap();
  if (cap > 0) {
    const unlocked = TTYPES.filter(t => g.troopUnlocked(t));
    let total = 0;
    for (const t of unlocked) total += SHARE[t];
    for (const t of unlocked) {
      const want = Math.floor((cap * SHARE[t]) / total / TROOPS[t].housing);
      const queued = g.s.queue.filter(q => q.t === t).length;
      if (g.s.army[t] + queued < want && !g.trainBlock(t)) g.train(t);
    }
    if (!g.trainBlock('peasant') && g.armyUsed() + g.queuedHousing() < cap) g.train('peasant');
  }
}

let t = 0;
let lastWin = 0;
let fights = 0, losses = 0;
const log: string[] = [];
const LIMIT = 40 * 3600;
while (t < LIMIT && !g.s.conquered[FINAL_ID]) {
  g.tick(1);
  t++;
  if (t % 3 === 0) act();
  if (t % 10 === 0) {
    const n = g.nextTarget();
    if (n >= 0 && g.s.queue.length === 0 && g.armyUsed() >= g.armyCap() * 0.85 && g.armyCap() > 0) {
      const ratio = armyPower(g.s.army, g.s.troopLv, g.keep) / enemyPower(n);
      if (ratio >= 1.12) {
        const r = runHeadless({ terr: n, army: { ...g.s.army }, troopLv: { ...g.s.troopLv }, keep: g.keep });
        g.applyBattle({ terr: n, win: r.win, stars: r.stars, lootFrac: r.lootFrac, lost: r.lost });
        fights++;
        if (!r.win) losses++;
        else {
          log.push(`${fmtTime(t).padEnd(9)} +${fmtTime(t - lastWin).padEnd(8)} ${String(n).padStart(2)} ${TERRITORIES[n].name.padEnd(28)} keep ${g.keep} pop ${Math.floor(g.s.pop)}/${g.popCap()} army ${g.armyCap()} lv ${g.s.troopLv.peasant} joy ${g.happiness().value} ratio ${ratio.toFixed(2)}`);
          lastWin = t;
        }
      }
    }
  }
  if (t - lastWin > 6 * 3600) {
    log.push(`STUCK at ${fmtTime(t)}: keep ${g.keep}, next ${g.nextTarget()}, res ${JSON.stringify(g.s.res)}, cap ${g.cap()}, keepBlock ${g.upgradeBlock(g.keepB)}`);
    break;
  }
}
console.log(log.join('\n'));
console.log(`\nFinished: ${g.s.conquered[FINAL_ID]} in ${fmtTime(t)} of play, ${fights} battles, ${losses} lost. Buildings: ${BTYPES.map(b => b + ':' + g.count(b)).join(' ')}`);
