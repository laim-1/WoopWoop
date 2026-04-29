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
        "players": {
          "$uid": {
            ".read": "auth != null",
            ".write": "auth != null && auth.uid == $uid"
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

Open the local URL in two browser tabs. Each tab signs in anonymously and writes
its player to `rooms/lobby/players/{uid}`.

## Scripts

- `npm run dev` - start the Vite dev server
- `npm run build` - type-check and build production assets
- `npm run preview` - preview the production build
