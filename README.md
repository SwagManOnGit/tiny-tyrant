# Tiny Tyrant

A light-hearted, cartoon medieval village-builder and conquest tycoon made as a **YouTube Playable** by Swag Games.

You start with one keep and a muddy field. Build a village, grow and manage its population, raise an army, and
conquer the neighbours. Every tier of rivals is roughly ten times bigger than the last (backyards, hamlets, villages,
towns, baronies, duchies, kingdoms, empires, continents) until everyone you ever conquered unites as the
**United Earth Rebellion** for one last battle over the whole planet.

**Play it:** https://swagmanongit.github.io/tiny-tyrant/

## How it plays

- **Guided tour.** Lord Ribbington, Royal Advisor (a toad in a powdered wig), walks new players through moving, building
  on the grid, collecting, clearing obstacles, citizens, the army and conquest, spotlighting each button as he goes.
  He pops up again with a one-time tip whenever something new appears (first battle, Spire, loot goblin, merchant...),
  and his Handbook button re-reads everything at any time.

- **Third-person village on a tile grid.** You are the King. Tap the ground (or use WASD / arrow keys) to walk, drag to
  orbit the camera, pinch or scroll to zoom. The village is a 26 x 26 grid like a Clash-style home base: open **Build**,
  pick a building, then drag its ghost onto free tiles (green = fits, red = blocked) and confirm. Press and hold any
  building, or use **Move** in its panel, to pick it up and put it somewhere else.
- **Economy.** Four resources (gold, food, wood, stone). Farms, lumber camps, quarries and markets fill up over time
  and the King collects from anything he walks past. Storehouses raise the storage limit, markets trade resources,
  citizens pay taxes and conquered lands pay tribute.
- **Population.** Cottages add housing. Citizens work in your buildings (you choose how many per building), pay
  taxes and are recruited as soldiers. Happiness (taverns, decorations, tax level, food, glory) drives growth and
  productivity; starve or over-tax people and they leave.
- **Things to tap (the incremental side).**
  - **Arcane Spire**: tap its floating crystal (in the world or in its panel) for mana, with a chance of a x6 surge.
    Apprentices add a slow passive trickle.
  - **Enchantments**: eight permanent upgrades bought with mana, ten levels each (output, mana per tap, troop damage
    and health, build speed, storage, taxes, tap rewards).
  - **Obstacles**: trees, boulders, giant mushrooms and mana shards sprout on free tiles; tap them a few times to clear
    them for loot.
  - **Loot goblin**: every few minutes a goblin with a sack runs through the village. Tap it eight times before it
    escapes for a jackpot.
  - **Royal Deeds**: twelve tiered achievements that pay gold and mana.
  - **Decorations**: gardens, moon lanterns, a wishing fountain and a royal statue add happiness.
- **Warfare.** Six troop types (peasants, archers, knights, pony riders, hedge wizards, catapults) plus the King as
  a hero with a Rally ability. Pick a troop and tap or hold on the battlefield to deploy outside the red zone.
  Four **battle spells** cost mana: Fireball, Mending Mist, Frostbite and Summon Dragon. Bring down the enemy **Keep**
  and the whole town collapses with it: an instant three-star victory. A lost or abandoned attack still earns stars
  and a share of plunder for what was flattened. The Blacksmith upgrades troops.
- **Conquest map.** 27 territories in 9 tiers plus the final battle. Clearing a tier zooms the map out.
- **Walls that grow with the realm.** Every time all three rivals of a tier fall, the defences and the land outside
  the gate are rebuilt: picket fence, timber palisade, watchtowers, stone ramparts, a towered curtain wall, a moat
  with a drawbridge, marble, crystal-topped towers and finally gold; fields, cottages, lamps, statues, obelisks and
  a triumphal arch fill in the outskirts.
- **Rewarded ads** (the only monetisation Playables allow), all optional:
  2x production decree, travelling merchant gift, finish building, finish training, hire mercenaries for a battle,
  double the plunder, revive fallen troops, double offline earnings.
  Outside YouTube a short placeholder stands in for the ad so every reward can be tested.

## Develop

```bash
npm install
npm run dev        # http://localhost:5175
npm run build      # type-check + production build into dist/
npm run bundle     # build + tiny-tyrant-playable.zip for the Playables Developer Portal
npm run balance    # headless: plays every battle with the army a player should have at that point
npm run pacing     # headless: a greedy bot plays the whole campaign and prints the timeline
```

In dev builds `window.__tt` exposes helpers for testing: `__tt.give(1e6)`, `__tt.ff(600)` (fast-forward seconds),
`__tt.sim(5)` (simulate attacking territory 5 with the current army), `__tt.startBattle(27, false)`.
Add `?slot=name` to the dev URL to play on a separate local save (handy for testing without touching a real one).

## Layout

| File | What it holds |
| --- | --- |
| `src/data.ts` | Buildings, troops, territories, quests, every balance formula |
| `src/state.ts` | Economy, population, happiness, training, quests, saves (no DOM, no three.js) |
| `src/sim.ts` | Battle simulation (pure logic, runs headless for balancing) |
| `src/models.ts` | Detailed cartoon models built from primitives (baked shading, ink outlines, glow halos) |
| `src/village.ts` | Third-person village: tile grid, placement and move mode, obstacles, crystal clicker, loot goblin |
| `src/battleview.ts` | Battle rendering and troop deployment |
| `src/map.ts` | SVG conquest map |
| `src/ui.ts`, `src/style.css` | HUD, panels, battle HUD, results, ad prompts |
| `src/tutorial.ts` | Lord Ribbington: guided tour, one-time tips, handbook |
| `src/audio.ts` | Synthesised music and sound effects (no audio files) |
| `src/sdk.ts` | YouTube Playables SDK wrapper with local fallbacks |

## YouTube Playables compliance

- SDK script is the first script in `index.html`; `firstFrameReady` then `gameReady` are sent once the first frame is drawn.
- Saves only through `ytgame.game.saveData` / `loadData` (localStorage fallback outside YouTube), well under 3 MB.
- Pause and resume only through `ytgame.system.onPause` / `onResume`; no Page Visibility API.
- Audio follows `isAudioEnabled` / `onAudioEnabledChange`; there is no in-game mute button.
- No external requests: both fonts are bundled, sound is synthesised, models and textures are generated in code.
- Bundle: about 800 KB in 6 files, largest file (three.js) 485 KB, relative paths only.
- Works from tall phones to ultra-wide strips; touch, mouse and keyboard; Esc closes panels.
- `ytgame.engagement.sendScore` is sent after every battle.
