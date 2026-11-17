// Static game data and balance formulas. No DOM, no three.js: safe to import anywhere.

export type Res = 'gold' | 'food' | 'wood' | 'stone';
export const RES: Res[] = ['gold', 'food', 'wood', 'stone'];
export type Cost = Partial<Record<Res, number>>;
export const RES_NAME: Record<Res, string> = { gold: 'Gold', food: 'Food', wood: 'Wood', stone: 'Stone' };

export const MAX_KEEP = 10;

// ---------------------------------------------------------------- buildings

export type BType =
  | 'keep' | 'house' | 'farm' | 'lumber' | 'quarry' | 'storehouse'
  | 'market' | 'barracks' | 'camp' | 'tavern' | 'smith' | 'spire' | 'garden' | 'lantern' | 'fountain' | 'statue';

export interface BDef {
  id: BType;
  size: number;        // footprint in tiles (size x size)
  cat: 'economy' | 'military' | 'magic' | 'decor';
  joy?: number;        // happiness from decorations
  name: string;
  desc: string;
  cost: Cost;          // cost of level 1 (keep: cost of level 2)
  growth: number;      // cost multiplier per level
  time: number;        // build seconds for level 1
  timeGrowth: number;
  unlock: number;      // keep level required
  max: number[];       // max count, indexed by keep level - 1
  produces?: Res;
  prod?: number;       // per minute at level 1, fully staffed
}

