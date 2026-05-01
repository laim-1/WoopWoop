# WoopWoop

A tiny top-down multiplayer prototype. Players move around a shared canvas with
WASD and sync their positions through Firebase Realtime Database.

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

- **Authentication** > **Sign-in method** > **Anonymous**
- **Realtime Database** with a database URL

For early local testing only, you can use permissive database rules:

```json
{
  "rules": {
    "rooms": {
      "$roomId": {
        ".read": "auth != null",
        "players": {
          "$uid": {
            ".write": "auth != null && (auth.uid == $uid || !newData.exists())"
          }
        },
        "kicked": {
          "$uid": {
            ".write": "auth != null"
          }
        },
        "chat": {
          "$messageId": {
            ".write": "auth != null"
          }
        },
        "blocks": {
          "$cellId": {
            ".write": "auth != null && ($cellId.matches(/^[0-9]+:[0-9]+$/))",
            ".validate": "!newData.exists() || (newData.hasChildren(['type','placedBy','placedAt']) && newData.child('type').isString() && (newData.child('type').val() == 'woodWall' || newData.child('type').val() == 'stoneWall' || newData.child('type').val() == 'woodFloor' || newData.child('type').val() == 'stoneFloor' || newData.child('type').val() == 'window') && newData.child('placedBy').isString() && newData.child('placedBy').val().length <= 128)"
          }
        },
        "cats": {
          "$catId": {
            ".write": "auth != null",
            ".validate": "!newData.exists() || (newData.hasChildren(['x','y','vx','vy','state','ownerUid','ownerName','createdBy','hue','nextStateAt','zoomiesUntil','lastFedAt','updatedAt']) && newData.child('state').isString() && (newData.child('state').val() == 'idle' || newData.child('state').val() == 'wander' || newData.child('state').val() == 'follow' || newData.child('state').val() == 'zoomies') && newData.child('ownerUid').isString() && newData.child('ownerName').isString() && newData.child('createdBy').isString())"
          }
        }
      }
    },
    "users": {
      "$uid": {
        ".read": "auth != null && auth.uid == $uid",
        "profile": {
          "paintColors": {
            ".write": "auth != null && auth.uid == $uid",
            ".validate": "!newData.exists() || (newData.hasChildren(['body','hands','feet']) && newData.child('body').isString() && newData.child('hands').isString() && newData.child('feet').isString())"
          }
        },
        "ownedCats": {
          "$catId": {
            ".write": "auth != null && auth.uid == $uid",
            ".validate": "!newData.exists() || newData.val() == true"
          }
        }
      }
    }
  }
}
```

## Run locally

```sh
npm install
npm run dev
```

Open the local URL in two browser tabs. Sign in with two different accounts, then
each tab writes its player to `rooms/lobby/players/{uid}`.

## Art assets

Place the title logo at:

```text
public/assets/branding/title-logo.png
```

The current source logo is 1254x900. It can stay that size; the app will scale
it down on the title screen.

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
