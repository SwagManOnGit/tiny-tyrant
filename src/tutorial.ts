// Lord Ribbington, Royal Advisor (a toad in a powdered wig): guided tour, one-time tips and the handbook.
import { TIERS } from './data';
import type { Game } from './state';

export type Mood = 'happy' | 'smug' | 'shock' | 'wink';

/** The advisor's portrait. Expressions change the eyes and mouth. */
export function toadSvg(mood: Mood = 'happy'): string {
  const lids = mood === 'smug'
    ? '<path d="M32.500 39a9.500 9.500 0 0 1 19 0z" fill="#5fb23a" stroke="#2f6b1f" stroke-width="2"/><path d="M68.500 39a9.500 9.500 0 0 1 19 0z" fill="#5fb23a" stroke="#2f6b1f" stroke-width="2"/>'
    : '';
  const leftEye = mood === 'wink'
    ? '<path d="M34 42c4 4 12 4 16 0" fill="none" stroke="#2a2030" stroke-width="3" stroke-linecap="round"/>'
    : `<circle cx="42" cy="41" r="${mood === 'shock' ? 10 : 8.500}" fill="#fff"/><circle cx="${mood === 'smug' ? 46 : 44}" cy="${mood === 'smug' ? 44 : 42}" r="${mood === 'shock' ? 2.600 : 4}" fill="#2a2030"/>`;
  const rightEye = `<circle cx="78" cy="41" r="${mood === 'shock' ? 10 : 8.500}" fill="#fff"/><circle cx="${mood === 'smug' ? 80 : 76}" cy="${mood === 'smug' ? 44 : 42}" r="${mood === 'shock' ? 2.600 : 4}" fill="#2a2030"/>`;
  const mouth = mood === 'shock'
    ? '<ellipse cx="60" cy="76" rx="9" ry="7.500" fill="#5a1f2a" stroke="#2f6b1f" stroke-width="3"/><ellipse cx="60" cy="80" rx="5" ry="3" fill="#ff8fa8"/>'
    : mood === 'smug'
      ? '<path d="M40 73c8 6 26 8 42-3" fill="none" stroke="#2f6b1f" stroke-width="3.500" stroke-linecap="round"/>'
      : '<path d="M36 70c10 11 38 11 48 0" fill="none" stroke="#2f6b1f" stroke-width="3.500" stroke-linecap="round"/>';
  return `<svg class="toad" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M22 62C12 32 30 12 60 12s48 20 38 50c6 4 8 12 2 18-5 5-12 3-14-2H34c-2 5-9 7-14 2-6-6-4-14 2-18z" fill="#f6f3ec" stroke="#8d8676" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="17" cy="72" r="9" fill="#f6f3ec" stroke="#8d8676" stroke-width="2.500"/><circle cx="15" cy="88" r="8" fill="#f6f3ec" stroke="#8d8676" stroke-width="2.500"/>
    <circle cx="103" cy="72" r="9" fill="#f6f3ec" stroke="#8d8676" stroke-width="2.500"/><circle cx="105" cy="88" r="8" fill="#f6f3ec" stroke="#8d8676" stroke-width="2.500"/>
    <path d="M17 72c3-3 6-3 8 0M15 88c3-3 6-3 8 0M95 72c3-3 6-3 8 0M97 88c3-3 6-3 8 0" fill="none" stroke="#b9b2a2" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 120c0-19 15-29 36-29s36 10 36 29z" fill="#6b3fa8" stroke="#3a1f66" stroke-width="3"/>
    <circle cx="38" cy="110" r="2.600" fill="#ffc83d"/><circle cx="82" cy="110" r="2.600" fill="#ffc83d"/>
    <path d="M45 91c4 7 9 9 15 9s11-2 15-9l-4 25H49z" fill="#fff" stroke="#8d8676" stroke-width="2.500" stroke-linejoin="round"/>
    <path d="M53 101l7 6 7-6M51 109l9 6 9-6" fill="none" stroke="#c9c2b2" stroke-width="2" stroke-linecap="round"/>
    <path d="M24 66c0-18 14-30 36-30s36 12 36 30-14 30-36 30-36-12-36-30z" fill="#7ccf4a" stroke="#2f6b1f" stroke-width="3"/>
    <path d="M33 75c7 12 47 12 54 0-2 12-13 19-27 19s-25-7-27-19z" fill="#c9f0a0"/>
    <circle cx="42" cy="40" r="13.500" fill="#7ccf4a" stroke="#2f6b1f" stroke-width="3"/><circle cx="78" cy="40" r="13.500" fill="#7ccf4a" stroke="#2f6b1f" stroke-width="3"/>
    ${leftEye}${rightEye}${lids}
    <circle cx="78" cy="41" r="11.500" fill="none" stroke="#ffc83d" stroke-width="3"/><circle cx="78" cy="41" r="11.500" fill="#bfe9ff" opacity=".25"/>
    <path d="M89 46c7 9 7 22 2 32" fill="none" stroke="#ffc83d" stroke-width="2" stroke-dasharray="2 3" stroke-linecap="round"/>
    <circle cx="56.500" cy="58" r="1.400" fill="#2f6b1f"/><circle cx="63.500" cy="58" r="1.400" fill="#2f6b1f"/>
    ${mouth}
    <ellipse cx="32" cy="68" rx="5" ry="3" fill="#ff9dbb" opacity=".75"/><ellipse cx="88" cy="68" rx="5" ry="3" fill="#ff9dbb" opacity=".75"/>
    <circle cx="29" cy="56" r="2" fill="#5fb23a"/><circle cx="91" cy="59" r="2.300" fill="#5fb23a"/><circle cx="60" cy="48" r="1.800" fill="#5fb23a"/>
  </svg>`;
}