const one = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export const BUILDINGS: Record<BType, BDef> = {
  keep: {
    id: 'keep', size: 4, cat: 'economy', name: 'Keep', desc: 'Your seat of power. Upgrading it unlocks new buildings, more of everything and higher building levels. Taxes and tribute pile up here.',
    cost: { gold: 400, wood: 350, stone: 250 }, growth: 2.5, time: 15, timeGrowth: 1.75, unlock: 1, max: one,
  },
  house: {
    id: 'house', size: 3, cat: 'economy', name: 'Cottage', desc: 'Homes for your loyal (enough) subjects. More housing means more workers, taxpayers and recruits.',
    cost: { wood: 40, gold: 20 }, growth: 2.15, time: 4, timeGrowth: 1.6, unlock: 1, max: [3, 4, 5, 5, 6, 6, 7, 7, 8, 8],
  },
  farm: {
    id: 'farm', size: 3, cat: 'economy', name: 'Farm', desc: 'Grows food. Citizens and soldiers eat constantly, and they get grumpy when they cannot.',
    cost: { wood: 50, gold: 30 }, growth: 2.15, time: 5, timeGrowth: 1.6, unlock: 1, max: [1, 2, 2, 3, 3, 3, 4, 4, 4, 4],
    produces: 'food', prod: 60,
  },
  lumber: {
    id: 'lumber', size: 3, cat: 'economy', name: 'Lumber Camp', desc: 'Turns nearby trees into wood. The trees have not been consulted.',
    cost: { gold: 50 }, growth: 2.15, time: 5, timeGrowth: 1.6, unlock: 1, max: [1, 1, 2, 2, 2, 3, 3, 3, 3, 3],
    produces: 'wood', prod: 50,
  },
  quarry: {
    id: 'quarry', size: 3, cat: 'economy', name: 'Quarry', desc: 'Digs up stone for anything that should survive a strong breeze.',
    cost: { gold: 60, wood: 60 }, growth: 2.15, time: 6, timeGrowth: 1.6, unlock: 1, max: [1, 1, 2, 2, 2, 3, 3, 3, 3, 3],
    produces: 'stone', prod: 36,
  },
  storehouse: {
    id: 'storehouse', size: 3, cat: 'economy', name: 'Storehouse', desc: 'Raises the storage limit of every resource. Also where the cat lives.',
    cost: { wood: 100, stone: 60 }, growth: 2.15, time: 8, timeGrowth: 1.6, unlock: 1, max: [1, 1, 2, 2, 2, 3, 3, 3, 3, 3],
  },
  market: {
    id: 'market', size: 3, cat: 'economy', name: 'Market', desc: 'Merchants earn you gold and let you trade one resource for another.',
    cost: { wood: 150, stone: 100, gold: 50 }, growth: 2.15, time: 10, timeGrowth: 1.6, unlock: 2, max: [0, 1, 1, 1, 2, 2, 2, 2, 2, 2],
    produces: 'gold', prod: 40,
  },
  barracks: {
    id: 'barracks', size: 3, cat: 'military', name: 'Barracks', desc: 'Trains citizens into soldiers. Higher levels unlock new troops and train faster.',
    cost: { wood: 120, stone: 40, gold: 80 }, growth: 2.15, time: 10, timeGrowth: 1.6, unlock: 1, max: one,
  },
  camp: {
    id: 'camp', size: 3, cat: 'military', name: 'Army Camp', desc: 'Tents for your army. Bigger camps hold more troops.',
    cost: { wood: 80, food: 60 }, growth: 2.15, time: 6, timeGrowth: 1.6, unlock: 1, max: [1, 1, 2, 2, 2, 3, 3, 3, 3, 3],
  },
  tavern: {
    id: 'tavern', size: 3, cat: 'economy', name: 'Tavern', desc: 'Keeps the population happy. Happy people work harder and have more children.',
    cost: { wood: 200, stone: 120, gold: 150 }, growth: 2.15, time: 12, timeGrowth: 1.6, unlock: 2, max: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  smith: {
    id: 'smith', size: 3, cat: 'military', name: 'Blacksmith', desc: 'Forges better gear. Lets you upgrade every troop type.',
    cost: { stone: 250, wood: 150, gold: 250 }, growth: 2.15, time: 15, timeGrowth: 1.6, unlock: 3, max: [0, 0, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  spire: {
    id: 'spire', size: 3, cat: 'magic', name: 'Arcane Spire', desc: 'A crooked wizard tower crowned with a mana crystal. Tap the crystal for mana, then spend it on enchantments and battle spells.',
    cost: { gold: 200, stone: 150, wood: 100 }, growth: 2.15, time: 12, timeGrowth: 1.6, unlock: 2, max: [0, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  garden: {
    id: 'garden', size: 2, cat: 'decor', joy: 1, name: 'Flower Garden', desc: 'Petunias, mostly. The citizens pretend not to love it. +1 happiness.',
    cost: { wood: 80, food: 40 }, growth: 1, time: 3, timeGrowth: 1, unlock: 1, max: [2, 2, 3, 3, 4, 4, 5, 5, 6, 6],
  },
  lantern: {
    id: 'lantern', size: 1, cat: 'decor', joy: 1, name: 'Moon Lantern', desc: 'Glows with bottled moonlight. Moths not included. +1 happiness.',
    cost: { gold: 150, stone: 60 }, growth: 1, time: 3, timeGrowth: 1, unlock: 2, max: [0, 2, 2, 3, 3, 4, 4, 5, 5, 6],
  },
  fountain: {
    id: 'fountain', size: 2, cat: 'decor', joy: 3, name: 'Wishing Fountain', desc: 'Toss a coin in. The wish is non-refundable. +3 happiness.',
    cost: { gold: 1200, stone: 900 }, growth: 1, time: 10, timeGrowth: 1, unlock: 3, max: [0, 0, 1, 1, 1, 1, 2, 2, 2, 2],
  },
  statue: {
    id: 'statue', size: 2, cat: 'decor', joy: 3, name: 'Royal Statue', desc: 'A flattering golden likeness of you, slightly taller than life. +3 happiness.',
    cost: { gold: 2500, stone: 2000 }, growth: 1, time: 12, timeGrowth: 1, unlock: 4, max: [0, 0, 0, 1, 1, 1, 1, 2, 2, 2],
  },
};
export const BTYPES = Object.keys(BUILDINGS) as BType[];
export const JOB_ORDER: BType[] = ['farm', 'lumber', 'quarry', 'market'];

/** Cost to bring a building to `level` (level 1 = initial construction). */
export function buildCost(type: BType, level: number): Cost {
  const d = BUILDINGS[type];
  const steps = type === 'keep' ? level - 2 : level - 1;
  const m = Math.pow(d.growth, steps);
  const out: Cost = {};
  for (const r of RES) if (d.cost[r]) out[r] = niceNum(d.cost[r]! * m);
  return out;
}
export function buildTime(type: BType, level: number): number {
  const d = BUILDINGS[type];
  const steps = type === 'keep' ? level - 2 : level - 1;
  return Math.round(d.time * Math.pow(d.timeGrowth, steps));
}
export function maxCount(type: BType, keep: number): number {
  return BUILDINGS[type].max[Math.max(0, Math.min(MAX_KEEP, keep) - 1)];
}
export function prodPerMin(type: BType, level: number): number {
  const d = BUILDINGS[type];
  return d.prod ? d.prod * Math.pow(1.55, level - 1) : 0;
}
export function workerSlots(type: BType, level: number): number {
  return BUILDINGS[type].produces ? Math.round(3 * Math.pow(1.4, level - 1)) : 0;
}
export const houseCap = (level: number) => Math.round(8 * Math.pow(1.45, level - 1));
export const keepPop = (level: number) => 8 + 4 * level;
export const campCap = (level: number) => Math.round(14 * Math.pow(1.2, level - 1));
export const baseStorage = (keep: number) => niceNum(800 * Math.pow(2.3, keep - 1));
export const storehouseCap = (level: number) => niceNum(1000 * Math.pow(2.3, level - 1));
export const builderCount = (keep: number) => (keep < 4 ? 2 : keep < 7 ? 3 : 4);
export const tavernJoy = (level: number) => 6 + 3 * level;

// ---------------------------------------------------------------- home base grid

/** The village is a square of GRID x GRID tiles; every building occupies a square footprint of tiles. */
export const GRID = 26;
export const TILE = 2;
export const KEEP_TILE = GRID / 2 - 2;
export const sizeOf = (t: BType) => BUILDINGS[t].size;
export const isDecor = (t: BType) => BUILDINGS[t].cat === 'decor';
export const DECOR_JOY_CAP = 20;
/** World coordinate of the centre of a footprint whose first tile is g. */
export const tileCentre = (g: number, size: number) => (g + size / 2 - GRID / 2) * TILE;
export const CATS: { id: BDef['cat']; name: string }[] = [
  { id: 'economy', name: 'Economy' },
  { id: 'military', name: 'Military' },
  { id: 'magic', name: 'Magic' },
  { id: 'decor', name: 'Decorations' },
];

/** Things that sprout on free tiles and can be cleared by tapping them. */
export interface ObDef { name: string; hits: number; res: Res | 'mana'; amount: number }
export const OBSTACLES: ObDef[] = [
  { name: 'Old Oak', hits: 4, res: 'wood', amount: 30 },
  { name: 'Pine', hits: 4, res: 'wood', amount: 26 },
  { name: 'Boulder', hits: 6, res: 'stone', amount: 30 },
  { name: 'Giant Mushroom', hits: 3, res: 'food', amount: 28 },
  { name: 'Mana Shard', hits: 5, res: 'mana', amount: 14 },
];
export function obstacleReward(kind: number, keep: number, midas: number): number {
  const d = OBSTACLES[kind];
  const grow = d.res === 'mana' ? 1.6 : 1.9;
  return Math.round(d.amount * Math.pow(grow, keep - 1) * (1 + 0.2 * midas));
}
export const OBSTACLE_MAX = 16;
export const OBSTACLE_EVERY = 140;   // seconds between new sprouts

// ---------------------------------------------------------------- economy

export const TAXES = [
  { name: 'Low', mult: 0.5, joy: 12 },
  { name: 'Fair', mult: 1, joy: 0 },
  { name: 'High', mult: 1.6, joy: -14 },
  { name: 'Extortion', mult: 2.4, joy: -30 },
];
export const taxPerCitizen = (keep: number) => 1.5 * Math.pow(1.3, keep - 1);
export const FOOD_PER_CITIZEN = 0.5;   // per minute
export const FOOD_PER_HOUSING = 0.5;   // per minute, per army housing slot
export const BUFFER_MINUTES = 30;
export const BOOST_SECONDS = 600;
export const BOOST_MAX = 1800;
export const OFFLINE_MAX = 4 * 3600;

export const SELL_RATE: Record<Exclude<Res, 'gold'>, number> = { food: 0.4, wood: 0.6, stone: 0.9 };
export const BUY_MARKUP = 2.2;

// ---------------------------------------------------------------- troops

export type TType = 'peasant' | 'archer' | 'knight' | 'rider' | 'mage' | 'catapult';
export const TTYPES: TType[] = ['peasant', 'archer', 'knight', 'rider', 'mage', 'catapult'];

export interface TDef {
  id: TType;
  name: string;
  desc: string;
  hp: number;
  dmg: number;
  cd: number;        // seconds between attacks
  range: number;     // 0 = melee
  speed: number;
  splash: number;
  prefers: 'any' | 'unit' | 'tower' | 'building';
  bldMult: number;   // damage multiplier against buildings
  housing: number;
  pop: number;       // citizens recruited
  cost: Cost;
  train: number;     // seconds
  unlock: number;    // barracks level
  proj: 'arrow' | 'bolt' | 'rock' | null;
  r: number;
}

export const TROOPS: Record<TType, TDef> = {
  peasant: {
    id: 'peasant', name: 'Angry Peasant', desc: 'Cheap, cheerful, armed with gardening equipment. Best in large numbers.',
    hp: 48, dmg: 8, cd: 0.9, range: 0, speed: 2.4, splash: 0, prefers: 'any', bldMult: 1,
    housing: 1, pop: 1, cost: { food: 20, gold: 5 }, train: 3, unlock: 1, proj: null, r: 0.45,
  },
  archer: {
    id: 'archer', name: 'Archer', desc: 'Shoots from a safe distance. Squishy if anything reaches them.',
    hp: 30, dmg: 10, cd: 1.0, range: 7, speed: 2.2, splash: 0, prefers: 'any', bldMult: 1,
    housing: 1, pop: 1, cost: { food: 25, wood: 20 }, train: 4, unlock: 2, proj: 'arrow', r: 0.45,
  },
  knight: {
    id: 'knight', name: 'Knight', desc: 'A walking tin can. Soaks up damage so the others do not have to.',
    hp: 170, dmg: 15, cd: 1.0, range: 0, speed: 1.9, splash: 0, prefers: 'any', bldMult: 1,
    housing: 2, pop: 1, cost: { food: 50, gold: 45 }, train: 7, unlock: 3, proj: null, r: 0.5,
  },
  rider: {
    id: 'rider', name: 'Pony Rider', desc: 'Fast and fearless. Gallops straight for enemy watchtowers.',
    hp: 120, dmg: 22, cd: 1.0, range: 0, speed: 4.0, splash: 0, prefers: 'tower', bldMult: 1.6,
    housing: 3, pop: 1, cost: { food: 90, gold: 70 }, train: 9, unlock: 4, proj: null, r: 0.6,
  },
  mage: {
    id: 'mage', name: 'Hedge Wizard', desc: 'Lobs sparkly explosions that hurt everything in a small area.',
    hp: 55, dmg: 20, cd: 1.5, range: 6, speed: 2.0, splash: 2.2, prefers: 'unit', bldMult: 0.8,
    housing: 4, pop: 1, cost: { food: 80, gold: 140 }, train: 11, unlock: 5, proj: 'bolt', r: 0.45,
  },
  catapult: {
    id: 'catapult', name: 'Catapult', desc: 'Flings boulders at buildings from very far away. Ignores enemy troops entirely.',
    hp: 110, dmg: 30, cd: 3.0, range: 11, speed: 1.2, splash: 1.6, prefers: 'building', bldMult: 5,
    housing: 5, pop: 2, cost: { wood: 220, stone: 120, gold: 80 }, train: 14, unlock: 6, proj: 'rock', r: 0.8,
  },
};

export const TROOP_MAX_LEVEL = 10;
export const troopMult = (level: number) => Math.pow(1.2, level - 1);
export function troopCost(t: TType, level: number): Cost {
  const m = Math.pow(1.5, level - 1);
  const out: Cost = {};
  const c = TROOPS[t].cost;
  for (const r of RES) if (c[r]) out[r] = Math.round(c[r]! * m);
  return out;
}
/** Cost to research a troop type up to `level` at the blacksmith. */
export function researchCost(t: TType, level: number): Cost {
  const base = 120 + TROOPS[t].housing * 40;
  const m = Math.pow(2.3, level - 2);
  return { gold: niceNum(base * m), stone: niceNum(base * 0.6 * m) };
}
export const trainSpeed = (barracks: number) => 1 + 0.15 * (barracks - 1);

export const kingStats = (keep: number) => ({
  hp: Math.round(420 * Math.pow(1.24, keep - 1)),
  dmg: Math.round(26 * Math.pow(1.24, keep - 1)),
});

// ---------------------------------------------------------------- conquest

export interface Tier { name: string; kind: string; area: number }
export const TIERS: Tier[] = [
  { name: 'The Neighbours', kind: 'Backyard', area: 0.02 },
  { name: 'The Hamlets', kind: 'Hamlet', area: 0.3 },
  { name: 'The Villages', kind: 'Village', area: 4 },
  { name: 'The Towns', kind: 'Town', area: 50 },
  { name: 'The Baronies', kind: 'Barony', area: 600 },
  { name: 'The Duchies', kind: 'Duchy', area: 8000 },
  { name: 'The Kingdoms', kind: 'Kingdom', area: 100000 },
  { name: 'The Empires', kind: 'Empire', area: 1500000 },
  { name: 'The Continents', kind: 'Continent', area: 45000000 },
];
export const EARTH_AREA = 510072000;
export const HOME_AREA = 0.004;

export interface Territory {
  id: number;
  tier: number;
  name: string;
  ruler: string;
  blurb: string;
  area: number;
  extra: Exclude<Res, 'gold'>;
  final?: boolean;
}

const T_RAW: [string, string, string][] = [
  ["Barnaby's Turnip Patch", 'Farmer Barnaby', 'Three rows of turnips and one very protective farmer. He will remember this.'],
  ["Granny Mabel's Goose Yard", 'Granny Mabel', 'The geese are the real threat. Granny is mostly there for morale.'],
  ['The Disputed Hedge', 'Neighbour Nigel', 'Nigel insists the hedge is on HIS side. Time to settle it the royal way.'],
  ['Mudford', 'Reeve Mogg', 'A hamlet famous for its mud. They export it. Nobody buys it.'],
  ['Lower Sneeze', 'Elder Achoo', 'Permanently dusty. Bring a handkerchief and an army.'],
  ['Pigglewick', 'Swineherd Otto', 'More pigs than people, and the pigs get a vote.'],
  ['Butterby', 'Mayor Churnley', 'A proud dairy village. They will not go down without a spread.'],
  ['Crumpet-on-Wye', 'Baker Maud', 'Smells amazing. Defended by people armed with stale baguettes.'],
  ['Soggy Bottom', 'Bogmaster Fen', 'It rains here sideways. The locals have grown suspicious of dry people.'],
  ['Fort Grumble', 'Captain Harrumph', 'A walled town of professional complainers with actual soldiers.'],
  ['Cheddarton', 'Guildmaster Wedge', 'Rich on cheese money. The walls are stone, the vault is gouda.'],
  ['Port Wobble', 'Admiral Tipsy', 'A harbour town where nothing stands quite straight, least of all the Admiral.'],
  ['Barony of Blunderhelm', 'Baron Blunder', 'The Baron wears his helmet backwards and still wins tournaments.'],
  ['The Snorewood', 'Baroness Doze', 'An enormous sleepy forest. The sentries nap in shifts.'],
  ['Marshes of Meh', 'Baron Shrug', 'Nobody wants the marshes. You want them anyway. That is the tyrant spirit.'],
  ['Duchy of Dandelion', 'Duke Fluffington', 'Pretty fields, pretty banners, surprisingly ugly fighting.'],
  ['County Clonk', 'Countess Clang', 'Every citizen owns a suit of armour. They wear them to breakfast.'],
  ['Grand Fief of Fluff', 'Archduke Wooly', 'Sheep as far as the eye can see, and well beyond that.'],
  ['Kingdom of Brie', 'King Camembert IV', 'A soft, rich kingdom with a hard rind of castles.'],
  ['Rustlandia', 'Queen Ferrica', 'Iron mines, iron walls, iron will. Slightly squeaky.'],
  ['Queendom of Quill', 'Queen Paige', 'Scholars who weaponised bureaucracy. Bring forms in triplicate.'],
  ['The Soup Empire', 'Emperor Broth', 'A vast empire united by one recipe. They defend it to the last ladle.'],
  ['Khanate of Khaos', 'The Great Kerfuffle', 'Endless plains of riders who never agreed on a direction.'],
  ['Sultanate of Snooze', 'Sultan Siesta', 'Unconquered for a thousand years, mostly because invaders dozed off.'],
  ['The Westmost Lands', 'High Chancellor Dusk', 'A whole continent. You could fit your first village in it a few billion times.'],
  ['The Big Middle', 'Grand Vizier Midd', 'The continent everything else is next to. Mostly mountains and opinions.'],
  ['The Far Far East', 'Empress Dawn', 'The last free continent. After this, there is only ocean. And consequences.'],
];
const EXTRAS: Exclude<Res, 'gold'>[] = ['food', 'wood', 'stone'];

export const TERRITORIES: Territory[] = T_RAW.map((t, i) => {
  const tier = Math.floor(i / 3);
  return {
    id: i, tier, name: t[0], ruler: t[1], blurb: t[2],
    area: TIERS[tier].area * (1 + (i % 3) * 0.15), extra: EXTRAS[i % 3],
  };
});
export const FINAL_ID = TERRITORIES.length;
TERRITORIES.push({
  id: FINAL_ID, tier: 9, name: 'The United Earth Rebellion', ruler: 'Supreme Commander Barnaby',
  blurb: 'Every land you ever conquered has risen up together, led by a turnip farmer with a grudge. Win this and the whole Earth is yours.',
  area: EARTH_AREA, extra: 'food', final: true,
});

/** Tribute per minute from a conquered territory. */
export function tribute(id: number): Cost {
  const t = TERRITORIES[id];
  if (t.final) return { gold: 60000, food: 20000, wood: 20000, stone: 20000 };
  const j = 1 + (id % 3) * 0.15;
  const out: Cost = { gold: niceNum(10 * Math.pow(2.3, t.tier) * j) };
  out[t.extra] = niceNum(8 * Math.pow(2.2, t.tier) * j);
  return out;
}
/** Loot for a full victory. */
export function loot(id: number): Cost {
  const t = TERRITORIES[id];
  const tier = Math.min(t.tier, 9);
  const j = 1 + (id % 3) * 0.2;
  return {
    gold: niceNum(260 * Math.pow(2.35, tier) * j),
    food: niceNum(140 * Math.pow(2.3, tier) * j),
    wood: niceNum(160 * Math.pow(2.3, tier) * j),
    stone: niceNum(110 * Math.pow(2.3, tier) * j),
  };
}
/** Keep level a player is expected to have before a tier is comfortable. */
export const tierKeep = (tier: number) => Math.min(MAX_KEEP, tier + 1);

// ---------------------------------------------------------------- quests

export interface QuestDef {
  id: string;
  text: string;
  reward: Cost;
}
export const QUESTS: QuestDef[] = [
  { id: 'farm', text: 'Open Build and place a Farm', reward: { gold: 40 } },
  { id: 'lumber', text: 'Build a Lumber Camp', reward: { wood: 60 } },
  { id: 'house', text: 'Build a Cottage', reward: { food: 60 } },
  { id: 'collect', text: 'Collect resources from a building', reward: { gold: 60 } },
  { id: 'clear3', text: 'Tap trees or rocks in your village to clear 3 of them', reward: { wood: 80, stone: 40 } },
  { id: 'barracks', text: 'Build the Barracks', reward: { food: 120 } },
  { id: 'camp', text: 'Build an Army Camp', reward: { gold: 80 } },
  { id: 'train6', text: 'Train 6 Angry Peasants', reward: { food: 100 } },
  { id: 'conq0', text: "Conquer Barnaby's Turnip Patch", reward: { gold: 150, wood: 100 } },
  { id: 'quarry', text: 'Build a Quarry', reward: { stone: 80 } },
  { id: 'store', text: 'Build a Storehouse', reward: { stone: 100 } },
  { id: 'keep2', text: 'Upgrade the Keep to level 2', reward: { gold: 300 } },
  { id: 'tier0', text: 'Conquer all three Neighbours', reward: { gold: 500, stone: 200 } },
  { id: 'spire', text: 'Build an Arcane Spire', reward: { gold: 300 } },
  { id: 'tap25', text: 'Tap the Spire crystal 25 times', reward: { stone: 300 } },
  { id: 'ench1', text: 'Buy any enchantment at the Spire', reward: { gold: 600 } },
  { id: 'market', text: 'Build a Market', reward: { gold: 300 } },
  { id: 'tavern', text: 'Build a Tavern', reward: { food: 400 } },
  { id: 'archers', text: 'Train 5 Archers', reward: { wood: 400 } },
  { id: 'keep3', text: 'Upgrade the Keep to level 3', reward: { gold: 1200 } },
  { id: 'smith', text: 'Build a Blacksmith', reward: { stone: 800 } },
  { id: 'research', text: 'Upgrade any troop at the Blacksmith', reward: { gold: 1500 } },
];

// ---------------------------------------------------------------- magic

export const manaCap = (spire: number) => niceNum(150 * Math.pow(1.7, spire - 1));
export const manaPerMin = (spire: number) => 6 * Math.pow(1.6, spire - 1);
/** Mana from one tap on the crystal. */
export const tapMana = (spire: number, focus: number) => Math.pow(1.45, spire - 1) * (1 + 0.5 * focus);
export const CRIT_CHANCE = 0.08;
export const CRIT_MULT = 6;

export type EnchId = 'harvest' | 'focus' | 'drums' | 'skin' | 'haste' | 'vault' | 'charm' | 'midas';
export interface EnchDef { id: EnchId; name: string; desc: string; per: number; unit: string }
export const ENCHANTS: EnchDef[] = [
  { id: 'harvest', name: 'Bountiful Harvest', desc: 'Farms, camps, quarries and markets make more.', per: 8, unit: '% output' },
  { id: 'focus', name: 'Arcane Focus', desc: 'Every tap on the crystal gives more mana.', per: 50, unit: '% mana per tap' },
  { id: 'drums', name: 'War Drums', desc: 'Your troops and the King hit harder.', per: 4, unit: '% troop damage' },
  { id: 'skin', name: 'Stoneskin', desc: 'Your troops and the King are tougher.', per: 4, unit: '% troop health' },
  { id: 'haste', name: 'Brownie Builders', desc: 'Helpful house spirits speed up construction.', per: 5, unit: '% faster building' },
  { id: 'vault', name: 'Bottomless Vault', desc: 'Storage that is bigger on the inside.', per: 10, unit: '% storage' },
  { id: 'charm', name: 'Charm of Plenty', desc: 'Taxes and tribute arrive slightly inflated.', per: 6, unit: '% taxes and tribute' },
  { id: 'midas', name: 'Midas Touch', desc: 'Clearing obstacles and catching loot goblins pays more.', per: 20, unit: '% tap rewards' },
];
export const ENCH_MAX = 10;
/** Mana needed to raise an enchantment from `level` to `level + 1`. */
export const enchantCost = (level: number) => niceNum(40 * Math.pow(1.75, level));

export type SpellId = 'fireball' | 'heal' | 'freeze' | 'dragon';
export interface SpellDef { id: SpellId; name: string; desc: string; unlock: number; frac: number; radius: number }
export const SPELLS: SpellDef[] = [
  { id: 'fireball', name: 'Fireball', desc: 'A meteor that scorches everything hostile where it lands.', unlock: 1, frac: 0.22, radius: 3.6 },
  { id: 'heal', name: 'Mending Mist', desc: 'Restores a big chunk of health to your troops in the area.', unlock: 2, frac: 0.2, radius: 5 },
  { id: 'freeze', name: 'Frostbite', desc: 'Freezes enemy troops and towers solid for a few seconds.', unlock: 4, frac: 0.3, radius: 5.5 },
  { id: 'dragon', name: 'Summon Dragon', desc: 'A dragon strafes the whole battlefield with fire. Subtle it is not.', unlock: 6, frac: 0.6, radius: 3.6 },
];
export const spellCost = (id: SpellId, spire: number) => Math.round(manaCap(Math.max(1, spire)) * SPELLS.find(s => s.id === id)!.frac);
export const spellPower = (spire: number) => Math.pow(1.24, Math.max(1, spire) - 1);

export const GOBLIN_EVERY = 170;     // seconds between loot goblin visits
export const GOBLIN_STAY = 28;
export const GOBLIN_TAPS = 8;

// ---------------------------------------------------------------- helpers

/** Rounds to two significant digits so prices look hand-picked. */
export function niceNum(n: number): number {
  if (n < 100) return Math.round(n / 5) * 5 || Math.round(n);
  const mag = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

const SUFFIX = ['', 'K', 'M', 'B', 'T'];
export function fmt(n: number): string {
  n = Math.floor(n);
  if (n < 1000) return String(n);
  let i = 0;
  let v = n;
  while (v >= 1000 && i < SUFFIX.length - 1) { v /= 1000; i++; }
  return (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2)).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1') + SUFFIX[i];
}
export function fmtTime(s: number): string {
  s = Math.max(0, Math.ceil(s));
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm' + (s % 60 ? ' ' + (s % 60) + 's' : '');
  return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
}
export function fmtArea(km2: number): string {
  if (km2 < 0.01) return fmt(km2 * 1e6) + ' m²';
  if (km2 < 10) return km2.toFixed(2).replace(/\.?0+$/, '') + ' km²';
  return fmt(km2) + ' km²';
}

/** Small deterministic RNG (mulberry32) for reproducible enemy bases and map shapes. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
