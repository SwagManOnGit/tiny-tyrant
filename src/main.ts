import './style.css';
import { Sound } from './audio';
import { BattleView } from './battleview';
import { BTYPES, BUILDINGS, FINAL_ID, TERRITORIES, TTYPES, isDecor } from './data';
import { Gfx } from './gfx';
import { TEAM, WALL_NAMES, buildingMesh, unitMesh } from './models';
import * as sdk from './sdk';
import { Sim, runHeadless } from './sim';
import { Game, SaveData } from './state';
import { Tutor, wallsPage } from './tutorial';
import { UI } from './ui';
import { VillageView } from './village';

async function boot(): Promise<void> {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const app = document.getElementById('app') as HTMLElement;
  const gfx = new Gfx(canvas);

  // Saves only ever go through the SDK wrapper (YouTube cloud save inside Playables, localStorage elsewhere).
  let save: SaveData | null = null;
  try {
    const raw = await sdk.loadData();
    if (raw) save = JSON.parse(raw) as SaveData;
  } catch { save = null; }
  const hadSave = !!save;
  const game = new Game(save);
  let offline: ReturnType<Game['offline']> | null = null;
  if (save && save.lastSeen) {
    const away = (Date.now() - save.lastSeen) / 1000;
    if (away > 90) offline = game.offline(away);
  }

  const thumbItems: { key: string; obj: ReturnType<typeof buildingMesh> | ReturnType<typeof unitMesh>; yaw?: number }[] = [];
  for (const t of BTYPES) {
    for (const lv of t === 'keep' ? [1, 2, 3, 6, 9] : isDecor(t) ? [1] : [1, 4, 7]) thumbItems.push({ key: `b:${t}:${lv}`, obj: buildingMesh(t, lv) });
  }
  for (const t of [...TTYPES, 'king', 'merchant', 'goblin'] as const) thumbItems.push({ key: 'u:' + t, obj: unitMesh(t, t === 'merchant' || t === 'goblin' ? 0 : TEAM.player), yaw: 0.5 });
  const thumbs = gfx.thumbs(thumbItems);

  const sound = new Sound();
  let battle: BattleView | null = null;
  let battleTerr = -1;
  let tierBefore = 0;
  let started = false;
  let paused = false;
  let fullWarn = 0;
  let trainSfx = 0;

  const persist = () => { void sdk.saveData(game.serialize()); };

  const ui = new UI(app, game, thumbs, {
    ad: async kind => {
      const ok = await sdk.requestRewardedAd(kind);
      if (ok) persist();
      return ok;
    },
    startBattle: (terr, mercs) => startBattle(terr, mercs),
    sfx: name => sound.sfx(name),
    save: persist,
    reset: () => {
      village.cancelPlace();
      game.reset();
      persist();
      ui.toast('A fresh kingdom. Try not to lose this one.', 'good');
      tutor.restart();
    },
    place: type => { village.beginPlace(type); },
    move: id => { if (village.beginMove(id)) sound.sfx('open'); },
    placeOk: () => { if (village.confirmPlace()) persist(); },
    placeCancel: () => village.cancelPlace(),
    crystalFx: () => village.crystalFx(),
  });
  ui.bindMapClicks();
  sdk.setFallbackRewardedAd(() => ui.fakeAd());

  const village = new VillageView(gfx, game, ui.labels, {
    pickBuilding: b => { sound.sfx('click'); ui.openBuilding(b); },
    pickMerchant: () => { sound.sfx('click'); ui.openMerchant(); },
    float: (x, y, html, cls) => ui.float(x, y, html, cls),
    sfx: name => sound.sfx(name),
    toast: (html, kind) => ui.toast(html, kind),
    placing: info => ui.setPlacing(info),
  });

  const tutor = new Tutor(ui.tutorLayer, game, {
    sfx: name => sound.sfx(name),
    panelKind: () => ui.panelKind,
    placing: () => village.placing,
    kingDist: () => village.kingDist,
    obstacleSpot: () => village.obstacleSpot(),
    inBattle: () => !!battle,
    save: persist,
  });
  ui.onTutor = cmd => { if (cmd === 'restart') ui.close(); tutor.cmd(cmd); };

  game.onEvent = e => {
    switch (e.t) {
      case 'built':
        sound.sfx('done');
        if (!isDecor(e.b.type) || e.first) ui.toast(e.first ? `${BUILDINGS[e.b.type].name} built!` : `${BUILDINGS[e.b.type].name} is now level ${e.b.level}!`, 'good');
        if (e.b.type === 'keep') ui.toast('New buildings and higher levels unlocked.', 'good');
        if (e.first && (e.b.type === 'spire' || e.b.type === 'market' || e.b.type === 'smith' || e.b.type === 'tavern')) tutor.tipOnce(e.b.type);
        if (e.b.type === 'keep' && e.b.level === 2) tutor.tipOnce('keep2');
        if (e.first && game.s.stats.built >= 4) tutor.tipOnce('move');
        persist();
        break;
      case 'collect':
        sound.sfx('collect');
        if (!battle) {
          const p = village.screenOf(e.b);
          ui.float(p.x, p.y, ui.gainHtml(e.got));
        }
        break;
      case 'full':
        if (performance.now() > fullWarn) {
          fullWarn = performance.now() + 6000;
          ui.toast('Storage is full! Build or upgrade a Storehouse, or spend some.', 'warn');
        }
        break;
      case 'trained':
        if (performance.now() > trainSfx) { trainSfx = performance.now() + 250; sound.sfx('train'); }
        break;
      case 'quest':
        sound.sfx('quest');
        ui.toast(`Quest done: ${e.text} ${ui.gainHtml(e.reward)}`, 'quest');
        break;
      case 'merchant':
        if (!battle) { ui.toast('A travelling merchant has parked by the gate.', 'good'); tutor.tipOnce('merchant'); }
        break;
      case 'goblin':
        if (e.on && !battle) { sound.sfx('goblin'); ui.toast('A loot goblin is loose in the village! Tap it before it escapes!', 'quest'); tutor.tipOnce('goblin'); }
        else if (!e.on && !e.caught && !battle) ui.toast('The loot goblin got away. He will be back.', '');
        break;
      case 'deed':
        break;
      case 'starving':
        ui.toast('Your people are starving! Build or upgrade Farms.', 'warn');
        break;
    }
  };

  function startBattle(terr: number, mercs: boolean): void {
    if (battle) return;
    village.cancelPlace();
    const mods = game.battleMods();
    const sim = new Sim({
      terr, army: { ...game.s.army }, troopLv: { ...game.s.troopLv }, keep: game.keep,
      mercs: mercs ? game.mercenaries() : null,
      dmgMult: mods.dmg, hpMult: mods.hp, spire: game.spire(),
    });
    battleTerr = terr;
    tierBefore = game.currentTier();
    battle = new BattleView(gfx, sim);
    battle.onSfx = n => sound.sfx(n);
    battle.onHint = t => ui.toast(t, 'warn');
    battle.onCast = id => {
      const ok = game.paySpell(id);
      if (!ok) ui.toast(game.spellBlock(id) || 'Not enough mana', 'warn');
      return ok;
    };
    battle.onDone = finishBattle;
    village.setActive(false);
    ui.startBattleHud(battle);
    sound.music('battle');
    ui.toast(`${TERRITORIES[terr].ruler}: “You and what army?”`);
    // First battle: freeze the fight while the advisor explains how it works.
    const b = battle;
    const resume = () => { if (!tutor.busy) b.paused = false; };
    const one = tutor.tipOnce('battle', resume);
    const two = game.spire() > 0 && tutor.tipOnce('spells', resume);
    if (one || two) b.paused = true;
  }

  function finishBattle(): void {
    if (!battle) return;
    const res = battle.sim.result();
    const got = game.applyBattle({ terr: battleTerr, win: res.win, stars: res.stars, lootFrac: res.lootFrac, lost: res.lost });
    if (!res.win) sound.sfx('defeat');
    sound.music(null);
    ui.showResult(battleTerr, res, got);
    void sdk.sendScore(game.score());
    persist();
  }

  ui.onResultClosed = (terr, win) => {
    if (battle) { battle.dispose(); battle = null; }
    ui.endBattleHud();
    ui.setMode('village');
    village.setActive(true);
    sound.music('village');
    persist();
    if (win && terr === FINAL_ID) { ui.showEnding(); return; }
    const stage = Math.min(9, game.currentTier());
    if (win && stage > tierBefore) {
      // A whole ring of rivals has fallen: show off the rebuilt walls, then the bigger map.
      village.showcase(7);
      tutor.say(wallsPage(stage, WALL_NAMES[stage], stage === 1), () => {
        ui.openMap();
        if (stage === 9) tutor.tipOnce('final');
      });
    } else if (win) ui.openMap();
    else tutor.tipOnce('defeat');
  };

  ui.onTitleStart = () => {
    started = true;
    sound.unlock();
    sound.setEnabled(sdk.isAudioEnabled());
    sound.music('village');
    sound.sfx('quest');
    ui.setMode('village');
    if (game.s.tut >= 0) tutor.start();
    else if (offline && (offline.gains.gold + offline.gains.food + offline.gains.wood + offline.gains.stone) >= 20) ui.showOffline(offline.seconds, offline.gains);
  };
  // Any later gesture re-arms audio if the browser suspended it.
  window.addEventListener('pointerdown', () => { if (started) sound.unlock(); });

  sdk.onAudioEnabledChange(on => sound.setEnabled(on));
  sdk.onPause(() => {
    paused = true;
    sound.pause();
    persist();
  });
  sdk.onResume(() => {
    paused = false;
    last = performance.now();
    sound.resume();
  });

  ui.setMode('title');
  ui.showTitle(hadSave);

  let last = performance.now();
  let uiT = 0;
  let saveT = 0;
  let first = true;
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    if (paused) return;
    if (gfx.resize()) { village.resize(); if (battle) battle.resize(); }
    if (started) game.tick(dt);
    if (battle) { battle.update(dt); battle.render(); }
    else { village.update(dt); village.render(); }
    uiT -= dt;
    if (uiT <= 0) { uiT = 0.2; ui.update(); }
    if (started) tutor.update();
    saveT += dt;
    if (saveT > 20 && started) { saveT = 0; persist(); }
    if (first) {
      first = false;
      document.getElementById('boot')?.remove();
      sdk.firstFrameReady();
      sdk.gameReady();
    }
  };
  requestAnimationFrame(frame);

  if (import.meta.env.DEV) {
    // Console helpers for testing: __tt.game, __tt.give(1e6), __tt.sim(5) ...
    (window as unknown as Record<string, unknown>).__tt = {
      game, ui, village, sound, gfx, tutor,
      get battle() { return battle; },
      give: (n: number) => { game.gain({ gold: n, food: n, wood: n, stone: n }); },
      ff: (sec: number) => { for (let i = 0; i < sec * 4; i++) game.tick(0.25); },
      sim: (terr: number) => runHeadless({ terr, army: { ...game.s.army }, troopLv: { ...game.s.troopLv }, keep: game.keep }),
      startBattle,
    };
  }
}

boot().catch(err => {
  const el = document.querySelector('.boot-sub');
  if (el) el.textContent = 'Something went wrong while loading. Please reload.';
  console.error(err);
});