export interface TutorHooks {
  sfx(name: string): void;
  panelKind(): string;
  placing(): boolean;
  kingDist(): number;
  obstacleSpot(): { x: number; y: number } | null;
  inBattle(): boolean;
  save(): void;
}

export interface Page { text: string; mood?: Mood; target?: string; spot?: 'obstacle' }
interface Step extends Page {
  id: string;
  /** Interactive step: advances by itself once this is true. */
  wait?: (g: Game, h: TutorHooks, t: Tutor) => boolean;
  /** Skip the step entirely when the player already did it. */
  skip?: (g: Game) => boolean;
  /** Jump back to an earlier step (by id) when the player backed out of something. */
  back?: (g: Game, h: TutorHooks) => string | null;
}

const hasFarm = (g: Game) => g.count('farm') > 0;

const TOUR: Step[] = [
  { id: 'hello', mood: 'happy', text: '<i>Ribbit.</i> Ahem. Lord Ribbington, Royal Advisor, at your service. Yes, I am a toad. No, I will not be taking questions about the wig.' },
  { id: 'state', mood: 'smug', text: 'Your kingdom currently consists of one keep, a field of weeds, and me. Let us turn it into something worth taxing.' },
  {
    id: 'move', mood: 'happy', text: 'Lesson one: locomotion. <b>Tap the grass</b> and His Majesty waddles there (or use WASD). <b>Drag</b> to look around, <b>pinch or scroll</b> to zoom. Go on, stretch the royal legs.',
    wait: (_g, h, t) => h.kingDist() - t.mark > 5,
  },
  { id: 'res', mood: 'happy', target: '#hud .chips', text: 'Up here are your treasures: <b>gold, food, wood and stone</b>. The small number is what your storage can hold. Hoarding is encouraged.' },
  {
    id: 'shop', mood: 'wink', target: '[data-nav="build"]', text: 'A kingdom needs buildings. Poke the <b>Build</b> button. Gently, it is load-bearing.',
    skip: hasFarm, wait: (_g, h) => h.panelKind() === 'shop' || h.placing(),
  },
  {
    id: 'pick', mood: 'happy', target: '[data-act="place:farm"]', text: 'A splendid catalogue. Start with a <b>Farm</b>: peasants become unreasonable without food.',
    skip: hasFarm, wait: (_g, h) => h.placing(), back: (_g, h) => (h.panelKind() !== 'shop' && !h.placing() ? 'shop' : null),
  },
  {
    id: 'place', mood: 'happy', target: '#phud .pbar', text: 'Your village is a <b>grid</b>. <b>Drag the farm</b> onto free tiles, or tap a spot. Green means yes; red means there is a tree in your kitchen. Then press <b>Build</b>.',
    skip: hasFarm, wait: hasFarm, back: (g, h) => (!h.placing() && !hasFarm(g) ? 'shop' : null),
  },
  {
    id: 'built', mood: 'smug', text: 'The builders are hammering away. You only have two of them, so every project is a choice. Or you can simply wait. Waiting is free.',
    wait: g => g.levelOf('farm') >= 1,
  },
  {
    id: 'collect', mood: 'happy', target: '.wl-collect', text: 'Buildings fill up over time. Tap the <b>bubble</b> above one to collect, or just march the King past and he pockets the lot. Royal privilege.',
    wait: g => g.s.flags.collected,
  },
  {
    id: 'clear', mood: 'wink', spot: 'obstacle', text: 'See the trees, rocks and suspicious mushrooms? <b>Tap one a few times</b> to clear it. Free loot, more room to build, and it annoys the squirrels.',
    wait: g => g.s.stats.cleared >= 1,
  },
  { id: 'people', mood: 'happy', target: '[data-chip="pop"]', text: 'These are your <b>citizens</b>. They work in your buildings, pay taxes and get drafted. Build <b>Cottages</b> to house more of them.' },
  { id: 'mood', mood: 'smug', target: '[data-chip="joy"]', text: 'And this is their <b>mood</b>. Happy people work harder and multiply. Miserable ones leave. The <b>Realm</b> button lets you set taxes and jobs; decorations and taverns cheer everyone up.' },
  { id: 'army', mood: 'happy', target: '[data-nav="army"]', text: 'Under <b>Build</b> you will also find a Barracks and Army Camps. Then <b>Army</b> turns perfectly good peasants into perfectly angry ones.' },
  { id: 'map', mood: 'wink', target: '[data-nav="map"]', text: 'The fun part. <b>Conquer</b> shows your neighbours, starting with poor Barnaby and his turnips. Beat all three and the map zooms out to lands ten times bigger, and <b>your walls get an upgrade</b>. Success should be visible.' },
  { id: 'quest', mood: 'happy', target: '.quest', text: 'Lost? This <b>scroll</b> always holds your next errand, with a reward. <b>Deeds</b> pays out for long-term feats, like tapping things an unreasonable number of times.' },
  { id: 'decree', mood: 'smug', target: '.rbtn.boost', text: 'This is a <b>Royal Decree</b>: watch a short ad and everything you produce is doubled for ten minutes. Entirely optional. I merely receive a commission.' },
  { id: 'magic', mood: 'shock', text: 'Later, at Keep level 2, you can build an <b>Arcane Spire</b>: a crystal to tap for mana, enchantments, battle spells. There is a dragon. I am assured he is house-trained.' },
  { id: 'bye', mood: 'wink', target: '.rbtn.help', text: 'That is the lot. I shall pop up whenever something new appears, and my <b>Handbook</b> (the button with my handsome face) remembers everything. Now go forth and oppress responsibly!' },
];

