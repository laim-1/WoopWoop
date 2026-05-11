# WoopWoop

WoopWoop is being reworked into a browser-based tower defense game.

The current build is an early tower defense prototype:

- Players sign in with Firebase email/password, or use offline mode when Firebase
  config is missing.
- Players can walk around the main lobby with WASD (or a touch joystick on
  phones).
- The lobby has queue boxes for **Single Player** and **Duos**.
- Single player starts a tower defense test round.
- Duos start once two players are waiting in the duo queue.
- When a queue resolves, a **map picker overlay** opens. In single it's just
  you; in duo the host (lowest UID) picks and the partner sees a waiting card.
- Five maps ship with the game (forest, desert, volcano, moon, city). Each has
  its own path, theme, and decorations.
- Enemies move tile-to-tile along the map's path and damage the base when they
  reach the end.
- Players carry a selected tower in front of them and click to place it. Some
  decorations block placement (trees, cacti, dead trees, lava pools, craters),
  some block sight lines for ground towers (buildings, craters), and buildings
  let you place a tower on the rooftop — those towers become **elevated** and
  shoot over everything.
- Towers automatically target enemies in range, damage them, and kills award
  money for more towers.
- The round is lost when base HP reaches 0.

## Working on WoopWoop (notes for AI agents and contributors)

Read this section before making changes. It explains the owner's working style,
the project workflow, and the mechanics each part of the codebase covers so you
can land changes without breaking sync.

### Talking to the owner

- Keep instructions **short, numbered, and action-oriented**. The owner doesn't
  want long explanations unless they ask for them.
- The owner copies database rules from this README. If you change rules, your
  reply should always end with one line:
  - **"Republish the rules from the README."** if rules changed.
  - **"No rule changes needed."** otherwise.
- Don't ask "should I do X?" unless there is a real branching decision. Default
  to making the change and pushing.
- The owner plays the deployed GitHub Pages build, not the local dev server, so
  every change has to be pushed to `main` to be tested.

### Standard workflow for any change

1. Make the code changes.
2. Run `npm run build` (or at least `tsc`) to make sure it compiles.
3. Run `npm test -- --run` if you touched anything in `src/game/`.
4. Commit and `git push origin main`. The owner does not want a feature branch
   or PR unless they ask for one.
5. GitHub Actions (`.github/workflows/deploy-pages.yml`) auto-deploys `main` to
   `https://laim-1.github.io/WoopWoop/`. The login screen shows the deployed
   commit SHA (see *Build info banner* below) so the owner can confirm.
6. If rules changed, tell the owner exactly: "Republish the rules from the
   README."

### Mechanic inventory (what lives where)

