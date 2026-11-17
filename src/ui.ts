// DOM user interface: HUD, shop, panels, the mana clicker, battle controls, result screens and ad prompts.
import {
  BOOST_SECONDS, BType, BTYPES, BUILDINGS, BUY_MARKUP, CATS, CRIT_CHANCE, CRIT_MULT, Cost, ENCHANTS, ENCH_MAX, EnchId, MAX_KEEP,
  RES, RES_NAME, Res, SELL_RATE, SPELLS, SpellId, TAXES, TERRITORIES, TIERS, TROOPS, TROOP_MAX_LEVEL, TType, TTYPES,
  baseStorage, buildCost, buildTime, builderCount, campCap, enchantCost, fmt, fmtArea, fmtTime, houseCap, isDecor, keepPop,
  kingStats, loot, manaCap, manaPerMin, maxCount, prodPerMin, researchCost, spellCost, storehouseCap, tavernJoy, tribute,
  troopCost, troopMult, workerSlots, trainSpeed,
} from './data';
import { IC, resIcon } from './icons';
import { earthPercent, mapSvg } from './map';
import { armyPower, enemyPlan, enemyPower } from './sim';
import type { BattleResult, UnitKind } from './sim';
import type { BattleView } from './battleview';
import type { Building, Game } from './state';
import { HANDBOOK, toadSvg } from './tutorial';
import type { PlaceInfo } from './village';

export interface UIHandlers {
  ad(kind: string): Promise<boolean>;
  startBattle(terr: number, mercs: boolean): void;
  sfx(name: string): void;
  save(): void;
  reset(): void;
  place(type: BType): void;
  move(id: number): void;
  placeOk(): void;
  placeCancel(): void;
  crystalFx(): void;
}

interface Panel {
  title: () => string;
  icon: string;
  body: () => string;
  cls?: string;
  kind?: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const SPELL_ICON: Record<SpellId, string> = { fireball: IC.fire, heal: IC.heal, freeze: IC.frost, dragon: IC.dragon };
const short = (n: number) => (n < 10 ? String(Math.round(n * 10) / 10) : fmt(n));

export function visStage(type: string, level: number): number {
  if (type === 'keep') return Math.max(1, level <= 2 ? level : level <= 5 ? 3 : level <= 8 ? 6 : 9);
  return level <= 3 ? 1 : level <= 6 ? 4 : 7;
}

export class UI {
  private game: Game;
  private thumbs: Record<string, string>;
  private h: UIHandlers;
  private hud: HTMLElement;
  private phud: HTMLElement;
  private modal: HTMLElement;
  private bhud: HTMLElement;
  private toasts: HTMLElement;
  private floats: HTMLElement;
  private overlay: HTMLElement;
  labels: HTMLElement;
  private panel: Panel | null = null;
  private panelHtml = '';
  private pointerDown = false;
  private hudCache: Record<string, string> = {};
  private mapTier = 0;
  private mapSeenTier = -1;
  private mercsHired = false;
  private battle: BattleView | null = null;
  private endArmed = 0;
  private result: { terr: number; res: BattleResult; got: Cost; doubled: boolean; revived: boolean } | null = null;
  private offlineGains: Record<Res, number> | null = null;
  private adBusy = false;
  private fakeAdResolve: ((ok: boolean) => void) | null = null;
  private mode: 'village' | 'battle' | 'title' | 'place' = 'title';
  /** Which panel is open ('shop', ...), for the tutorial to follow along. */
  panelKind = '';
  tutorLayer: HTMLElement;
  onTutor: (cmd: string) => void = () => {};
  onTitleStart: () => void = () => {};
  onResultClosed: (terr: number, win: boolean) => void = () => {};