/** One-time tips, shown the first time a feature turns up. */
export const TIPS: Record<string, Page[]> = {
  battle: [
    { mood: 'happy', text: 'War! Splendid. Pick a troop card below, then <b>tap the grass</b> outside the red ring to deploy. <b>Hold</b> your finger down to pour them out like soup.', target: '.bcards' },
    { mood: 'wink', text: 'The <b>King</b> is your hero. Once he is on the field, <b>Rally</b> heals and hurries everyone. <b>Send all</b> does what it says, for the impatient.', target: '.rally' },
    { mood: 'smug', text: 'Your target is the enemy <b>Keep</b>. Knock it down and the whole town folds like a wet scone: instant <b>three stars</b> and all the plunder. Lose, and you still keep a consolation prize.' },
  ],
  spells: [{ mood: 'shock', target: '.spells', text: 'You brought mana! Those glowing orbs are <b>spells</b>: tap one, then tap the battlefield. Mana does not refill mid-fight, so spend it like it belongs to someone else. It usually does.' }],
  spire: [
    { mood: 'shock', text: 'An <b>Arcane Spire</b>! Tap the floating <b>crystal</b> for mana. Tap it a lot. Now and then it surges for six times as much. I shall not judge the clicking.' },
    { mood: 'happy', target: '[data-nav="magic"]', text: 'Mana buys <b>Enchantments</b>, permanent upgrades for your whole realm, and powers <b>battle spells</b>. The <b>Magic</b> button has everything.' },
  ],
  goblin: [{ mood: 'shock', text: 'A <b>loot goblin</b>! Tap him before he escapes: eight taps and his sack is yours. He stole it from other kingdoms, so it is practically recycling.' }],
  merchant: [{ mood: 'wink', text: 'A <b>travelling merchant</b> has parked outside the gate. Tap his cart, watch a short ad and he hands over supplies. He calls it a gift. I call it marketing.' }],
  keep2: [{ mood: 'happy', text: 'Keep level 2! New toys in the catalogue: <b>Market</b>, <b>Tavern</b>, <b>Arcane Spire</b> and <b>Moon Lanterns</b>. Better yet, every building can now be upgraded up to the Keep’s level.' }],
  move: [{ mood: 'wink', text: 'A word on town planning: <b>press and hold</b> any building to pick it up and move it. There is also a Move button, if you enjoy buttons.' }],
  market: [{ mood: 'smug', text: 'The <b>Market</b> earns gold and swaps one resource for another. The exchange rates are terrible. That is how you know it is a real market.' }],
  smith: [{ mood: 'happy', text: 'The <b>Blacksmith</b> upgrades each kind of troop: +20% health and damage per level. Sharper pitchforks, angrier peasants.' }],
  tavern: [{ mood: 'wink', text: 'A <b>Tavern</b>! It raises happiness, and so do <b>decorations</b>. Happy citizens work harder and have more children, which sounds exhausting.' }],
  defeat: [{ mood: 'shock', text: 'A tactical... rearrangement. Train more troops, upgrade them at the Blacksmith, fill up on mana, or hire mercenaries. And do let the King use <b>Rally</b> next time.' }],
  final: [{ mood: 'shock', text: 'Sire. Every land you ever conquered has united against you, led by <b>Barnaby</b>. The turnip farmer. He kept a list. Prepare <i>everything</i> before the final battle.' }],
};