| Area | Files | What it does |
| --- | --- | --- |
| App shell / DOM bootstrap | `src/main.ts` (top of file) | Builds the HTML for the menu, HUD, lobby panel, canvas, touch controls, orientation overlay, and build-info card. |
| Firebase init | `src/firebase.ts` | Reads `VITE_FIREBASE_*` env vars. Exports `auth`, `database`, and `isFirebaseConfigured`. Falls back to a placeholder config so the app shell still loads when env vars are missing (offline mode). |
| Lobby world + players | `src/main.ts` (`updateLocalPlayer`, `subscribeToPlayers`, `syncLocalPlayer`) | Movement, camera follow, presence sync at `rooms/lobby/players/$uid` every `SYNC_INTERVAL_MS`. Players are filtered by scene + matchId before rendering so duo pairs don't see each other. |
| Queueing | `src/main.ts` (`enterQueue`, `leaveQueue`, `resolveDuoQueue`, queue subscriptions) | Single/duo portals are physical boxes in the lobby. Walking inside writes to `rooms/lobby/queues/$mode/$uid`. `resolveDuoQueue` sorts by `queuedAt` then UID, pairs every two entries, and triggers `startMatch("duo", [a, b])`. |
| Match lifecycle | `src/main.ts` (`startMatch`, `returnToLobby`, `coerceMatchStateFromRemote`) | Builds the deterministic `matchId` (`duo-<sortedUids>`), picks the host (lowest UID), creates the RTDB room, attaches `matchSync`, and tears it down on return. |
| Multiplayer sync | `src/game/net/matchSync.ts` | The host runs the simulation in a 50 ms `setInterval`, applies queued input events, and writes `state` + `playerState` to RTDB via a multi-path `update`. Non-hosts mirror RTDB snapshots via `onValue`. |
| Pure simulation | `src/game/simulation.ts` | Stateless reducers and tick advance. Used by both offline mode and the multiplayer host. Has Vitest coverage in `simulation.test.ts`. |
| Towers, enemies | `src/game/constants.ts`, `src/game/types.ts` | Tower specs (cost / range / damage / etc.), enemy templates, base HP and starting money. |
| Maps | `src/game/maps.ts` | Five map definitions (`forest`, `desert`, `volcano`, `moon`, `city`). Each has its own grid, world size, path, base tiles, theme palette, decorations, and derived collision/line-of-sight shapes. `MapDefinition.solidShapes` blocks tower placement, `lineBlockers` blocks ground-tower sight, `elevatorFootprints` (buildings) turns the tower's layer to `"elevated"`. |
| Map selection | `src/main.ts` (`startMatch`, `beginMatch`, `showMapSelectOverlay`, `clearPendingMatch`) and `.map-select-*` in `src/styles.css` | When a queue resolves a `pendingMatch` is staged and the picker is shown. In duo the non-host watches `rooms/matches/$matchId/meta` for the host's `mapId` and joins automatically. |
| Tower placement, shop, wave button | `src/main.ts` (`placeSelectedTower`, `pointerHitsTowerShopPanel`, `requestStartWave`, `drawTowerDefenseHud`) | Locally validates placement, submits a `placeTower` event in duo (or mutates state directly in single/offline). |
| Mobile / touch controls | `src/main.ts` (joystick + sprint handlers, `isTouchDevice`), `src/styles.css` (`.touch-joystick`, `.touch-sprint`, `.orientation-lock`) | Bottom-left analog stick, bottom-right sprint button, portrait-only overlay on phones. Detected via `(pointer: coarse)`. |
| Build info banner | `vite.config.ts`, `src/main.ts` (`renderBuildInfo`), `src/styles.css` (`.build-info`) | Injects `__BUILD_INFO__` (short SHA, commit subject, ISO date) at build time. Shown top-right of the login screen so the owner can verify the deploy. |
| Stale match cleanup | `src/main.ts` (`cleanupStaleMatches`) + RTDB rule on `rooms/matches/$matchId` | Anyone joining the lobby scans `rooms/matches`, removes anything with `meta.createdAt` older than 4 hours. Rule allows the host to delete their own match any time. |
| Deploy | `.github/workflows/deploy-pages.yml` | Push to `main` builds with the Firebase secrets and publishes to GitHub Pages. |

### How duo multiplayer actually syncs (read before touching matchSync)

1. Both clients call `startMatch("duo", [uidA, uidB])` from `resolveDuoQueue`.
2. Both sort the UIDs to derive the same `matchId` and the same `hostId`
   (alphabetically lowest UID is host; this is **deterministic on purpose** —
   don't switch to "first to queue" without solving the queuedAt placeholder
   race for the writer).
3. Only the host calls `ensureMatchRoom`, which uses a **multi-path `update`**
   (not `set`) to create `meta`, `state`, and `playerState`. RTDB rules don't
   cascade upward, so a `set` at the match root would be denied.
4. Both clients call `createMatchSync`. It:
   - Subscribes to the match root (`onValue` on `rooms/matches/$matchId`).
   - Writes presence at `presence/$uid` and registers `onDisconnect` cleanup.
   - Subscribes to `events` (host-side only).
   - Starts the 50 ms host tick.
5. Non-host events (place tower, start wave, switch tower) are written to
   `events/<push key>`. Host reads them, applies them in the next tick, then
   removes only the keys it processed via a multi-path `update({ "events/key": null })`.
6. Host failover only triggers **after** the partner has seen the host's
   presence at least once (see `hostPresenceSeen`). Without this guard you get
   a dual-host race where each client overwrites the other's state every 50 ms.

### Realtime Database rules — the easy way to get them wrong

