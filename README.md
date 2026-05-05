# WoopWoop

WoopWoop is being reworked into a browser-based tower defense game.

The current build is an early tower defense prototype:

- Players sign in with Firebase email/password, or use offline mode when Firebase
  config is missing.
- Players can walk around the main lobby with WASD.
- The lobby has queue boxes for **Single Player** and **Duos**.
- Single player starts a tower defense test round.
- Duos start once two players are waiting in the duo queue.
- Enemies move tile-to-tile along a grid path and damage the base when they
  reach the end.
- Players carry a selected tower in front of them and click to place it.
- Towers cannot overlap the path, base, or another tower hitbox.
- Towers automatically target enemies in range, damage them, and kills award
  money for more towers.
- The round is lost when base HP reaches 0.

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

For early local testing only, you can use these lobby rules:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        "players": {
          "$uid": {
            ".write": "auth != null && auth.uid == $uid",
            ".validate": "!newData.exists() || (newData.hasChildren(['name','x','y','facingX','facingY','moving','step','scene','lastSeen']) && newData.child('name').isString() && newData.child('name').val().length <= 18 && newData.child('x').isNumber() && newData.child('y').isNumber() && newData.child('facingX').isNumber() && newData.child('facingY').isNumber() && newData.child('moving').isBoolean() && newData.child('step').isNumber() && newData.child('scene').isString() && (newData.child('scene').val() == 'lobby' || newData.child('scene').val() == 'towerDefense'))"
          }
        },
        "queues": {
          "$mode": {
            ".validate": "$mode == 'single' || $mode == 'duo'",
            "$uid": {
              ".write": "auth != null && auth.uid == $uid",
              ".validate": "!newData.exists() || (newData.hasChildren(['name','queuedAt']) && newData.child('name').isString() && newData.child('name').val().length <= 18)"
            }
          }
        }
      }
    }
  }
}
```

These rules intentionally allow deletes (`!newData.exists()`) so the client can
clean up a player's lobby and queue records when they leave a portal, enter a
match, or disconnect. If you see `Queue cleanup failed: PERMISSION_DENIED` in an
older build, update Firebase with the rules above.

## Controls

- **WASD** - move
- **Shift** - sprint
- **1-5** - select a tower to carry
- **Left click** - place the carried tower in front of the player
- **Escape** - return from the tower defense round to the lobby

Stand inside the Single Player or Duos queue box to join that queue. Leaving the
box leaves the queue.

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

The current tower defense round state is local to each browser, so these tower
and combat features do not add any new Firebase Realtime Database rules yet.

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