/** Everything the advisor knows, readable any time from the handbook button. */
export const HANDBOOK: { title: string; text: string }[] = [
  { title: 'Getting around', text: 'Tap the grass (or use WASD / arrow keys) to walk the King. Drag to orbit the camera, pinch or scroll to zoom. The King collects from every building he strolls past. The walls are solid: use the south gate.' },
  { title: 'Building on the grid', text: 'Open <b>Build</b>, pick a building, then drag its ghost onto free tiles (green fits, red is blocked) and confirm. Press and hold any building, or use its Move button, to relocate it. You have a limited number of builders, and buildings can be upgraded up to your Keep’s level.' },
  { title: 'Resources and storage', text: 'Farms make food, Lumber Camps wood, Quarries stone, Markets gold. Each fills its own little store until you collect it. Storehouses and Keep upgrades raise how much you can hold.' },
  { title: 'Clearing obstacles', text: 'Trees, boulders, giant mushrooms and mana shards sprout on free tiles. Tap one a few times to clear it for wood, stone, food or mana.' },
  { title: 'Citizens, jobs and happiness', text: 'Cottages raise your population limit. Citizens staff your buildings (set workers per building in its panel or under <b>Realm</b>), pay taxes and are recruited as soldiers. Happiness comes from food, taverns, decorations, fair taxes and conquests; happy people work harder and multiply, unhappy ones leave.' },
  { title: 'Army', text: 'A Barracks trains troops, Army Camps house them. Peasants, Archers, Knights, Pony Riders, Hedge Wizards and Catapults unlock as the Barracks levels up. The Blacksmith upgrades each type. Soldiers eat food even while idle.' },
  { title: 'Battles and stars', text: 'Pick a troop card and tap or hold on the grass outside the red ring to deploy. The King is a hero with a <b>Rally</b> that heals and speeds up your troops. Destroy the enemy <b>Keep</b> and the whole town collapses for a three-star victory. If you lose or retreat you keep a share of the plunder for whatever you flattened.' },
  { title: 'Conquest and your walls', text: 'Each ring has three rivals. Conquer all three and the map zooms out to lands roughly ten times bigger, and your village’s walls and outskirts are rebuilt grander: picket fence, palisade, stone ramparts, a moat, marble, and eventually gold. Conquered lands pay tribute to your Keep. The last battle is for the whole Earth.' },
  { title: 'Arcane Spire and mana', text: 'From Keep level 2. Tap the floating crystal (in the village or in the Magic panel) for mana, with a chance of a six-fold surge; apprentices add a slow trickle. Spend mana on eight <b>Enchantments</b> with ten levels each.' },
  { title: 'Battle spells', text: 'Fireball, Mending Mist, Frostbite and Summon Dragon unlock as the Spire levels up. In battle, tap a spell orb and then the battlefield. Mana does not refill during a fight, so top up first.' },
  { title: 'Loot goblin', text: 'Every few minutes a goblin with a sack dashes through the village. Tap him eight times before he escapes to burst the sack.' },
  { title: 'Merchant and Royal Decree', text: 'Both are optional rewards for watching a short ad: the merchant’s cart outside the gate gives supplies, and the Royal Decree doubles all production for ten minutes. Ads can also finish building or training, hire mercenaries, double plunder, revive fallen troops and double what piled up while you were away.' },
  { title: 'Quests and Deeds', text: 'The scroll at the top always shows your next quest and its reward. <b>Deeds</b> are long-term achievements in tiers; claim them for gold and mana.' },
  { title: 'Decorations', text: 'Gardens, Moon Lanterns, a Wishing Fountain and a Royal Statue each add happiness. They can be moved, or sold back for half price.' },
];