- Rules **only cascade downward**. If you want to list children at a path, you
  need `.read` at that path, not on the child wildcard. We learned this the
  hard way with `rooms/lobby/queues/$mode` and `rooms/matches`.
- `set()` at a parent path needs `.write` at or above that path. Child rules
  do NOT grant access for a parent `set`. If you need child-rule semantics,
  use `update()` instead.
- `data` / `root` see the database **before** the write. `newData` sees the
  merged result of the write. For rules that need to validate cross-sibling
  values during a creation, use `newData.parent()`.
- RTDB strips `null`, `undefined`, empty objects, and empty arrays. Don't
  validate on optional empty children — see the relaxed `startRound` rule in
  this file. Always assume those keys may be missing in snapshots.
- Don't add `.validate` to `state` or `playerState` unless you want to chase
  spec mismatches every time the schema evolves.

### Common pitfalls

- **`PERMISSION_DENIED` after a code change**: the rules and the live database
  drifted. The READme block is the source of truth — paste it into Firebase
  Console → Realtime Database → Rules → Publish.
- **Partner sees outdated state**: usually means dual-host race (failover fired
  too early) or the host's writes are failing silently. Add a `.then()` /
  `.catch()` to `update(root, ...)` calls when debugging.
- **Tower placement works but enemies don't**: the place-tower event applies
  immediately, but the host's subsequent state writes may be denied. Confirm
  the `state` rule allows the host (look for the `newData.parent()` form).
- **Local dev shows wrong commit SHA**: `vite.config.ts` shells out to `git`
  at build time. Inside a CI image without `.git`, the fallback is `"dev"`.
  GitHub Actions does `actions/checkout@v4` so the SHA shows up correctly in
  production.
- **Adding a new RTDB path**: also add a `.read` rule at that path's listable
  parent if anyone subscribes there, and update `database.rules.json` AND the
  README block. Both files must stay in sync.

### Where the owner plays

- Production: `https://laim-1.github.io/WoopWoop/`
- The login screen's top-right "Latest update" card shows the deployed commit
  SHA, subject, and timestamp. Always glance at it after a push to confirm the
  deploy made it before reporting that something is fixed.

## What you need from Firebase

Send or add these values from your Firebase web app config:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

You can find them in Firebase Console:

1. Open your Firebase project.
2. Go to **Project settings** > **General**.
3. Under **Your apps**, create or select a Web app.
4. Copy the `firebaseConfig` values into a local `.env.local` file using the
   names above. `.env.local` is intentionally ignored by git.

Also enable:

- **Authentication** > **Sign-in method** > **Email/Password**
- **Realtime Database** with a database URL

## Realtime Database rules

The canonical rules file in this repo is **`database.rules.json`** at the project
root. Copy its contents into the Firebase Console under **Realtime Database** >
**Rules** (or deploy with the Firebase CLI), then publish.

They cover:

- **`rooms/lobby`** — per-player lobby position and queue entries (`players`,
  `queues`).
- **`rooms/matches`** — duo match rooms: `meta`, `state`, `playerState`,
  `events` (input queue for the host), and `presence`.

If you see `PERMISSION_DENIED`, `Start failed:`, or `Queue cleanup failed:` in
the game status line, confirm the live rules match the file below.

```json
{
  "rules": {
    "rooms": {
      "lobby": {
        "players": {
          ".read": "auth != null",
          "$playerId": {
            ".write": "auth != null && auth.uid === $playerId"
          }
        },
        "queues": {
          "$mode": {
            ".read": "auth != null",
            "$playerId": {
              ".write": "auth != null && auth.uid === $playerId"
            }
          }
        }
      },
      "matches": {
        ".read": "auth != null",
        "$matchId": {
          ".read": "auth != null",
          ".write": "auth != null && !newData.exists() && data.exists() && (data.child('meta/hostId').val() === auth.uid || (data.child('meta/createdAt').val() != null && now > data.child('meta/createdAt').val() + 14400000))",
          "meta": {
            ".write": "auth != null && (!data.exists() || data.child('hostId').val() === auth.uid)"
          },
          "state": {
            ".write": "auth != null && newData.parent().child('meta/hostId').val() === auth.uid"
          },
          "playerState": {
            ".write": "auth != null && newData.parent().child('meta/hostId').val() === auth.uid"
          },
          "events": {
            "$eventId": {
              ".write": "auth != null && (root.child('rooms/matches/' + $matchId + '/meta/hostId').val() === auth.uid || (newData.exists() && newData.child('playerId').val() === auth.uid))",
              ".validate": "!newData.exists() || (newData.hasChildren(['id', 'playerId', 'type', 'at']) && (newData.child('type').val() === 'startRound' || newData.hasChild('payload')))"
            }
          },
          "presence": {
            "$playerId": {
              ".write": "auth != null && auth.uid === $playerId"
            }
          }
        }
      }
    }
  }
}
```