  constructor(root: HTMLElement, game: Game, thumbs: Record<string, string>, handlers: UIHandlers) {
    this.game = game;
    this.thumbs = thumbs;
    this.h = handlers;
    const nav = (act: string, icon: string, label: string, chip = '', cls = '') =>
      `<button class="nav ${cls}" data-act="nav:${act}" data-nav="${act}"><span class="orb">${icon}</span><span class="lbl">${label}</span>${chip ? `<i class="badge" data-chip="${chip}"></i>` : ''}</button>`;
    root.innerHTML = `
      <div id="labels"></div>
      <div id="hud">
        <div class="top">
          <div class="chips">
            ${RES.map(r => `<div class="chip" data-chip="${r}" title="${RES_NAME[r]}">${resIcon(r)}<b></b><small></small></div>`).join('')}
            <button class="chip tap mana" data-chip="mana" data-act="nav:magic" title="Mana">${IC.mana}<b></b><small></small></button>
            <button class="chip tap" data-chip="pop" data-act="nav:realm" title="Population">${IC.pop}<b></b><small></small></button>
            <button class="chip tap" data-chip="joy" data-act="nav:realm" title="Happiness"><span class="face"></span><b></b></button>
          </div>
          <div class="quest" data-chip="quest"></div>
        </div>
        <div class="side">
          <button class="rbtn help" data-act="handbook" title="Lord Ribbington's Handbook">${toadSvg('happy')}</button>
          <button class="rbtn boost" data-act="boost" title="Royal Decree: double production"></button>
          <button class="rbtn collect" data-act="collectall" title="Collect everything">${IC.chest}<span>Collect</span></button>
        </div>
        <div class="bottom">
          ${nav('build', IC.hammer, 'Build')}
          ${nav('army', IC.swords, 'Army', 'army')}
          ${nav('magic', IC.wand, 'Magic')}
          ${nav('realm', IC.crown, 'Realm')}
          ${nav('deeds', IC.deed, 'Deeds', 'deeds')}
          ${nav('map', IC.map, 'Conquer', 'earth', 'go')}
        </div>
      </div>
      <div id="phud"></div>
      <div id="bhud"></div>
      <div id="floats"></div>
      <div id="modal"></div>
      <div id="tutor"></div>
      <div id="toasts"></div>
      <div id="overlay"></div>`;
    const q = (id: string) => root.querySelector('#' + id) as HTMLElement;
    this.hud = q('hud'); this.phud = q('phud'); this.modal = q('modal'); this.bhud = q('bhud'); this.toasts = q('toasts');
    this.floats = q('floats'); this.overlay = q('overlay'); this.labels = q('labels'); this.tutorLayer = q('tutor');

    root.addEventListener('click', e => {
      const el = (e.target as Element).closest('[data-act]') as HTMLElement | null;
      if (!el || el.classList.contains('off')) return;
      this.act(el.dataset.act || '', e as MouseEvent);
    });
    root.addEventListener('pointerdown', () => { this.pointerDown = true; });
    window.addEventListener('pointerup', () => { this.pointerDown = false; });
    window.addEventListener('pointercancel', () => { this.pointerDown = false; });
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (this.mode === 'place') this.h.placeCancel();
        else if (this.panel && !this.result) this.close();
        return;
      }
      if (this.mode === 'place' && e.key === 'Enter') this.h.placeOk();
      if (this.battle && !this.result) {
        const order: UnitKind[] = ['king', ...TTYPES];
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= order.length && this.battle.sim.reserve[order[n - 1]] > 0) { this.battle.selected = order[n - 1]; this.battle.spell = null; this.updateBattle(true); }
        if (e.key === ' ') this.act('rally');
      }
    });
    this.mapTier = Math.min(9, game.currentTier());
    this.mapSeenTier = this.mapTier;
  }

  // ------------------------------------------------------------ helpers

  private thumbOf(type: BType, level: number): string {
    return this.thumbs[`b:${type}:${visStage(type, Math.max(1, level))}`] || this.thumbs[`b:${type}:1`] || '';
  }
  private img(src: string, cls = 'thumb'): string {
    return src ? `<img class="${cls}" src="${src}" alt="" draggable="false">` : `<span class="${cls}"></span>`;
  }
  private cost(c: Cost, check = true): string {
    const parts: string[] = [];
    for (const r of RES) {
      if (!c[r]) continue;
      const lack = check && this.game.s.res[r] < c[r]!;
      parts.push(`<span class="cost${lack ? ' lack' : ''}">${resIcon(r)}${fmt(c[r]!)}</span>`);
    }
    return parts.join('') || '<span class="cost">Free</span>';
  }
  private manaCost(n: number): string {
    return `<span class="cost mana${this.game.s.mana + 1e-6 < n ? ' lack' : ''}">${IC.mana}${fmt(n)}</span>`;
  }
  private adBtn(act: string, label: string, cls = ''): string {
    return `<button class="btn ad ${cls}" data-act="${act}">${IC.ad}<span>${label}</span></button>`;
  }

  toast(html: string, kind = ''): void {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.innerHTML = html;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 3) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }
  float(x: number, y: number, html: string, cls = ''): void {
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.innerHTML = html;
    this.floats.appendChild(el);
    while (this.floats.children.length > 24) this.floats.firstElementChild!.remove();
    setTimeout(() => el.remove(), 1300);
  }
  gainHtml(c: Cost): string {
    return RES.filter(r => (c[r] || 0) >= 1).map(r => `<span class="gain">${resIcon(r)}+${fmt(c[r]!)}</span>`).join('');
  }
  isBusy(): boolean { return !!this.panel || !!this.result || this.overlay.childElementCount > 0; }

  // ------------------------------------------------------------ HUD

  private setChip(key: string, html: string, attr?: string): void {
    const k = attr ? key + '@' + attr : key;
    if (this.hudCache[k] === html) return;
    this.hudCache[k] = html;
    const el = this.hud.querySelector(`[data-chip="${key}"]`) as HTMLElement | null;
    if (!el) return;
    if (attr === 'b') (el.querySelector('b') as HTMLElement).innerHTML = html;
    else if (attr === 'small') (el.querySelector('small') as HTMLElement).innerHTML = html;
    else if (attr === 'face') (el.querySelector('.face') as HTMLElement).innerHTML = html;
    else if (attr === 'class') el.className = html;
    else el.innerHTML = html;
  }

  update(): void {
    const g = this.game, s = g.s;
    const cap = g.cap();
    for (const r of RES) {
      this.setChip(r, fmt(s.res[r]), 'b');
      this.setChip(r, '/' + fmt(cap), 'small');
      this.setChip(r, 'chip' + (s.res[r] >= cap ? ' full' : r === 'food' && s.res.food < 1 ? ' empty' : ''), 'class');
    }
    const spire = g.spire();
    this.setChip('mana', 'chip tap mana' + (spire > 0 ? '' : ' hide') + (spire > 0 && s.mana >= g.manaCap() ? ' full' : ''), 'class');
    this.setChip('mana', fmt(s.mana), 'b');
    this.setChip('mana', '/' + fmt(g.manaCap()), 'small');
    this.setChip('pop', String(Math.floor(s.pop)), 'b');
    this.setChip('pop', '/' + g.popCap(), 'small');
    const joy = g.happiness().value;
    this.setChip('joy', joy >= 65 ? IC.happy : joy >= 40 ? IC.meh : IC.sad, 'face');
    this.setChip('joy', joy + '%', 'b');
    const q = g.quest();
    this.setChip('quest', q ? `${IC.scroll}<span>${esc(q.text)}</span><em>${this.gainHtml(q.reward)}</em>` : `${IC.crown}<span>Earth is yours. Rule wisely.</span>`);
    this.setChip('army', g.armyCap() ? `${g.armyUsed()}/${g.armyCap()}` : '');
    this.setChip('earth', `${g.conqueredCount()}/${TERRITORIES.length}`);
    const ready = g.deedsReady();
    this.setChip('deeds', ready ? String(ready) : '');
    (this.hud.querySelector('[data-nav="magic"]') as HTMLElement).classList.toggle('hide', spire < 1);

    const boost = this.hud.querySelector('.boost') as HTMLElement;
    const bh = s.boost > 0 ? `${IC.bolt}<span>2× ${fmtTime(s.boost)}</span>` : `${IC.bolt}<span>2× ${IC.ad}</span>`;
    if (this.hudCache.boost !== bh) { this.hudCache.boost = bh; boost.innerHTML = bh; boost.classList.toggle('on', s.boost > 0); }
    const pending = s.buildings.filter(b => b.busy <= 0 && g.hasGoods(b)).length;
    (this.hud.querySelector('.collect') as HTMLElement).classList.toggle('hide', pending < 2);

    if (this.panel && !this.pointerDown) this.renderPanel(false);
    if (this.battle) this.updateBattle(false);
  }

  setMode(mode: 'village' | 'battle' | 'title' | 'place'): void {
    this.mode = mode;
    this.hud.style.display = mode === 'village' ? '' : 'none';
    this.bhud.style.display = mode === 'battle' ? '' : 'none';
    this.phud.style.display = mode === 'place' ? '' : 'none';
  }
  /** Called by the village while a building is being placed or moved (null when it ends). */
  setPlacing(info: PlaceInfo | null): void {
    if (!info) {
      this.phud.innerHTML = '';
      if (this.mode === 'place') this.setMode('village');
      return;
    }
    if (this.mode !== 'place') this.setMode('place');
    const d = BUILDINGS[info.type];
    this.phud.innerHTML = `<div class="pbar">
      <div class="pinfo">${this.img(this.thumbOf(info.type, 1), 'tiny')}<div><b>${info.moving ? 'Moving' : 'Placing'} ${d.name}</b>
        <small>${info.valid ? 'Drag it, or tap any free tiles.' : 'Blocked! Find a free spot.'}</small></div></div>
      <div class="pbtns">
        <button class="btn red" data-act="placecancel">${IC.close}<span>Cancel</span></button>
        <button class="btn green ${info.valid ? '' : 'dim'}" data-act="placeok">${IC.check}<span>${info.moving ? 'Put down' : 'Build'}</span>${info.moving ? '' : `<span class="costs">${this.cost(buildCost(info.type, 1))}</span>`}</button>
      </div></div>`;
  }

  // ------------------------------------------------------------ panels

  private open(p: Panel): void {
    this.panel = p;
    this.panelKind = p.kind || 'panel';
    this.panelHtml = '';
    this.renderPanel(true);
    this.h.sfx('open');
  }
  close(): void {
    if (!this.panel) return;
    this.panel = null;
    this.panelKind = '';
    this.modal.innerHTML = '';
    this.modal.classList.remove('show');
  }
  private renderPanel(fresh: boolean): void {
    const p = this.panel;
    if (!p) return;
    const body = p.body();
    const title = p.title();
    const html = title + '\u0000' + body;
    if (html === this.panelHtml) return;
    this.panelHtml = html;
    if (fresh || !this.modal.firstElementChild) {
      this.modal.innerHTML = `<div class="shade" data-act="close"></div>
        <div class="panel ${p.cls || ''}" role="dialog" aria-modal="true">
          <div class="panel-head"><span class="ph-icon">${p.icon}</span><h2></h2><button class="x" data-act="close" aria-label="Close">${IC.close}</button></div>
          <div class="panel-body"></div>
        </div>`;
      this.modal.classList.add('show');
    }
    const bodyEl = this.modal.querySelector('.panel-body') as HTMLElement;
    const top = bodyEl.scrollTop;
    (this.modal.querySelector('h2') as HTMLElement).textContent = title;
    bodyEl.innerHTML = body;
    bodyEl.scrollTop = top;
  }

  /** The shop: pick something, then position it on the village grid. */
  openShop(): void {
    this.open({
      title: () => 'Royal Builders',
      icon: IC.hammer,
      cls: 'wide',
      kind: 'shop',
      body: () => {
        const g = this.game;
        const sections = CATS.map(cat => {
          const cards = BTYPES.filter(t => t !== 'keep' && BUILDINGS[t].cat === cat.id).map(t => {
            const d = BUILDINGS[t];
            const block = g.buildBlock(t);
            const count = g.count(t), max = maxCount(t, g.keep);
            const locked = g.keep < d.unlock;
            return `<button class="card ${block ? 'off' : ''} ${locked ? 'locked' : ''} cat-${cat.id}" data-act="place:${t}">
              ${this.img(this.thumbOf(t, 1))}
              <b>${d.name}</b>
              <span class="count">${locked ? IC.lock : `${count}/${max}`}</span>
              <span class="costs">${this.cost(buildCost(t, 1))}</span>
              <small>${block && block.indexOf('Not enough') < 0 ? block : `${d.size}×${d.size} tiles · ${IC.clock}${fmtTime(buildTime(t, 1) * g.buildSpeed())}`}</small>
            </button>`;
          }).join('');
          return `<h3 class="cat">${cat.name}</h3><div class="grid">${cards}</div>`;
        }).join('');
        return `<p class="hint">Builders free: <b>${g.buildersTotal() - g.buildersBusy()}/${g.buildersTotal()}</b>. Pick a building, then drag it into place on the grid. Press and hold any building to move it later.</p>${sections}`;
      },
    });
  }

  openBuilding(b0: Building): void {
    const id = b0.id;
    this.open({
      title: () => {
        const b = this.game.byId(id);
        if (!b) return '';
        return isDecor(b.type) ? BUILDINGS[b.type].name : `${BUILDINGS[b.type].name} · Level ${Math.max(1, b.level)}`;
      },
      icon: b0.type === 'spire' ? IC.wand : IC.hammer,
      cls: b0.type === 'spire' ? 'wide' : '',
      body: () => {
        const g = this.game;
        const b = g.byId(id);
        if (!b) return '';
        const d = BUILDINGS[b.type];
        const lv = b.level, nx = lv + 1;
        const rows: string[] = [];
        const row = (label: string, now: string, next?: string) =>
          rows.push(`<div class="stat"><span>${label}</span><b>${now}</b>${next && lv < g.maxLevel(b) && lv >= 1 ? `<em>${IC.up}${next}</em>` : ''}</div>`);
        if (d.produces && lv >= 1) {
          const slots = workerSlots(b.type, lv);
          row(`${resIcon(d.produces)} Output`, `${fmt(g.rateOf(b))}/min`, `${fmt(prodPerMin(b.type, nx))}/min max`);
          rows.push(`<div class="stat"><span>${IC.pop} Workers</span>
            <span class="stepper"><button class="mini" data-act="want:${b.id}:-1">−</button><b>${g.staffOf(b)}/${slots}</b><button class="mini" data-act="want:${b.id}:1">+</button></span></div>`);
          row('Stored', `${fmt(b.buf)} / ${fmt(g.bufCap(b))}`);
        }
        if (b.type === 'house') row(`${IC.pop} Housing`, String(houseCap(Math.max(1, lv))), String(houseCap(nx)));
        if (b.type === 'storehouse') row('Storage bonus', '+' + fmt(storehouseCap(Math.max(1, lv))), '+' + fmt(storehouseCap(nx)));
        if (b.type === 'camp') row(`${IC.tent} Army space`, String(campCap(Math.max(1, lv))), String(campCap(nx)));
        if (b.type === 'tavern') row(`${IC.happy} Happiness`, '+' + tavernJoy(Math.max(1, lv)), '+' + tavernJoy(nx));
        if (b.type === 'barracks') row('Training speed', `×${trainSpeed(Math.max(1, lv)).toFixed(2)}`, `×${trainSpeed(nx).toFixed(2)}`);
        if (b.type === 'smith') row('Max troop level', String(Math.min(TROOP_MAX_LEVEL, lv + 1)), String(Math.min(TROOP_MAX_LEVEL, nx + 1)));
        if (b.type === 'spire' && lv >= 1) {
          row(`${IC.mana} Mana store`, fmt(manaCap(lv)), fmt(manaCap(nx)));
          row('Apprentices', `${fmt(manaPerMin(lv))}/min`, `${fmt(manaPerMin(nx))}/min`);
          row('Enchantment limit', `Level ${lv}`, `Level ${Math.min(ENCH_MAX, nx)}`);
        }
        if (d.joy) row(`${IC.happy} Happiness`, '+' + d.joy);
        if (b.type === 'keep') {
          row('Storage', fmt(baseStorage(lv)), fmt(baseStorage(nx)));
          row(`${IC.pop} Housing`, String(keepPop(lv)), String(keepPop(nx)));
          row('Builders', String(builderCount(lv)), String(builderCount(nx)));
          row(`${IC.sword} King`, `${fmt(kingStats(lv).hp)} HP`, `${fmt(kingStats(nx).hp)} HP`);
          const kr = g.keepRate();
          row('Taxes + tribute', RES.filter(r => kr[r] > 0).map(r => `<span class="cost">${resIcon(r)}${fmt(kr[r])}</span>`).join('') + '/min');
        }

        let extra = '';
        if (b.type === 'keep') {
          const wait = RES.filter(r => g.s.keepBuf[r] >= 1);
          extra += `<div class="box"><div class="box-title">Treasury waiting</div><div class="costs">${wait.length ? wait.map(r => `<span class="cost">${resIcon(r)}${fmt(g.s.keepBuf[r])}</span>`).join('') : 'Nothing yet'}</div>
            <button class="btn blue ${wait.length ? '' : 'off'}" data-act="collect:${b.id}">Collect</button></div>`;
          if (lv < MAX_KEEP) {
            const unlocks = BTYPES.filter(t => t !== 'keep' && (BUILDINGS[t].unlock === nx || maxCount(t, nx) > maxCount(t, lv)));
            extra += `<div class="box"><div class="box-title">Level ${nx} unlocks</div><div class="unlocks">${unlocks.map(t => `<span>${this.img(this.thumbOf(t, 1), 'tiny')}${BUILDINGS[t].name}${BUILDINGS[t].unlock === nx ? ' (new)' : ' +' + (maxCount(t, nx) - maxCount(t, lv))}</span>`).join('')}<span>Buildings up to level ${nx}</span></div></div>`;
          }
        }
        if (d.produces && lv >= 1 && b.buf >= 1) extra += `<button class="btn blue" data-act="collect:${b.id}">Collect ${resIcon(d.produces)}${fmt(b.buf)}</button>`;
        if (b.type === 'barracks' && lv >= 1) extra += `<button class="btn blue" data-act="nav:army">${IC.swords}Train troops</button>`;
        if (b.type === 'camp' && lv >= 1) extra += `<button class="btn blue" data-act="nav:army">${IC.swords}View army (${g.armyUsed()}/${g.armyCap()})</button>`;
        if (b.type === 'tavern' && lv >= 1) extra += `<button class="btn blue" data-act="nav:realm">${IC.happy}Happiness: ${g.happiness().value}%</button>`;
        if (b.type === 'smith' && lv >= 1) extra += this.researchHtml();
        if (b.type === 'market' && lv >= 1) extra += this.marketHtml();
        if (b.type === 'spire' && lv >= 1) extra = this.magicHtml() + extra;

        let action: string;
        if (b.busy > 0) {
          const pct = Math.round((1 - b.busy / Math.max(0.01, b.busyTotal)) * 100);
          action = `<div class="box build"><div class="box-title">${lv === 0 ? 'Building' : 'Upgrading to level ' + nx}… ${fmtTime(b.busy)}</div>
            <div class="bar"><i style="width:${pct}%"></i></div>${this.adBtn('finish', 'Finish all building now')}</div>`;
        } else if (isDecor(b.type)) {
          action = `<button class="btn ghost" data-act="demolish:${b.id}">Sell for half price</button>`;
        } else if (lv >= g.maxLevel(b)) {
          action = `<div class="box"><div class="box-title">${b.type === 'keep' ? 'Maximum level reached' : `Upgrade the Keep to raise this past level ${lv}`}</div></div>`;
        } else {
          const block = g.upgradeBlock(b);
          action = `<button class="btn green big ${block ? 'off' : ''}" data-act="upgrade:${b.id}">
            <span>${IC.up}Upgrade to level ${nx}</span><span class="costs">${this.cost(buildCost(b.type, nx))}<span class="cost">${IC.clock}${fmtTime(buildTime(b.type, nx) * g.buildSpeed())}</span></span>
            ${block ? `<small>${block}</small>` : ''}</button>`;
        }
        const move = b.type === 'keep' && false ? '' : `<button class="btn ghost small" data-act="move:${b.id}">${IC.move}<span>Move</span></button>`;
        return `<div class="b-head">${this.img(this.thumbOf(b.type, lv), 'thumb big')}<div><p>${d.desc}</p>${move}</div></div>
          <div class="stats">${rows.join('')}</div>${extra}${action}`;
      },
    });
  }

  /** The clicker and everything mana buys: enchantments and battle spells. */
  private magicHtml(): string {
    const g = this.game, s = g.s;
    const spire = g.spire();
    const cap = g.manaCap();
    const ench = ENCHANTS.map(e => {
      const lv = g.ench(e.id);
      const block = g.enchantBlock(e.id);
      const maxed = lv >= ENCH_MAX;
      return `<div class="rowitem ench">
        <div class="grow"><b>${e.name} <i class="lv">${lv}/${ENCH_MAX}</i></b><small>${e.desc} <span class="pos">+${e.per * lv}${e.unit}</span>${maxed ? '' : ` → +${e.per * (lv + 1)}%`}</small>
          <div class="pips">${Array.from({ length: ENCH_MAX }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
        ${maxed ? `<span class="tag easy">Max</span>` : `<button class="btn violet small ${block ? 'off' : ''}" data-act="ench:${e.id}">${this.manaCost(enchantCost(lv))}${block && block !== 'Not enough mana' ? `<small>${block}</small>` : ''}</button>`}
      </div>`;
    }).join('');
    const spells = SPELLS.map(sp => {
      const open = spire >= sp.unlock;
      return `<div class="rowitem ${open ? '' : 'lockedrow'}"><span class="sicon">${SPELL_ICON[sp.id]}</span><div class="grow"><b>${sp.name}</b><small>${open ? sp.desc : `Unlocks at Spire level ${sp.unlock}`}</small></div>
        ${open ? this.manaCost(spellCost(sp.id, spire)) : IC.lock}</div>`;
    }).join('');
    return `<div class="clicker">
        <button class="crystal" data-act="tapcrystal" aria-label="Tap the crystal">
          <svg viewBox="0 0 100 120" aria-hidden="true"><defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9fbff"/><stop offset=".45" stop-color="#66e6ff"/><stop offset="1" stop-color="#2f7fe0"/></linearGradient></defs>
            <path d="M50 4L88 44 50 116 12 44z" fill="url(#cg)" stroke="#124a80" stroke-width="5" stroke-linejoin="round"/>
            <path d="M12 44h76M50 4L36 44l14 72 14-72z" fill="none" stroke="#124a80" stroke-width="2.500" stroke-linejoin="round" opacity=".7"/>
            <path d="M30 34l10-16" stroke="#fff" stroke-width="5" stroke-linecap="round"/></svg>
        </button>
        <div class="grow">
          <div class="mana-line">${IC.mana}<b>${fmt(s.mana)}</b><small>/ ${fmt(cap)}</small></div>
          <div class="bar mana"><i style="width:${Math.min(100, (s.mana / Math.max(1, cap)) * 100)}%"></i></div>
          <small><b>+${short(g.tapPower())}</b> per tap · <b>+${fmt(manaPerMin(spire))}</b>/min · ${Math.round(CRIT_CHANCE * 100)}% chance of a ×${CRIT_MULT} surge</small>
          <small class="hint">Tap the crystal here, or the one floating over your Spire.</small>
        </div>
      </div>
      <div class="box"><div class="box-title">Enchantments (limit: Spire level ${spire})</div>${ench}</div>
      <div class="box"><div class="box-title">Battle spells</div>${spells}<p class="hint">Cast them during a battle from the spell bar. Mana does not refill mid-fight, so fill up first.</p></div>`;
  }

  private researchHtml(): string {
    const g = this.game;
    return `<div class="box"><div class="box-title">Troop upgrades (max level ${g.maxTroopLevel()})</div>${TTYPES.map(t => {
      const lv = g.s.troopLv[t];
      const block = g.researchBlock(t);
      const maxed = lv >= TROOP_MAX_LEVEL;
      return `<div class="rowitem">${this.img(this.thumbs['u:' + t], 'tiny')}<div class="grow"><b>${TROOPS[t].name}</b><small>Level ${lv}${maxed ? ' (max)' : ` → ${lv + 1}: +20% health and damage`}</small></div>
        ${maxed ? '' : `<button class="btn green small ${block ? 'off' : ''}" data-act="research:${t}"><span class="costs">${this.cost(researchCost(t, lv + 1))}</span>${block && block.indexOf('Not enough') < 0 ? `<small>${block}</small>` : ''}</button>`}</div>`;
    }).join('')}</div>`;
  }

  private marketHtml(): string {
    const g = this.game;
    const lot = g.tradeLot();
    return `<div class="box"><div class="box-title">Trade in lots of ${fmt(lot)}</div>${(['food', 'wood', 'stone'] as const).map(r => {
      const sell = Math.floor(lot * g.sellPrice(r));
      const buy = Math.ceil(lot * SELL_RATE[r] * BUY_MARKUP);
      return `<div class="rowitem">${resIcon(r)}<div class="grow"><b>${RES_NAME[r]}</b><small>You have ${fmt(g.s.res[r])}</small></div>
        <button class="btn blue small ${g.s.res[r] < lot ? 'off' : ''}" data-act="sell:${r}">Sell<span class="cost">${IC.gold}+${fmt(sell)}</span></button>
        <button class="btn green small ${g.s.res.gold < buy ? 'off' : ''}" data-act="buy:${r}">Buy<span class="cost">${IC.gold}${fmt(buy)}</span></button></div>`;
    }).join('')}</div>`;
  }

  /** Everything Lord Ribbington has explained, readable any time. */
  openHandbook(): void {
    this.open({
      title: () => 'Royal Handbook',
      icon: IC.scroll,
      cls: 'wide',
      body: () => `<div class="b-head hb-head"><div class="hb-toad">${toadSvg('smug')}</div><div><p>\u201cEverything I know, written down so I need not repeat myself. Which I will anyway.\u201d</p>
          <button class="btn ghost small" data-act="tut:restart">Replay the guided tour</button></div></div>
        ${HANDBOOK.map(h => `<div class="box"><div class="box-title">${h.title}</div><p class="hb-text">${h.text}</p></div>`).join('')}`,
    });
  }

  openMagic(): void {
    const spire = this.game.ofType('spire')[0];
    if (spire) this.openBuilding(spire);
    else this.toast('Build an Arcane Spire first (Keep level 2).', 'warn');
  }

  openDeeds(): void {
    this.open({
      title: () => 'Royal Deeds',
      icon: IC.deed,
      cls: 'wide',
      body: () => {
        const rows = this.game.deeds().sort((a, b) => Number(b.ready) - Number(a.ready) || Number(a.done) - Number(b.done)).map(d => {
          const pct = d.done ? 100 : Math.min(100, (d.value / d.goal) * 100);
          return `<div class="deed ${d.ready ? 'ready' : ''} ${d.done ? 'done' : ''}">
            <span class="medal">${d.done ? IC.check : IC.deed}<i>${d.tier}/${d.tiers}</i></span>
            <div class="grow"><b>${d.name}</b><small>${d.desc}: ${fmt(Math.min(d.value, d.goal))} / ${fmt(d.goal)}</small><div class="bar"><i style="width:${pct}%"></i></div></div>
            ${d.done ? '<span class="tag easy">Complete</span>' : `<button class="btn gold small ${d.ready ? '' : 'off'}" data-act="deed:${d.id}"><span class="cost">${IC.gold}${fmt(d.reward.gold)}</span><span class="cost mana">${IC.mana}${fmt(d.reward.mana)}</span>${d.ready ? '<small>Claim!</small>' : ''}</button>`}
          </div>`;
        }).join('');
        return `<p class="hint">Great tyrants are remembered for their deeds. Mostly the taxes, but also these.</p>${rows}`;
      },
    });
  }

  openArmy(): void {
    this.open({
      title: () => `Army · ${this.game.armyUsed()}/${this.game.armyCap()} space`,
      icon: IC.swords,
      cls: 'wide',
      body: () => {
        const g = this.game, s = g.s;
        if (g.levelOf('barracks') < 1) {
          return `<p class="hint">You need a finished <b>Barracks</b> to train troops and an <b>Army Camp</b> to house them. Open <b>Build</b> and look under Military.</p>`;
        }
        const used = g.armyUsed() + g.queuedHousing();
        const cap = Math.max(1, g.armyCap());
        const mods = g.battleMods();
        const cards = TTYPES.map(t => {
          const d = TROOPS[t];
          const lv = s.troopLv[t];
          const unlocked = g.troopUnlocked(t);
          const block = g.trainBlock(t);
          const m = troopMult(lv);
          return `<div class="troop ${unlocked ? '' : 'locked'}">
            ${this.img(this.thumbs['u:' + t])}
            <div class="grow"><b>${d.name} <i class="lv">Lv ${lv}</i></b>
              <small>${unlocked ? d.desc : `Unlocks at Barracks level ${d.unlock}`}</small>
              <small class="tstats">${IC.shield}${fmt(d.hp * m * mods.hp)} ${IC.sword}${fmt((d.dmg * m * mods.dmg) / d.cd)}/s ${IC.tent}${d.housing} ${IC.clock}${fmtTime(d.train / trainSpeed(g.levelOf('barracks')))}</small>
              <span class="costs">${this.cost(troopCost(t, lv))}</span></div>
            <div class="tbtns"><span class="have">${s.army[t]}</span>
              <button class="btn green small ${block ? 'off' : ''}" data-act="train:${t}:1">+1</button>
              <button class="btn green small ${block ? 'off' : ''}" data-act="train:${t}:5">+5</button>
              ${s.army[t] > 0 ? `<button class="btn ghost small" data-act="dismiss:${t}" title="Send one home">−</button>` : ''}</div>
          </div>`;
        }).join('');
        const queue = s.queue.length
          ? `<div class="box"><div class="box-title">Training (${s.queue.length}) · next in ${fmtTime(s.queue[0].left / trainSpeed(g.levelOf('barracks')))}</div>
              <div class="queue">${s.queue.slice(0, 14).map((q, i) => `<button class="qitem" data-act="cancelq:${i}" title="Cancel">${this.img(this.thumbs['u:' + q.t], 'tiny')}</button>`).join('')}${s.queue.length > 14 ? `<span>+${s.queue.length - 14}</span>` : ''}</div>
              ${this.adBtn('finishTrain', 'Finish training now')}</div>`
          : '';
        const block = TTYPES.map(t => g.trainBlock(t)).find(b => b && (b.indexOf('camp') >= 0 || b.indexOf('Camp') >= 0 || b.indexOf('citizens') >= 0));
        return `<div class="bar cap"><i style="width:${Math.min(100, (g.armyUsed() / cap) * 100)}%"></i><u style="width:${Math.min(100, (used / cap) * 100)}%"></u></div>
          <p class="hint">Recruits come from your population (${Math.floor(s.pop)} citizens). ${block ? `<b class="warn">${block}.</b>` : 'Soldiers eat food even while idle.'}</p>
          ${queue}<div class="troops">${cards}</div>
          ${g.levelOf('smith') >= 1 ? this.researchHtml() : '<p class="hint">Build a Blacksmith (Keep level 3) to upgrade troops.</p>'}`;
      },
    });
  }

  openRealm(): void {
    this.open({
      title: () => 'Your Realm',
      icon: IC.crown,
      cls: 'wide',
      body: () => {
        const g = this.game, s = g.s;
        const hap = g.happiness();
        const rates = g.rates();
        const jobs = s.buildings.filter(b => BUILDINGS[b.type].produces && b.level >= 1);
        const idle = Math.floor(s.pop) - g.employed();
        const growth = g.growthFactor();
        return `
          <div class="box"><div class="box-title">${IC.globe} Territory</div>
            <div class="stat"><span>Land ruled</span><b>${fmtArea(g.area())}</b></div>
            <div class="stat"><span>Share of Earth</span><b>${earthPercent(g.area())}</b></div>
            <div class="stat"><span>Lands conquered</span><b>${g.conqueredCount()} / ${TERRITORIES.length}</b></div>
            <div class="stat"><span>Battles won / lost</span><b>${s.stats.won} / ${s.stats.lost}</b></div></div>
          <div class="box"><div class="box-title">${IC.pop} Population ${Math.floor(s.pop)} / ${g.popCap()}</div>
            <div class="stat"><span>Working</span><b>${g.employed()}</b></div>
            <div class="stat"><span>Idle (still pay taxes)</span><b>${idle}</b></div>
            <div class="stat"><span>Soldiers</span><b>${g.armyCount()}</b></div>
            <div class="stat"><span>Growth</span><b>${s.pop >= g.popCap() ? 'Housing full: build Cottages' : growth < 0 ? 'People are leaving!' : growth < 1 ? 'Slow' : growth > 1 ? 'Booming' : 'Steady'}</b></div></div>
          <div class="box"><div class="box-title">${hap.value >= 65 ? IC.happy : hap.value >= 40 ? IC.meh : IC.sad} Happiness ${hap.value}%</div>
            ${hap.parts.map(p => `<div class="stat"><span>${p[0]}</span><b class="${p[1] < 0 ? 'neg' : 'pos'}">${p[1] > 0 ? '+' : ''}${p[1]}</b></div>`).join('')}
            <p class="hint">Happy citizens work up to 25% harder and multiply faster. Below 25% they start leaving. Decorations help.</p></div>
          <div class="box"><div class="box-title">${IC.gold} Taxes: ${fmt(g.taxRate())} gold/min</div>
            <div class="seg">${TAXES.map((t, i) => `<button class="${i === s.tax ? 'on' : ''}" data-act="tax:${i}">${t.name}<small>${t.joy > 0 ? '+' : ''}${t.joy} mood</small></button>`).join('')}</div></div>
          <div class="box"><div class="box-title">${IC.hammer} Jobs</div>
            ${jobs.length ? jobs.map(b => `<div class="rowitem">${this.img(this.thumbOf(b.type, b.level), 'tiny')}<div class="grow"><b>${BUILDINGS[b.type].name} Lv ${b.level}</b><small>${resIcon(BUILDINGS[b.type].produces!)}${fmt(g.rateOf(b))}/min</small></div>
              <span class="stepper"><button class="mini" data-act="want:${b.id}:-1">−</button><b>${g.staffOf(b)}/${workerSlots(b.type, b.level)}</b><button class="mini" data-act="want:${b.id}:1">+</button></span></div>`).join('') : '<p class="hint">No workplaces yet. Farms, lumber camps, quarries and markets need workers.</p>'}</div>
          <div class="box"><div class="box-title">Income per minute</div>
            ${RES.map(r => `<div class="stat"><span>${resIcon(r)} ${RES_NAME[r]}</span><b class="${rates[r] < 0 ? 'neg' : 'pos'}">${rates[r] >= 0 ? '+' : '−'}${fmt(Math.abs(rates[r]))}</b></div>`).join('')}
            <p class="hint">Food use: ${fmt(g.foodUse())}/min for citizens and soldiers.</p></div>
          <div class="box"><div class="box-title">Chronicle</div>
            <div class="stat"><span>Crystal taps</span><b>${fmt(s.stats.taps)}</b></div>
            <div class="stat"><span>Obstacles cleared</span><b>${fmt(s.stats.cleared)}</b></div>
            <div class="stat"><span>Loot goblins caught</span><b>${fmt(s.stats.goblins)}</b></div>
            <div class="stat"><span>Spells cast</span><b>${fmt(s.stats.spells)}</b></div>
            <div class="stat"><span>Time on the throne</span><b>${fmtTime(s.stats.play)}</b></div></div>
          <button class="btn ghost" data-act="reset">Start a new kingdom…</button>`;
      },
    });
  }

  private diff(id: number): { label: string; cls: string } {
    const g = this.game;
    const mods = g.battleMods();
    const ratio = (armyPower(g.s.army, g.s.troopLv, g.keep) * Math.sqrt(mods.dmg * mods.hp)) / enemyPower(id);
    if (ratio >= 1.5) return { label: 'Easy', cls: 'easy' };
    if (ratio >= 1.15) return { label: 'Fair fight', cls: 'fair' };
    if (ratio >= 0.9) return { label: 'Hard', cls: 'hard' };
    return { label: 'Deadly', cls: 'deadly' };
  }

  openMap(): void {
    const cur = Math.min(9, this.game.currentTier());
    const zoom = cur > this.mapSeenTier;
    this.mapTier = cur;
    this.mapSeenTier = cur;
    this.open({
      title: () => this.mapTier >= 9 ? 'The Whole Earth' : TIERS[this.mapTier].name,
      icon: IC.map,
      cls: 'wide map' + (zoom ? ' zoom' : ''),
      body: () => {
        const g = this.game;
        const max = Math.min(9, g.currentTier());
        const svg = mapSvg(g, this.mapTier, id => (g.s.conquered[id] ? 'Conquered' : this.diff(id).label));
        const dots = Array.from({ length: 10 }, (_, i) => `<i class="${i < max ? 'done' : i === max ? 'cur' : ''} ${i === this.mapTier ? 'sel' : ''}"></i>`).join('');
        return `<div class="map-top"><span>${IC.globe} You rule <b>${fmtArea(g.area())}</b></span><span><b>${earthPercent(g.area())}</b> of Earth</span></div>
          <div class="map-wrap">${svg}</div>
          <div class="map-nav"><button class="btn ghost small ${this.mapTier <= 0 ? 'off' : ''}" data-act="tier:-1">◀ Smaller</button>
            <span class="dots">${dots}</span>
            <button class="btn ghost small ${this.mapTier >= max ? 'off' : ''}" data-act="tier:1">Bigger ▶</button></div>
          <p class="hint">${this.mapTier >= 9 ? 'Everyone you ever conquered wants a word.' : `Conquer all three ${TIERS[this.mapTier].kind.toLowerCase()} rivals to zoom out to lands roughly ${this.mapTier < 8 ? Math.round(TIERS[this.mapTier + 1].area / TIERS[this.mapTier].area) : 11} times bigger.`}</p>`;
      },
    });
  }

  openTerritory(id: number): void {
    this.mercsHired = false;
    const t = TERRITORIES[id];
    const plan = enemyPlan(id);
    const towers = plan.blds.filter(b => b.type === 'tower').length;
    this.open({
      title: () => t.name,
      icon: IC.flag,
      body: () => {
        const g = this.game, s = g.s;
        const done = s.conquered[id];
        const d = this.diff(id);
        const tr = tribute(id);
        const army = TTYPES.filter(k => s.army[k] > 0).map(k => `<span class="mini-troop">${this.img(this.thumbs['u:' + k], 'tiny')}${s.army[k]}</span>`).join('');
        const mercs = g.mercenaries();
        const spire = g.spire();
        return `<p class="blurb">“${t.blurb}”</p>
          <div class="stats">
            <div class="stat"><span>Ruler</span><b>${t.ruler}</b></div>
            <div class="stat"><span>Size</span><b>${fmtArea(t.area)}</b></div>
            <div class="stat"><span>Defenders</span><b>${plan.units.length} troops, ${towers} towers, ${plan.blds.length} buildings</b></div>
            ${done ? '' : `<div class="stat"><span>Outlook</span><b class="tag ${d.cls}">${d.label}</b></div>`}
            <div class="stat"><span>Plunder</span><b class="costs">${this.cost(loot(id), false)}</b></div>
            <div class="stat"><span>Tribute per minute</span><b class="costs">${this.cost(tr, false)}</b></div>
          </div>
          ${done ? `<div class="box"><div class="box-title">${IC.check} Conquered. Tribute flows to your Keep.</div></div>` : `
          <div class="box"><div class="box-title">Your army (${g.armyUsed()}/${g.armyCap()})</div>
            <div class="queue"><span class="mini-troop">${this.img(this.thumbs['u:king'], 'tiny')}King</span>${army || '<small>No troops. The King will have to do this himself.</small>'}
            ${this.mercsHired ? `<span class="mini-troop merc">${this.img(this.thumbs['u:' + mercs.t], 'tiny')}+${mercs.n}</span>` : ''}</div>
            ${spire > 0 ? `<small>${IC.mana} <b>${fmt(s.mana)}</b> / ${fmt(g.manaCap())} mana for spells${s.mana < g.manaCap() * 0.5 ? '. Tap your crystal to fill up first!' : '.'}</small>` : ''}
            ${this.mercsHired ? '<small class="pos">Mercenaries hired for this battle.</small>' : this.adBtn('mercs', `Hire ${mercs.n} mercenary ${TROOPS[mercs.t].name}s`, 'small')}
          </div>
          <button class="btn red big" data-act="attack:${id}"><span>${IC.swords}${t.final ? 'Begin the final battle' : 'Attack!'}</span><small>Troops that fall are lost. Survivors come home.</small></button>`}
          <button class="btn ghost small" data-act="nav:map">◀ Back to the map</button>`;
      },
    });
  }

  openMerchant(): void {
    this.open({
      title: () => 'Travelling Merchant',
      icon: IC.chest,
      body: () => {
        const g = this.game;
        if (g.s.merchantHere <= 0) return `<p class="blurb">The merchant has trundled off. He will be back.</p>`;
        return `<div class="b-head">${this.img(this.thumbs['u:merchant'], 'thumb big')}<p>“A gift for the mighty ruler! All I ask is that you watch a short message from my sponsors.”</p></div>
          <div class="box"><div class="box-title">Free supplies</div><div class="costs big">${this.cost(g.merchantOffer(), false)}</div></div>
          ${this.adBtn('merchant', 'Watch and claim', 'big')}
          <p class="hint">Leaves in ${fmtTime(g.s.merchantHere)}.</p>`;
      },
    });
  }

  private openBoost(): void {
    this.open({
      title: () => 'Royal Decree',
      icon: IC.bolt,
      body: () => {
        const s = this.game.s;
        return `<p class="blurb">Declare a festival! For ${BOOST_SECONDS / 60} minutes everything your realm produces is doubled: farms, camps, quarries, markets, taxes and tribute. Citizens get +10 happiness too.</p>
          ${s.boost > 0 ? `<div class="box"><div class="box-title">${IC.bolt} Active: ${fmtTime(s.boost)} left</div></div>` : ''}
          ${this.adBtn('boostgo', s.boost > 0 ? `Add ${BOOST_SECONDS / 60} more minutes` : 'Watch and double production', 'big')}`;
      },
    });
  }

  // ------------------------------------------------------------ actions

  private async ad(kind: string): Promise<boolean> {
    if (this.adBusy) return false;
    this.adBusy = true;
    let ok = false;
    try { ok = await this.h.ad(kind); } finally { this.adBusy = false; }
    if (!ok) this.toast('No reward this time. Try again in a moment.', 'warn');
    return ok;
  }

  private act(act: string, ev?: MouseEvent): void {
    const g = this.game;
    const [name, a, b] = act.split(':');
    const fail = (why: string | null) => { if (why) this.toast(why, 'warn'); this.h.sfx('deny'); };
    switch (name) {
      case 'close':
        if (this.result) return;
        this.close();
        break;
      case 'nav':
        this.h.sfx('click');
        if (a === 'army') this.openArmy();
        else if (a === 'realm') this.openRealm();
        else if (a === 'map') this.openMap();
        else if (a === 'build') this.openShop();
        else if (a === 'magic') this.openMagic();
        else if (a === 'deeds') this.openDeeds();
        break;
      case 'place': {
        const block = g.buildBlock(a as BType);
        if (block) { fail(block); break; }
        this.close();
        this.h.place(a as BType);
        break;
      }
      case 'move':
        this.close();
        this.h.move(+a);
        break;
      case 'tut': this.onTutor(a); return;
      case 'handbook': this.h.sfx('click'); this.openHandbook(); break;
      case 'placeok': this.h.placeOk(); break;
      case 'placecancel': this.h.placeCancel(); this.h.sfx('click'); break;
      case 'demolish':
        if (g.demolish(+a)) { this.h.sfx('coin'); this.close(); }
        break;
      case 'upgrade': {
        const bld = g.byId(+a);
        if (!bld) break;
        const block = g.upgradeBlock(bld);
        if (block) { fail(block); break; }
        g.upgrade(bld.id);
        this.h.sfx('build');
        this.close();
        break;
      }
      case 'collect':
        g.collect(+a);
        break;
      case 'collectall':
        g.collectAll();
        break;
      case 'want': {
        const bld = g.byId(+a);
        if (bld) { g.setWant(bld.id, g.staffOf(bld) + +b); this.h.sfx('click'); }
        break;
      }
      case 'tapcrystal': {
        const res = g.tapCrystal();
        if (!res) break;
        const x = ev ? ev.clientX + (Math.random() - 0.5) * 40 : window.innerWidth / 2;
        const y = ev ? ev.clientY - 20 : window.innerHeight / 2;
        if (res.full) { this.float(x, y, 'Mana full', 'small'); this.h.sfx('deny'); break; }
        this.float(x, y, `<span class="gain mana">${IC.mana}+${short(res.gain)}</span>`, res.crit ? 'crit' : 'small');
        this.h.sfx(res.crit ? 'crit' : 'mana');
        this.h.crystalFx();
        break;
      }
      case 'ench': {
        const block = g.enchantBlock(a as EnchId);
        if (block) { fail(block); break; }
        g.enchant(a as EnchId);
        this.h.sfx('quest');
        this.toast(`${ENCHANTS.find(e => e.id === a)!.name} is now level ${g.ench(a as EnchId)}!`, 'quest');
        break;
      }
      case 'deed': {
        const got = g.claimDeed(a);
        if (!got) break;
        this.h.sfx('quest');
        this.toast(`Deed rewarded: <span class="gain">${IC.gold}+${fmt(got.gold)}</span> <span class="gain mana">${IC.mana}+${fmt(got.mana)}</span>`, 'quest');
        break;
      }
      case 'train': {
        const t = a as TType;
        const block = g.trainBlock(t);
        if (block) { fail(block); break; }
        let n = 0;
        for (let i = 0; i < +b; i++) if (g.train(t)) n++;
        if (n) this.h.sfx('train');
        break;
      }
      case 'cancelq': g.cancelTraining(+a); this.h.sfx('click'); break;
      case 'dismiss': g.dismiss(a as TType); this.h.sfx('click'); break;
      case 'research': {
        const t = a as TType;
        const block = g.researchBlock(t);
        if (block) { fail(block); break; }
        g.research(t);
        this.h.sfx('done');
        this.toast(`${TROOPS[t].name} upgraded to level ${g.s.troopLv[t]}!`, 'good');
        break;
      }
      case 'sell': if (g.trade(a as 'food', true)) this.h.sfx('coin'); else fail(null); break;
      case 'buy': if (g.trade(a as 'food', false)) this.h.sfx('coin'); else fail(null); break;
      case 'tax': g.setTax(+a); this.h.sfx('click'); break;
      case 'tier': {
        const max = Math.min(9, g.currentTier());
        this.mapTier = Math.max(0, Math.min(max, this.mapTier + +a));
        (this.modal.querySelector('.panel') as HTMLElement | null)?.classList.remove('zoom');
        this.h.sfx('click');
        break;
      }
      case 'attack': {
        const id = +a;
        if (!g.canAttack(id)) { fail('Conquer the smaller lands first.'); break; }
        const mercs = this.mercsHired;
        this.close();
        this.h.startBattle(id, mercs);
        break;
      }
      case 'boost': this.h.sfx('click'); this.openBoost(); break;
      case 'boostgo':
        void this.ad('boost').then(ok => { if (ok) { g.addBoost(); this.h.sfx('quest'); this.toast(`${IC.bolt} Production doubled!`, 'good'); this.close(); } });
        break;
      case 'merchant':
        void this.ad('merchant').then(ok => {
          if (!ok) return;
          const got = g.takeMerchant();
          this.h.sfx('quest');
          this.toast('Merchant gift: ' + this.gainHtml(got), 'good');
          this.close();
        });
        break;
      case 'finish':
        void this.ad('finish').then(ok => { if (ok) { g.finishBuilds(); g.s.stats.ads++; } });
        break;
      case 'finishTrain':
        void this.ad('train').then(ok => { if (ok) { g.finishTraining(); g.s.stats.ads++; } });
        break;
      case 'mercs':
        void this.ad('mercs').then(ok => { if (ok) { this.mercsHired = true; g.s.stats.ads++; this.h.sfx('horn'); this.panelHtml = ''; } });
        break;
      case 'reset':
        this.open({
          title: () => 'Start over?', icon: IC.crown,
          body: () => `<p class="blurb">This wipes your village, army and every conquest. There is no undo.</p>
            <button class="btn red big" data-act="resetyes">Yes, burn it all down</button><button class="btn ghost" data-act="nav:realm">Never mind</button>`,
        });
        break;
      case 'resetyes': this.close(); this.h.reset(); break;

      // Battle HUD.
      case 'sel':
        if (this.battle) { this.battle.selected = a as UnitKind; this.battle.spell = null; this.h.sfx('click'); this.updateBattle(true); }
        break;
      case 'spell':
        if (this.battle) {
          const id = a as SpellId;
          const block = g.spellBlock(id);
          if (block) { fail(block); break; }
          this.battle.spell = this.battle.spell === id ? null : id;
          this.h.sfx('click');
          this.updateBattle(true);
        }
        break;
      case 'rally':
        if (this.battle && this.battle.sim.rally()) this.updateBattle(true);
        break;
      case 'charge':
        if (this.battle && !this.battle.sim.over) {
          this.battle.sim.autoDeploy(0);
          this.h.sfx('horn');
          this.updateBattle(true);
        }
        break;
      case 'endbattle':
        if (!this.battle) break;
        if (performance.now() < this.endArmed) { this.battle.sim.surrender(); }
        else { this.endArmed = performance.now() + 2500; this.toast('Tap again to retreat. You keep some plunder.', 'warn'); }
        break;

      // Result screen.
      case 'double':
        void this.ad('loot').then(ok => {
          if (!ok || !this.result || this.result.doubled) return;
          this.result.doubled = true;
          g.gain(this.result.got);
          g.s.stats.ads++;
          this.h.sfx('coin');
          this.renderResult();
        });
        break;
      case 'revive':
        void this.ad('revive').then(ok => {
          if (!ok || !this.result || this.result.revived) return;
          this.result.revived = true;
          g.reviveTroops(this.result.res.lost);
          this.h.sfx('horn');
          this.renderResult();
        });
        break;
      case 'continue': {
        const r = this.result;
        this.result = null;
        this.modal.innerHTML = '';
        this.modal.classList.remove('show');
        this.onResultClosed(r ? r.terr : -1, r ? r.res.win : false);
        break;
      }

      // Offline earnings.
      case 'offcollect':
        this.overlay.innerHTML = '';
        g.collectAll();
        break;
      case 'offdouble':
        void this.ad('offline').then(ok => {
          if (!ok) return;
          if (this.offlineGains) g.gain(this.offlineGains);
          g.s.stats.ads++;
          this.overlay.innerHTML = '';
          g.collectAll();
          this.toast('Doubled! ' + this.gainHtml(this.offlineGains || {}), 'good');
        });
        break;
      case 'start':
        this.overlay.innerHTML = '';
        this.onTitleStart();
        break;
      case 'introok':
        this.overlay.innerHTML = '';
        g.s.flags.intro = true;
        this.h.sfx('click');
        break;
      case 'adskip':
        if (this.fakeAdResolve) { this.fakeAdResolve(false); this.fakeAdResolve = null; this.overlay.querySelector('.fakead')?.remove(); }
        break;
    }
    if (this.panel) this.renderPanel(false);
  }

  /** Map regions are SVG, so they get their own click wiring. */
  bindMapClicks(): void {
    this.modal.addEventListener('click', e => {
      const el = (e.target as Element).closest('[data-terr]') as HTMLElement | null;
      if (!el || !this.panel) return;
      this.h.sfx('click');
      this.openTerritory(+(el.getAttribute('data-terr') || 0));
    });
  }

  // ------------------------------------------------------------ battle HUD

  startBattleHud(view: BattleView): void {
    this.battle = view;
    this.endArmed = 0;
    this.hudCache.bhud = '';
    this.setMode('battle');
    this.updateBattle(true);
  }
  endBattleHud(): void {
    this.battle = null;
    this.bhud.innerHTML = '';
  }
  private updateBattle(force: boolean): void {
    const v = this.battle;
    if (!v) return;
    const g = this.game;
    const sim = v.sim;
    const t = TERRITORIES[sim.cfg.terr];
    const order: UnitKind[] = ['king', ...TTYPES];
    const pct = Math.round(sim.pct() * 100);
    const starN = sim.stars();
    const cards = order.filter(k => sim.reserve[k] > 0 || (k !== 'king' && (sim.cfg.army[k as TType] || 0) > 0) || k === 'king').map(k => {
      const n = sim.reserve[k];
      return `<button class="bcard ${v.selected === k && n > 0 && !v.spell ? 'sel' : ''} ${n > 0 ? '' : 'spent'}" data-act="sel:${k}">${this.img(this.thumbs['u:' + k], 'tiny')}<b>${k === 'king' ? (n ? 'King' : '✓') : n}</b></button>`;
    }).join('');
    const spire = g.spire();
    const spells = spire < 1 ? '' : `<div class="spells">${SPELLS.filter(sp => spire >= sp.unlock).map(sp => {
      const cost = spellCost(sp.id, spire);
      return `<button class="scard ${v.spell === sp.id ? 'sel' : ''} ${g.s.mana + 1e-6 < cost ? 'poor' : ''}" data-act="spell:${sp.id}" title="${sp.name}">${SPELL_ICON[sp.id]}<b>${fmt(cost)}</b></button>`;
    }).join('')}</div>`;
    const rallyReady = sim.canRally();
    const armed = v.spell ? SPELLS.find(sp => sp.id === v.spell)! : null;
    const hint = armed ? `${armed.name} armed: tap anywhere on the battlefield to cast it.`
      : sim.reserveLeft() > 0 ? 'Pick a troop, then tap or hold outside the red zone. Topple the Keep for 3 stars.' : 'All troops are in. Topple the Keep and the whole town falls!';
    const html = `
      <div class="btop">
        <div class="chip">${IC.flag}<b>${esc(t.name)}</b></div>
        <div class="chip ${sim.time < 30 ? 'empty' : ''}">${IC.clock}<b>${fmtTime(sim.time)}</b></div>
        <div class="chip stars">${[0, 1, 2].map(i => (i < starN ? IC.star : IC.starOff)).join('')}<b>${pct}%</b></div>
        ${spire > 0 ? `<div class="chip mana">${IC.mana}<b>${fmt(g.s.mana)}</b></div>` : ''}
        <button class="chip tap" data-act="endbattle">${IC.flag}<b>Retreat</b></button>
      </div>
      <div class="bbottom">
        <div class="bhint">${hint}</div>
        ${spells}
        <div class="brow">
          <div class="bcards">${cards}</div>
          <button class="btn gold rally ${rallyReady ? '' : 'off'}" data-act="rally">${IC.horn}<span>${sim.king ? (sim.rallyCd > 0 ? Math.ceil(sim.rallyCd) + 's' : 'Rally!') : 'Rally'}</span></button>
          <button class="btn red charge ${sim.reserveLeft() > 0 ? '' : 'off'}" data-act="charge">${IC.swords}<span>Send all</span></button>
        </div>
      </div>`;
    if (!force && html === this.hudCache.bhud) return;
    if (!force && this.pointerDown) return;
    this.hudCache.bhud = html;
    this.bhud.innerHTML = html;
  }

  showResult(terr: number, res: BattleResult, got: Cost): void {
    this.result = { terr, res, got, doubled: false, revived: false };
    this.panel = null;
    this.renderResult();
    this.modal.classList.add('show');
  }
  private renderResult(): void {
    const r = this.result;
    if (!r) return;
    const t = TERRITORIES[r.terr];
    const lost = TTYPES.filter(k => r.res.lost[k] > 0);
    const anyLoot = RES.some(k => (r.got[k] || 0) > 0);
    const title = r.res.win ? (t.final ? 'Earth Is Yours!' : 'Victory!') : 'Defeat';
    const sub = r.res.win
      ? (t.final ? 'The rebellion is crushed. Barnaby has agreed to go back to turnips.' : `${t.name} now flies your banner and pays tribute.`)
      : `${t.ruler} held on. ${Math.round(r.res.pct * 100)}% destroyed.`;
    this.modal.innerHTML = `<div class="shade"></div>
      <div class="panel result ${r.res.win ? 'win' : 'lose'}" role="dialog" aria-modal="true">
        <div class="res-title">${title}</div>
        <div class="res-stars">${[0, 1, 2].map(i => (i < r.res.stars ? IC.star : IC.starOff)).join('')}</div>
        <p class="blurb">${sub}</p>
        <div class="box"><div class="box-title">${r.res.win ? 'Plunder' : 'Salvaged plunder'}${r.doubled ? ' (doubled!)' : ''}</div>
          <div class="costs big">${anyLoot ? RES.filter(k => (r.got[k] || 0) > 0).map(k => `<span class="cost">${resIcon(k)}+${fmt((r.got[k] || 0) * (r.doubled ? 2 : 1))}</span>`).join('') : 'Nothing this time.'}</div>
          ${anyLoot && !r.doubled ? this.adBtn('double', 'Double the plunder') : ''}</div>
        <div class="box"><div class="box-title">${lost.length ? (r.revived ? 'Losses (all revived!)' : 'Troops lost') : 'No troops lost. Flawless!'}</div>
          ${lost.length ? `<div class="queue">${lost.map(k => `<span class="mini-troop ${r.revived ? 'merc' : 'dead'}">${this.img(this.thumbs['u:' + k], 'tiny')}${r.revived ? '+' : '−'}${r.res.lost[k]}</span>`).join('')}</div>` : ''}
          ${lost.length && !r.revived ? this.adBtn('revive', 'Field medics: revive them all') : ''}</div>
        <button class="btn green big" data-act="continue">${r.res.win ? 'Onwards!' : 'Back to the village'}</button>
      </div>`;
  }

  // ------------------------------------------------------------ overlays

  showTitle(hasSave: boolean): void {
    this.overlay.innerHTML = `<button class="title" data-act="start">
      <div class="title-crown">${IC.crown}</div>
      <div class="title-logo"><span class="t1">Tiny</span><span class="t2">Tyrant</span></div>
      <div class="title-sub">Build a village. Raise an army. Meddle with magic.<br>Conquer the neighbours, then everything else.</div>
      <div class="title-go">${hasSave ? 'Continue your reign' : 'Begin your reign'}</div>
      <div class="title-foot">A Swag Games Playable</div>
    </button>`;
  }
  showOffline(seconds: number, gains: Record<Res, number>): void {
    this.offlineGains = gains;
    this.overlay.innerHTML = `<div class="shade"></div><div class="panel intro">
      <h2>Welcome back, Sire</h2>
      <p class="blurb">You were away for ${fmtTime(seconds)}. The realm kept working without you (mostly).</p>
      <div class="box"><div class="box-title">Waiting in your buildings</div><div class="costs big">${this.cost(gains, false)}</div></div>
      ${this.adBtn('offdouble', 'Collect double', 'big')}
      <button class="btn green big" data-act="offcollect">Collect</button></div>`;
  }
  showEnding(): void {
    const g = this.game;
    this.overlay.innerHTML = `<div class="shade"></div><div class="panel intro result win">
      <div class="res-title">Supreme Ruler of Earth</div>
      <div class="res-stars">${IC.crown}${IC.globe}${IC.crown}</div>
      <p class="blurb">From one weedy field to ${fmtArea(g.area())}. Every turnip on the planet is now legally yours.</p>
      <div class="stats"><div class="stat"><span>Battles won</span><b>${g.s.stats.won}</b></div>
        <div class="stat"><span>Time on the throne</span><b>${fmtTime(g.s.stats.play)}</b></div>
        <div class="stat"><span>Citizens</span><b>${Math.floor(g.s.pop)}</b></div></div>
      <button class="btn green big" data-act="introok">Keep ruling</button></div>`;
  }

  /** Stand-in for a rewarded ad when the game runs outside YouTube (local dev, GitHub Pages). */
  fakeAd(): Promise<boolean> {
    return new Promise(resolve => {
      this.fakeAdResolve = resolve;
      const el = document.createElement('div');
      el.className = 'fakead';
      el.innerHTML = `<div class="fakead-box"><div class="fakead-tag">${IC.ad} Rewarded ad placeholder</div>
        <p>Inside YouTube Playables a real rewarded ad plays here.</p>
        <div class="bar"><i></i></div><button class="btn ghost small" data-act="adskip">Skip (no reward)</button></div>`;
      this.overlay.appendChild(el);
      const fill = el.querySelector('i') as HTMLElement;
      requestAnimationFrame(() => { fill.style.width = '100%'; });
      setTimeout(() => {
        if (this.fakeAdResolve !== resolve) return;
        this.fakeAdResolve = null;
        el.remove();
        resolve(true);
      }, 2600);
    });
  }
}