/** Line for the moment the walls are rebuilt after a ring of rivals falls. */
export function wallsPage(stage: number, name: string, first: boolean): Page[] {
  const bigger = stage < TIERS.length ? Math.round(TIERS[stage].area / TIERS[stage - 1].area) : 0;
  const pages: Page[] = [{
    mood: 'shock',
    text: `Behold: the <b>${name}</b>! With all three rivals subdued, your realm has outgrown its old fence, so I had the builders redo the walls and tidy up the outskirts.`,
  }];
  if (first) pages.push({ mood: 'wink', text: 'This happens every time you clear a ring of rivals. The next lot are roughly ' + (bigger || 10) + ' times bigger. So are their armies. Do keep up.' });
  return pages;
}

interface Talk { pages: Page[]; i: number; onClose?: () => void }

export class Tutor {
  /** King's distance walked when the current step began (movement step). */
  mark = 0;
  private ring: HTMLElement;
  private bubble: HTMLElement;
  private game: Game;
  private h: TutorHooks;
  private started = false;
  private queue: Talk[] = [];
  private talk: Talk | null = null;
  private shown = '';

  constructor(layer: HTMLElement, game: Game, hooks: TutorHooks) {
    this.game = game;
    this.h = hooks;
    this.ring = document.createElement('div');
    this.ring.className = 'tut-ring';
    this.bubble = document.createElement('div');
    this.bubble.className = 'tut-bubble';
    layer.appendChild(this.ring);
    layer.appendChild(this.bubble);
  }

  /** True while the guided tour still has steps to show. */
  get touring(): boolean { return this.started && this.game.s.tut >= 0; }

  /** Begins (or resumes) the tour for players who have not finished it. */
  start(): void {
    this.started = true;
    if (this.game.s.tut >= 0) this.go(Math.min(this.game.s.tut, TOUR.length - 1));
  }
  restart(): void {
    this.talk = null;
    this.queue = [];
    this.started = true;
    this.go(0);
  }

  private go(i: number): void {
    const g = this.game;
    while (i < TOUR.length && TOUR[i].skip && TOUR[i].skip!(g)) i++;
    if (i >= TOUR.length) { this.finish(); return; }
    g.s.tut = i;
    this.mark = this.h.kingDist();
    this.shown = '';
  }
  private finish(): void {
    this.game.s.tut = -1;
    this.game.s.flags.intro = true;
    this.shown = '';
    this.h.save();
  }

  /** Shows a one-time tip (ignored if seen before). Returns true when it was queued. */
  tipOnce(id: string, onClose?: () => void): boolean {
    const pages = TIPS[id];
    if (!pages || this.game.s.tips[id]) return false;
    // During the tour only battle tips may cut in; the rest wait for the next time the thing happens.
    if (this.touring && !this.h.inBattle()) return false;
    this.game.s.tips[id] = 1;
    this.queue.push({ pages, i: 0, onClose });
    return true;
  }
  /** Says something right away (not remembered). */
  say(pages: Page[], onClose?: () => void): void {
    this.queue.push({ pages, i: 0, onClose });
  }
  get busy(): boolean { return !!this.talk || this.queue.length > 0; }