## Controls

- **WASD** - move
- **Shift** - sprint
- **1-5** - select a tower to carry
- **Left click** - place the carried tower in front of the player
- **Escape** - return from the tower defense round to the lobby

Stand inside the Single Player or Duos queue box to join that queue. Leaving the
box leaves the queue.

## Maps

| Map | Theme | Notes |
| --- | --- | --- |
| Mossglade | Forest | Classic S-curve. Trees block placement, bushes and rocks are visual only. |
| Sunscorch | Desert | Zig-zag path through dunes. Cacti block placement. |
| Cinderpeak | Volcano | Vertical-heavy path. Lava pools and dead trees block placement; ash and vents are visual. |
| Selene Drift | Moon | Long winding path. Craters block placement **and** sight lines for ground towers. |
| Neon Heights | City | 24×14 grid (larger than the screen, you walk around). Buildings block sight lines for ground towers but let you place towers on the rooftop — those become elevated and shoot over everything. |

### Decoration → gameplay rules

| Decoration | Blocks placement | Blocks ground-tower sight | Elevates tower? |
| --- | --- | --- | --- |
| Tree / dead tree / cactus / lava pool | Yes | No | No |
| Crater | Yes | Yes | No |
| Building | No | Yes | Yes — towers fully inside the footprint become `"elevated"` and ignore sight blockers. |
| Rock / bush / dune / vent / star / skull / street light / car | No | No | No |

Elevated towers are drawn with a dashed light ring; the placement ghost turns
blue when the cursor is over a valid rooftop. Sight-blocked targets are simply
ignored when a ground tower picks its next shot — splash damage still applies
from a target that *was* visible.

## Towers

The first five towers are intentionally simple:

| Slot | Tower | Role |
| --- | --- | --- |
| 1 | Dart | Cheap basic single-target damage |
| 2 | Cannon | Slower splash damage |
| 3 | Frost | Low damage plus enemy slow |
| 4 | Sniper | Long range, high damage, slow fire rate |
| 5 | Rapid | Shorter range, fast fire rate |

Tower placement is free-form: there are no build tiles. Placement is valid as
long as the circular tower hitbox does not overlap the enemy path, base tiles,
world edge, or another tower.

In **offline** and **Firebase single player**, the tower defense sim runs
locally in the browser. In **Firebase duos**, the host writes shared `state` /
`playerState` to Realtime Database (see rules above).

## Run locally

```sh
npm install
npm run dev
```

Open the local URL in two browser tabs. Sign in with two different accounts, then
walk both players into the Duos box to start the tower defense round.

## Art assets

Place the title logo at:

```text
public/assets/branding/title-logo.png
```

The app will fall back to text if the logo is missing.

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and build production assets
- `npm run preview` - preview the production build

## Deploy to GitHub Pages

This repo includes a GitHub Actions workflow that builds the Vite app and
publishes the `dist` folder to GitHub Pages.

Before the deploy works, add these repository secrets in GitHub:

1. Go to **Settings** > **Secrets and variables** > **Actions**.
2. Add each Firebase value as a repository secret:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_DATABASE_URL`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
3. Go to **Settings** > **Pages**.
4. Set **Source** to **GitHub Actions**.
5. In Firebase Console, go to **Authentication** > **Settings** > **Authorized
   domains** and add `laim-1.github.io` if it is not already listed.

After those settings are saved, every push to `main` deploys the game. The site
URL will look like:

```text
https://laim-1.github.io/WoopWoop/
```