  /** Buttons in the bubble call this. */
  cmd(c: string): void {
    this.h.sfx('click');
    if (c === 'restart') { this.restart(); return; }
    if (this.talk) {
      if (c === 'skip') this.talk.i = this.talk.pages.length;
      else this.talk.i++;
      if (this.talk.i >= this.talk.pages.length) {
        const done = this.talk.onClose;
        this.talk = null;
        this.shown = '';
        if (done) done();
        this.h.save();
      } else this.shown = '';
      return;
    }
    if (!this.touring) return;
    if (c === 'skip') { this.finish(); return; }
    this.go(this.game.s.tut + 1);
    this.h.save();
  }

  private render(page: Page, key: string, opts: { next: string; skip: string; task: boolean; progress: string }): void {
    if (key !== this.shown) {
      this.shown = key;
      this.bubble.innerHTML = `<div class="tut-toad">${toadSvg(page.mood)}</div>
        <div class="tut-card"><div class="tut-name">Lord Ribbington <small>Royal Advisor</small></div>
          <div class="tut-text">${page.text}</div>
          <div class="tut-btns">${opts.skip ? `<button class="tut-skip" data-act="tut:skip">${opts.skip}</button>` : '<span></span>'}
            <span class="tut-prog">${opts.progress}</span>
            ${opts.task ? `<span class="tut-task">Your turn…</span><button class="tut-skip" data-act="tut:next">Skip step</button>` : `<button class="btn green small" data-act="tut:next">${opts.next}</button>`}
          </div></div>`;
      this.bubble.classList.remove('pop');
      void this.bubble.offsetWidth;
      this.bubble.classList.add('pop', 'show');
      this.h.sfx('ribbit');
    }
    // Spotlight the thing being talked about.
    let rect: { x: number; y: number; w: number; h: number } | null = null;
    if (page.target) {
      for (const el of Array.from(document.querySelectorAll(page.target))) {
        const r = (el as HTMLElement).getBoundingClientRect();
        if (r.width > 2 && r.height > 2) { rect = { x: r.left, y: r.top, w: r.width, h: r.height }; break; }
      }
    } else if (page.spot === 'obstacle') {
      const p = this.h.obstacleSpot();
      if (p) rect = { x: p.x - 34, y: p.y - 40, w: 68, h: 68 };
    }
    if (rect) {
      const pad = 7;
      this.ring.style.cssText = `display:block;left:${rect.x - pad}px;top:${rect.y - pad}px;width:${rect.w + pad * 2}px;height:${rect.h + pad * 2}px`;
    } else {
      this.ring.style.display = 'none';
    }
    const low = rect ? rect.y + rect.h / 2 > window.innerHeight * 0.52 : false;
    const top = low || this.h.placing() || this.h.inBattle();
    this.bubble.classList.toggle('at-top', top);
    this.bubble.classList.toggle('at-bottom', !top);
  }
  private hide(): void {
    if (this.shown === '-') return;
    this.shown = '-';
    this.bubble.classList.remove('show');
    this.ring.style.display = 'none';
  }

  /** Call every frame. */
  update(): void {
    if (!this.started) return;
    if (!this.talk && this.queue.length && (!this.touring || this.h.inBattle())) this.talk = this.queue.shift()!;
    if (this.talk) {
      const t = this.talk;
      const last = t.i >= t.pages.length - 1;
      this.render(t.pages[t.i], 'talk:' + t.i + ':' + t.pages.length + ':' + t.pages[t.i].text.length, {
        next: last ? 'Jolly good' : 'Go on', skip: '', task: false, progress: t.pages.length > 1 ? `${t.i + 1}/${t.pages.length}` : '',
      });
      return;
    }
    if (!this.touring || this.h.inBattle()) { this.hide(); return; }
    const g = this.game;
    const step = TOUR[g.s.tut];
    if (!step) { this.finish(); this.hide(); return; }
    if (step.back) {
      const to = step.back(g, this.h);
      if (to) { this.go(TOUR.findIndex(s => s.id === to)); return; }
    }
    if (step.wait && step.wait(g, this.h, this)) { this.go(g.s.tut + 1); this.h.save(); return; }
    this.render(step, 'tour:' + g.s.tut, {
      next: g.s.tut >= TOUR.length - 1 ? 'To work!' : 'Next', skip: g.s.tut >= TOUR.length - 1 ? '' : 'Skip tour',
      task: !!step.wait, progress: `${g.s.tut + 1}/${TOUR.length}`,
    });
  }
}
