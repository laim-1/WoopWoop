import { get, onDisconnect, onValue, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Unsubscribe } from "firebase/database";
import { auth, createFirebaseAccount, database, isFirebaseConfigured, signInFirebaseAccount } from "./firebase";
import { createGameMapRenderer, loadGameMap } from "./map";
import "./styles.css";

type Area = "forest";
type CharacterId = "boybrown" | "girlblonde" | "girlbrown";

type CharacterOption = {
  id: CharacterId;
  label: string;
};

type Player = {
  id: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  moving: boolean;
  step: number;
  area: Area;
  characterId: CharacterId;
  name: string;
  lastSeen?: number | object;
};

type PlayerRecord = Omit<Player, "id">;
type PlayerSnapshot = Partial<PlayerRecord>;

type KickedRecord = {
  kickedAt?: number | object;
  name?: string;
};

type ChatMessage = {
  area?: Area;
  createdAt?: number | object;
  name?: string;
  text?: string;
  uid?: string;
};

type RenderState = {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
};

type UsernameIndexRecord = {
  email: string;
  username: string;
  uid: string;
  createdAt?: number | object;
  lastLoginAt?: number | object;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const assetBase = import.meta.env.BASE_URL;
const gameMap = await loadGameMap(assetBase);
const mapRenderer = createGameMapRenderer(gameMap);
const titleLogoSrc = `${assetBase}assets/branding/title-logo.png`;
const characters: CharacterOption[] = [
  { id: "boybrown", label: "Boy Brown" },
  { id: "girlblonde", label: "Girl Blonde" },
  { id: "girlbrown", label: "Girl Brown" }
];

app.innerHTML = `
  <main class="shell">
    <section class="menu" id="join-menu">
      <img
        class="title-logo"
        src="${titleLogoSrc}"
        alt="WoopWoop"
        onerror="this.hidden = true; this.nextElementSibling.hidden = false;"
      />
      <h1 class="title-fallback" hidden>WoopWoop</h1>
      <p>Sign in with username + password to play.</p>
      <div class="auth-switch" id="auth-switch">
        <button type="button" class="is-active" id="auth-signin-tab">Sign In</button>
        <button type="button" id="auth-create-tab">Create Account</button>
      </div>
      <form class="join-form" id="signin-form">
        <label for="signin-username">Username</label>
        <input
          id="signin-username"
          maxlength="18"
          minlength="1"
          name="signInUsername"
          placeholder="Username"
          required
          autocomplete="nickname"
        />
        <label for="signin-password">Password</label>
        <input
          id="signin-password"
          maxlength="64"
          minlength="4"
          name="signInPassword"
          placeholder="Password"
          required
          type="password"
          autocomplete="current-password"
        />
        <button type="submit">Sign In</button>
      </form>
      <form class="join-form is-hidden" id="create-form">
        <label for="create-username">Username</label>
        <input
          id="create-username"
          maxlength="18"
          minlength="1"
          name="createUsername"
          placeholder="Username"
          required
          autocomplete="nickname"
        />
        <label for="create-email">Email</label>
        <input
          id="create-email"
          maxlength="120"
          minlength="5"
          name="createEmail"
          placeholder="Email"
          required
          type="email"
          autocomplete="email"
        />
        <label for="create-password">Password</label>
        <input
          id="create-password"
          maxlength="64"
          minlength="4"
          name="createPassword"
          placeholder="Password"
          required
          type="password"
          autocomplete="new-password"
        />
        <button type="submit">Create Account</button>
      </form>
      <p class="menu-error" id="menu-error" role="alert"></p>

      <form class="devtools-form" id="devtools-form">
        <label for="devtools-password">Devtools password</label>
        <div class="devtools-form__row">
          <input
            id="devtools-password"
            name="devtoolsPassword"
            placeholder="Password"
            type="password"
            autocomplete="off"
          />
          <button type="submit">Unlock</button>
        </div>
      </form>

      <section class="devtools-panel is-hidden" id="devtools-panel">
        <h2>Devtools</h2>
        <p class="devtools-help" id="devtools-message">Kick stale accounts from the lobby.</p>
        <ul id="devtools-players-list" class="devtools-list"></ul>
      </section>
    </section>

    <section class="hud is-hidden" id="game-hud">
      <div>
        <h1>Main Plaza</h1>
      </div>
      <div class="status" id="status">Connecting...</div>
    </section>

    <aside class="lobby-panel is-hidden" id="lobby-panel">
      <h2>Players <span id="player-count">0</span></h2>
      <ul id="players-list"></ul>
    </aside>

    <section class="chat-panel is-hidden" id="chat-panel">
      <ul id="chat-messages"></ul>
      <form id="chat-form">
        <input id="chat-input" maxlength="120" placeholder="Chat..." autocomplete="off" />
      </form>
    </section>

    <canvas class="is-hidden" id="game" width="960" height="640" aria-label="2D multiplayer game canvas"></canvas>
  </main>
`;

const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
const statusElement = document.querySelector<HTMLDivElement>("#status");
const joinMenuElement = document.querySelector<HTMLElement>("#join-menu");
const signInFormElement = document.querySelector<HTMLFormElement>("#signin-form");
const createFormElement = document.querySelector<HTMLFormElement>("#create-form");
const signInTabElement = document.querySelector<HTMLButtonElement>("#auth-signin-tab");
const createTabElement = document.querySelector<HTMLButtonElement>("#auth-create-tab");
const signInUsernameElement = document.querySelector<HTMLInputElement>("#signin-username");
const signInPasswordElement = document.querySelector<HTMLInputElement>("#signin-password");
const createUsernameElement = document.querySelector<HTMLInputElement>("#create-username");
const createEmailElement = document.querySelector<HTMLInputElement>("#create-email");
const createPasswordElement = document.querySelector<HTMLInputElement>("#create-password");
const menuErrorElement = document.querySelector<HTMLParagraphElement>("#menu-error");
const devtoolsFormElement = document.querySelector<HTMLFormElement>("#devtools-form");
const devtoolsPasswordElement = document.querySelector<HTMLInputElement>("#devtools-password");
const devtoolsPanelElement = document.querySelector<HTMLElement>("#devtools-panel");
const devtoolsMessageElement = document.querySelector<HTMLParagraphElement>("#devtools-message");
const devtoolsPlayersListElement = document.querySelector<HTMLUListElement>("#devtools-players-list");
const gameHudElement = document.querySelector<HTMLElement>("#game-hud");
const lobbyPanelElement = document.querySelector<HTMLElement>("#lobby-panel");
const playerCountElement = document.querySelector<HTMLSpanElement>("#player-count");
const playersListElement = document.querySelector<HTMLUListElement>("#players-list");
const chatPanelElement = document.querySelector<HTMLElement>("#chat-panel");
const chatMessagesElement = document.querySelector<HTMLUListElement>("#chat-messages");
const chatFormElement = document.querySelector<HTMLFormElement>("#chat-form");
const chatInputElement = document.querySelector<HTMLInputElement>("#chat-input");

if (
  !canvasElement ||
  !statusElement ||
  !joinMenuElement ||
  !signInFormElement ||
  !createFormElement ||
  !signInTabElement ||
  !createTabElement ||
  !signInUsernameElement ||
  !signInPasswordElement ||
  !createUsernameElement ||
  !createEmailElement ||
  !createPasswordElement ||
  !menuErrorElement ||
  !devtoolsFormElement ||
  !devtoolsPasswordElement ||
  !devtoolsPanelElement ||
  !devtoolsMessageElement ||
  !devtoolsPlayersListElement ||
  !gameHudElement ||
  !lobbyPanelElement ||
  !playerCountElement ||
  !playersListElement ||
  !chatPanelElement ||
  !chatMessagesElement ||
  !chatFormElement ||
  !chatInputElement
) {
  throw new Error("Missing required game UI element");
}

const renderingContext = canvasElement.getContext("2d");

if (!renderingContext) {
  throw new Error("Could not initialize 2D canvas context");
}

const canvas = canvasElement;
const statusEl = statusElement;
const joinMenu = joinMenuElement;
const signInForm = signInFormElement;
const createForm = createFormElement;
const signInTab = signInTabElement;
const createTab = createTabElement;
const signInUsername = signInUsernameElement;
const signInPassword = signInPasswordElement;
const createUsername = createUsernameElement;
const createEmail = createEmailElement;
const createPassword = createPasswordElement;
const menuError = menuErrorElement;
const devtoolsForm = devtoolsFormElement;
const devtoolsPassword = devtoolsPasswordElement;
const devtoolsPanel = devtoolsPanelElement;
const devtoolsMessage = devtoolsMessageElement;
const devtoolsPlayersList = devtoolsPlayersListElement;
const gameHud = gameHudElement;
const lobbyPanel = lobbyPanelElement;
const playerCount = playerCountElement;
const playersList = playersListElement;
const chatPanel = chatPanelElement;
const chatMessages = chatMessagesElement;
const chatForm = chatFormElement;
const chatInput = chatInputElement;
const context = renderingContext;
context.imageSmoothingEnabled = false;

function resizeCanvasToViewport() {
  const nextWidth = Math.max(1, Math.floor(window.innerWidth));
  const nextHeight = Math.max(1, Math.floor(window.innerHeight));

  if (canvas.width === nextWidth && canvas.height === nextHeight) {
    return;
  }

  canvas.width = nextWidth;
  canvas.height = nextHeight;
}

resizeCanvasToViewport();
window.addEventListener("resize", () => {
  resizeCanvasToViewport();
});

const world = {
  width: gameMap.world.width,
  height: gameMap.world.height,
  playerRadius: 24
};

const DEVTOOLS_PASSWORD = "0310";
const DEFAULT_FACING = { x: 0, y: 1 };
const FOREST_AREA: Area = "forest";
const REMOTE_INTERPOLATION_SPEED = 12;
const SYNC_INTERVAL_MS = 90;
const CHAT_LIMIT = 20;
const CHAT_MAX_LENGTH = 120;
const DEFAULT_CHARACTER_ID: CharacterId = characters[0].id;
const WALK_SPEED = 220;
const RUN_SPEED = 320;
const MOVE_ACCELERATION = 8;
const MOVE_FRICTION = 2.4;
const OFFLINE_PLAYER_ID = "offline-local-player";
const CAMERA_ZOOM = 1.25;
const CAMERA_FOLLOW_SPEED = 10;
const MINIMAP_WIDTH = 220;
const MINIMAP_HEIGHT = 150;
const MINIMAP_MARGIN = 20;

const keys = new Set<string>();
const players = new Map<string, Player>();
const renderedPlayers = new Map<string, Player>();
const renderStates = new Map<string, RenderState>();
const kickedPlayerIds = new Set<string>();
const chatMessagesById = new Map<string, ChatMessage & { id: string }>();
let selectedCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
let localPlayer: Player | null = null;
let localVelocityX = 0;
let localVelocityY = 0;
let lastFrameAt = performance.now();
let lastSyncAt = 0;
let cameraX = world.width / 2;
let cameraY = world.height / 2;
let playersUnsubscribe: Unsubscribe | null = null;
let kickedUnsubscribe: Unsubscribe | null = null;
let chatUnsubscribe: Unsubscribe | null = null;
let animationStarted = false;
let devtoolsUnlocked = false;
let hasJoinedLobby = false;
let spawnPointIndex = 0;

function screenToWorldX(cameraX: number, screenX: number) {
  return cameraX + (screenX - canvas.width / 2) / CAMERA_ZOOM;
}

function screenToWorldY(cameraY: number, screenY: number) {
  return cameraY + (screenY - canvas.height / 2) / CAMERA_ZOOM;
}

function worldToScreenX(cameraX: number, worldX: number) {
  return (worldX - cameraX) * CAMERA_ZOOM + canvas.width / 2;
}

function worldToScreenY(cameraY: number, worldY: number) {
  return (worldY - cameraY) * CAMERA_ZOOM + canvas.height / 2;
}

function getCameraCenter() {
  const fallbackX = world.width / 2;
  const fallbackY = world.height / 2;

  if (!localPlayer) {
    return { x: cameraX || fallbackX, y: cameraY || fallbackY };
  }

  const halfViewWidth = canvas.width / (2 * CAMERA_ZOOM);
  const halfViewHeight = canvas.height / (2 * CAMERA_ZOOM);
  const snapToCameraStep = (value: number) => Math.round(value * CAMERA_ZOOM) / CAMERA_ZOOM;
  return {
    x: snapToCameraStep(clamp(cameraX, halfViewWidth, world.width - halfViewWidth)),
    y: snapToCameraStep(clamp(cameraY, halfViewHeight, world.height - halfViewHeight))
  };
}

function updateCamera(deltaSeconds: number) {
  if (!localPlayer) {
    return;
  }

  const halfViewWidth = canvas.width / (2 * CAMERA_ZOOM);
  const halfViewHeight = canvas.height / (2 * CAMERA_ZOOM);
  const targetX = clamp(localPlayer.x, halfViewWidth, world.width - halfViewWidth);
  const targetY = clamp(localPlayer.y, halfViewHeight, world.height - halfViewHeight);
  const blend = 1 - Math.exp(-CAMERA_FOLLOW_SPEED * deltaSeconds);

  cameraX += (targetX - cameraX) * blend;
  cameraY += (targetY - cameraY) * blend;
}

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) {
    return;
  }

  if (event.code === "Enter" && hasJoinedLobby) {
    chatInput.focus();
    event.preventDefault();
  } else if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
    keys.add(event.code);

    if (event.code.startsWith("Key")) {
      event.preventDefault();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeArea(_area: PlayerSnapshot["area"]): Area {
  return FOREST_AREA;
}

function normalizeCharacterId(characterId: PlayerSnapshot["characterId"]): CharacterId {
  return characters.some((character) => character.id === characterId) ? (characterId as CharacterId) : DEFAULT_CHARACTER_ID;
}

function currentArea(): Area {
  return localPlayer?.area ?? FOREST_AREA;
}

function makePlayer(userId: string, name: string): Player {
  const spawn = mapRenderer.getSpawnPoint(spawnPointIndex);
  spawnPointIndex += 1;
  return {
    id: userId,
    x: spawn.x,
    y: spawn.y,
    facingX: DEFAULT_FACING.x,
    facingY: DEFAULT_FACING.y,
    area: FOREST_AREA,
    moving: false,
    step: 0,
    characterId: selectedCharacterId,
    name
  };
}

function playerRef(playerId: string) {
  return ref(database, `rooms/lobby/players/${playerId}`);
}

function playersRef() {
  return ref(database, "rooms/lobby/players");
}

function chatRef() {
  return ref(database, "rooms/lobby/chat");
}

function chatMessageRef(messageId: string) {
  return ref(database, `rooms/lobby/chat/${messageId}`);
}

function kickedPlayerRef(playerId: string) {
  return ref(database, `rooms/lobby/kicked/${playerId}`);
}

function kickedPlayersRef() {
  return ref(database, "rooms/lobby/kicked");
}

function usernameStoreKey(normalizedUsername: string) {
  return normalizedUsername.replace(/[.#$[\]/]/g, "_");
}

function usernameIndexRef(normalizedUsername: string) {
  return ref(database, `accounts/usernames/${usernameStoreKey(normalizedUsername)}`);
}

async function loadKickedPlayers(required = false) {
  let records: Record<string, KickedRecord> | null = null;

  try {
    const snapshot = await get(kickedPlayersRef());
    records = snapshot.val() as Record<string, KickedRecord> | null;
  } catch (error) {
    if (required) {
      throw error;
    }

    kickedPlayerIds.clear();
    renderPlayersList();
    return;
  }

  kickedPlayerIds.clear();

  if (records) {
    for (const id of Object.keys(records)) {
      kickedPlayerIds.add(id);
    }
  }

  renderPlayersList();
}

function setStatus(message: string, state: "online" | "offline" | "error") {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function showGame() {
  joinMenu.classList.add("is-hidden");
  gameHud.classList.remove("is-hidden");
  lobbyPanel.classList.remove("is-hidden");
  chatPanel.classList.remove("is-hidden");
  canvas.classList.remove("is-hidden");
}

function updateOverlayPanels() {
  chatPanel.classList.toggle("is-hidden", !hasJoinedLobby || !isFirebaseConfigured);
}

function renderPlayersList() {
  const visiblePlayers = [...players.values()].filter((player) => player.area === currentArea());
  const orderedPlayers = visiblePlayers.sort((a, b) => a.name.localeCompare(b.name));
  const kickedPlayers = [...kickedPlayerIds].sort();

  playerCount.textContent = String(orderedPlayers.length);
  playersList.innerHTML = "";
  devtoolsPlayersList.innerHTML = "";

  for (const player of orderedPlayers) {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    const name = document.createElement("span");

    item.className = "player-row";
    swatch.className = "player-swatch";
    name.textContent = player.name;

    item.append(swatch, name);

    if (player.id === localPlayer?.id) {
      const you = document.createElement("span");
      you.className = "player-you";
      you.textContent = "you";
      item.append(you);
    }

    playersList.append(item);

    if (devtoolsUnlocked) {
      const devtoolsItem = document.createElement("li");
      const details = document.createElement("span");
      const playerName = document.createElement("span");
      const playerId = document.createElement("small");
      const kickButton = document.createElement("button");

      devtoolsItem.className = "devtools-row";
      details.className = "devtools-player-details";
      playerName.textContent = player.name;
      playerId.textContent = player.id;
      kickButton.type = "button";
      kickButton.textContent = player.id === localPlayer?.id ? "You" : "Kick";
      kickButton.disabled = player.id === localPlayer?.id;
      kickButton.addEventListener("click", () => {
        void kickPlayer(player.id, player.name);
      });

      details.append(playerName, playerId);
      devtoolsItem.append(details, kickButton);
      devtoolsPlayersList.append(devtoolsItem);
    }
  }

  if (devtoolsUnlocked && orderedPlayers.length > 0 && kickedPlayers.length > 0) {
    const separator = document.createElement("li");
    separator.className = "devtools-empty";
    separator.textContent = "Kicked markers";
    devtoolsPlayersList.append(separator);
  }

  if (devtoolsUnlocked && kickedPlayers.length > 0) {
    for (const kickedPlayerId of kickedPlayers) {
      const kickedItem = document.createElement("li");
      const details = document.createElement("span");
      const label = document.createElement("span");
      const playerId = document.createElement("small");
      const clearButton = document.createElement("button");

      kickedItem.className = "devtools-row devtools-row--kicked";
      details.className = "devtools-player-details";
      label.textContent = "Kicked player";
      playerId.textContent = kickedPlayerId;
      clearButton.type = "button";
      clearButton.textContent = "Unkick";
      clearButton.addEventListener("click", () => {
        void clearKick(kickedPlayerId, kickedPlayerId);
      });

      details.append(label, playerId);
      kickedItem.append(details, clearButton);
      devtoolsPlayersList.append(kickedItem);
    }
  }

  if (devtoolsUnlocked && orderedPlayers.length === 0) {
    const emptyItem = document.createElement("li");
    emptyItem.className = "devtools-empty";
    emptyItem.textContent = kickedPlayers.length === 0 ? "No connected players." : "No active players.";
    devtoolsPlayersList.append(emptyItem);
  }
}

function renderChatMessages() {
  const messagesForArea = [...chatMessagesById.values()]
    .filter((message) => message.area === currentArea())
    .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0))
    .slice(-CHAT_LIMIT);

  chatMessages.innerHTML = "";

  for (const message of messagesForArea) {
    const item = document.createElement("li");
    const name = document.createElement("strong");
    const text = document.createElement("span");

    name.textContent = `${message.name ?? "Player"}: `;
    text.textContent = message.text ?? "";
    item.append(name, text);
    chatMessages.append(item);
  }

  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function subscribeToChat() {
  chatUnsubscribe?.();
  chatUnsubscribe = onValue(
    chatRef(),
    (snapshot) => {
      const records = snapshot.val() as Record<string, ChatMessage> | null;
      chatMessagesById.clear();

      if (records) {
        for (const [id, message] of Object.entries(records)) {
          chatMessagesById.set(id, { id, ...message });
        }
      }

      renderChatMessages();
    },
    (error) => {
      setStatus(`Chat failed: ${error.message}`, "error");
    }
  );
}

async function sendChatMessage() {
  if (!isFirebaseConfigured) {
    return;
  }

  if (!localPlayer) {
    return;
  }

  const text = chatInput.value.trim().slice(0, CHAT_MAX_LENGTH);

  if (!text) {
    return;
  }

  chatInput.value = "";
  await set(chatMessageRef(`${Date.now()}-${localPlayer.id}`), {
    area: localPlayer.area,
    createdAt: serverTimestamp(),
    name: localPlayer.name,
    text,
    uid: localPlayer.id
  } satisfies ChatMessage);
}

async function syncLocalPlayer() {
  if (!localPlayer) {
    return;
  }

  const record: PlayerRecord = {
    x: Math.round(localPlayer.x),
    y: Math.round(localPlayer.y),
    area: localPlayer.area,
    characterId: localPlayer.characterId,
    facingX: localPlayer.facingX,
    facingY: localPlayer.facingY,
    moving: localPlayer.moving,
    step: localPlayer.step,
    name: localPlayer.name,
    lastSeen: serverTimestamp()
  };

  await set(playerRef(localPlayer.id), record);
}

function updateLocalPlayer(deltaSeconds: number) {
  if (!localPlayer) {
    return;
  }

  let dx = 0;
  let dy = 0;

  if (keys.has("KeyW")) dy -= 1;
  if (keys.has("KeyS")) dy += 1;
  if (keys.has("KeyA")) dx -= 1;
  if (keys.has("KeyD")) dx += 1;

  const hasInput = dx !== 0 || dy !== 0;
  const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const speed = sprinting ? RUN_SPEED : WALK_SPEED;
  let targetVelocityX = 0;
  let targetVelocityY = 0;

  if (hasInput) {
    const length = Math.hypot(dx, dy);
    const normalizedX = dx / length;
    const normalizedY = dy / length;
    targetVelocityX = normalizedX * speed;
    targetVelocityY = normalizedY * speed;
  }

  const accelBlend = 1 - Math.exp(-MOVE_ACCELERATION * deltaSeconds);
  localVelocityX += (targetVelocityX - localVelocityX) * accelBlend;
  localVelocityY += (targetVelocityY - localVelocityY) * accelBlend;

  if (!hasInput) {
    const friction = Math.exp(-MOVE_FRICTION * deltaSeconds);
    localVelocityX *= friction;
    localVelocityY *= friction;
  }

  const movementSpeed = Math.hypot(localVelocityX, localVelocityY);
  localPlayer.moving = movementSpeed > 2;

  if (localPlayer.moving) {
    localPlayer.facingX = localVelocityX / movementSpeed;
    localPlayer.facingY = localVelocityY / movementSpeed;
    localPlayer.step += deltaSeconds * (sprinting ? 13 : 9);
  } else {
    localVelocityX = 0;
    localVelocityY = 0;
    localPlayer.step = 0;
  }

  const nextX = localPlayer.x + localVelocityX * deltaSeconds;
  const nextY = localPlayer.y + localVelocityY * deltaSeconds;
  const moved = mapRenderer.moveWithCollision(localPlayer.x, localPlayer.y, nextX, nextY, world.playerRadius);

  localPlayer.x = moved.x;
  localPlayer.y = moved.y;
}

function updateRenderedPlayers(deltaSeconds: number) {
  renderedPlayers.clear();

  for (const [id, player] of players) {
    if (player.area !== currentArea()) {
      renderStates.delete(id);
      continue;
    }

    if (id === localPlayer?.id && localPlayer) {
      renderedPlayers.set(id, localPlayer);
      renderStates.delete(id);
      continue;
    }

    const state = renderStates.get(id) ?? {
      x: player.x,
      y: player.y,
      facingX: player.facingX,
      facingY: player.facingY
    };
    const blend = 1 - Math.exp(-REMOTE_INTERPOLATION_SPEED * deltaSeconds);

    state.x += (player.x - state.x) * blend;
    state.y += (player.y - state.y) * blend;
    state.facingX += (player.facingX - state.facingX) * blend;
    state.facingY += (player.facingY - state.facingY) * blend;
    renderStates.set(id, state);
    renderedPlayers.set(id, {
      ...player,
      x: state.x,
      y: state.y,
      facingX: state.facingX,
      facingY: state.facingY
    });
  }

  for (const id of renderStates.keys()) {
    const player = players.get(id);
    if (!player || player.area !== currentArea()) {
      renderStates.delete(id);
    }
  }
}

function drawPlayer(player: Player, isLocal: boolean) {
  const bodyRadius = world.playerRadius;
  const handRadius = Math.max(5, Math.round(bodyRadius * 0.32));
  const facingLength = Math.max(1, Math.hypot(player.facingX, player.facingY));
  const facingX = player.facingX / facingLength;
  const facingY = player.facingY / facingLength;
  const sideX = -facingY;
  const sideY = facingX;
  const hasLocalInput = keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD");
  const animateArms = isLocal ? hasLocalInput : player.moving;
  const armSwing = animateArms ? Math.sin(player.step * 5.2) : 0;
  const handForward = bodyRadius * 0.66;
  const handSide = bodyRadius * 0.52;
  const handForwardOffsetA = armSwing * bodyRadius * 0.24;
  const handForwardOffsetB = -armSwing * bodyRadius * 0.24;
  const handBaseX = player.x + facingX * handForward;
  const handBaseY = player.y + facingY * handForward;
  const outlineColor = "#323254";
  const outlineWidth = Math.max(2, Math.round(bodyRadius * 0.13));
  const eyeRadius = Math.max(2.2, bodyRadius * 0.16);
  const eyeForward = bodyRadius * 0.34;
  const eyeSide = bodyRadius * 0.38;
  const eyeCenterX = player.x + facingX * eyeForward;
  const eyeCenterY = player.y + facingY * eyeForward;

  context.fillStyle = "rgba(18, 25, 16, 0.35)";
  context.beginPath();
  context.ellipse(player.x, player.y + bodyRadius * 0.72, bodyRadius * 0.9, bodyRadius * 0.36, 0, 0, Math.PI * 2);
  context.fill();

  // Draw hands first so the body overlaps them.
  context.fillStyle = isLocal ? "#d8c9aa" : "#cdbb97";
  context.beginPath();
  context.arc(
    handBaseX + sideX * handSide + facingX * handForwardOffsetA,
    handBaseY + sideY * handSide + facingY * handForwardOffsetA,
    handRadius,
    0,
    Math.PI * 2
  );
  context.fill();
  context.strokeStyle = outlineColor;
  context.lineWidth = outlineWidth;
  context.stroke();

  context.beginPath();
  context.arc(
    handBaseX - sideX * handSide + facingX * handForwardOffsetB,
    handBaseY - sideY * handSide + facingY * handForwardOffsetB,
    handRadius,
    0,
    Math.PI * 2
  );
  context.fill();
  context.stroke();

  // Body last so it sits above the hands.
  context.fillStyle = isLocal ? "#f5f1e8" : "#e7deca";
  context.beginPath();
  context.arc(player.x, player.y, bodyRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  // Plain black eyes.
  context.fillStyle = "#111111";
  context.beginPath();
  context.arc(eyeCenterX + sideX * eyeSide, eyeCenterY + sideY * eyeSide, eyeRadius, 0, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.arc(eyeCenterX - sideX * eyeSide, eyeCenterY - sideY * eyeSide, eyeRadius, 0, Math.PI * 2);
  context.fill();
}

function draw() {
  context.clearRect(0, 0, world.width, world.height);
  updateOverlayPanels();
  const camera = getCameraCenter();
  const viewportLeft = screenToWorldX(camera.x, 0);
  const viewportTop = screenToWorldY(camera.y, 0);
  const viewportRight = screenToWorldX(camera.x, canvas.width);
  const viewportBottom = screenToWorldY(camera.y, canvas.height);

  context.save();
  const translateX = Math.round(canvas.width / 2 - camera.x * CAMERA_ZOOM);
  const translateY = Math.round(canvas.height / 2 - camera.y * CAMERA_ZOOM);
  context.setTransform(
    CAMERA_ZOOM,
    0,
    0,
    CAMERA_ZOOM,
    translateX,
    translateY
  );

  mapRenderer.drawWorld(context, camera, canvas, CAMERA_ZOOM);

  for (const player of renderedPlayers.values()) {
    drawPlayer(player, player.id === localPlayer?.id);
  }
  context.restore();

  context.fillStyle = "#f2ead8";
  context.font = "14px system-ui, sans-serif";
  context.textAlign = "center";
  for (const player of renderedPlayers.values()) {
    if (
      player.x < viewportLeft - world.playerRadius * 2 ||
      player.x > viewportRight + world.playerRadius * 2 ||
      player.y < viewportTop - world.playerRadius * 2 ||
      player.y > viewportBottom + world.playerRadius * 2
    ) {
      continue;
    }

    context.fillText(
      player.id === localPlayer?.id ? "You" : player.name,
      worldToScreenX(camera.x, player.x),
      worldToScreenY(camera.y, player.y - world.playerRadius - 8)
    );
  }

  mapRenderer.drawMinimap(context, {
    x: MINIMAP_MARGIN,
    y: canvas.height - MINIMAP_HEIGHT - MINIMAP_MARGIN,
    width: MINIMAP_WIDTH,
    height: MINIMAP_HEIGHT,
    camera,
    canvas,
    zoom: CAMERA_ZOOM,
    localPlayer
  });
}

function tick(frameAt: number) {
  const deltaSeconds = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
  lastFrameAt = frameAt;

  updateLocalPlayer(deltaSeconds);
  updateRenderedPlayers(deltaSeconds);
  updateCamera(deltaSeconds);

  if (isFirebaseConfigured && hasJoinedLobby && localPlayer && frameAt - lastSyncAt > SYNC_INTERVAL_MS) {
    lastSyncAt = frameAt;
    void syncLocalPlayer().catch((error) => {
      setStatus(`Sync failed: ${error.message}`, "error");
    });
  }

  draw();
  requestAnimationFrame(tick);
}

function subscribeToLobby() {
  playersUnsubscribe?.();
  playersUnsubscribe = onValue(
    playersRef(),
    (snapshot) => {
      const records = snapshot.val() as Record<string, PlayerSnapshot> | null;
      players.clear();

      if (records) {
        for (const [id, player] of Object.entries(records)) {
          players.set(id, {
            ...player,
            id,
            x: player.x ?? world.width / 2,
            y: player.y ?? world.height / 2,
            area: normalizeArea(player.area),
            facingX: player.facingX ?? DEFAULT_FACING.x,
            facingY: player.facingY ?? DEFAULT_FACING.y,
            moving: player.moving ?? false,
            step: player.step ?? 0,
            characterId: normalizeCharacterId(player.characterId),
            name: player.name ?? `Player ${id.slice(0, 5)}`
          });
        }
      }

      renderPlayersList();

      if (hasJoinedLobby && localPlayer) {
        setStatus(`Connected: ${players.size} player${players.size === 1 ? "" : "s"}`, "online");
      }
    },
    (error) => {
      if (devtoolsUnlocked) {
        devtoolsMessage.textContent = `Could not read lobby: ${error.message}`;
      }

      if (hasJoinedLobby) {
        setStatus(`Lobby read failed: ${error.message}`, "error");
      }
    }
  );
}

function subscribeToKickedPlayers() {
  kickedUnsubscribe?.();
  kickedUnsubscribe = onValue(
    kickedPlayersRef(),
    (snapshot) => {
      const records = snapshot.val() as Record<string, KickedRecord> | null;
      kickedPlayerIds.clear();

      if (records) {
        for (const id of Object.keys(records)) {
          kickedPlayerIds.add(id);
        }
      }

      if (localPlayer && kickedPlayerIds.has(localPlayer.id)) {
        const kickedPlayer = localPlayer;
        localPlayer = null;
        hasJoinedLobby = false;
        keys.clear();
        void remove(playerRef(kickedPlayer.id));
        setStatus("You were kicked from the lobby.", "error");
      }

      renderPlayersList();
    },
    (error) => {
      if (devtoolsUnlocked) {
        devtoolsMessage.textContent = `Could not read kicks: ${error.message}`;
      }

      if (hasJoinedLobby) {
        setStatus("Connected. Kicks need updated Firebase rules.", "online");
      }
    }
  );
}

async function kickPlayer(playerId: string, playerName: string) {
  devtoolsMessage.textContent = `Kicking ${playerName}...`;
  await set(kickedPlayerRef(playerId), {
    kickedAt: serverTimestamp(),
    name: playerName
  } satisfies KickedRecord);
  await remove(playerRef(playerId));
  devtoolsMessage.textContent = `Kicked ${playerName}.`;
}

async function clearKick(playerId: string, playerName: string) {
  devtoolsMessage.textContent = `Clearing kick for ${playerName}...`;
  await remove(kickedPlayerRef(playerId));
  devtoolsMessage.textContent = `${playerName} can rejoin.`;
}

function normalizeUsername(value: string) {
  return value.trim().toLowerCase();
}

function setAuthPending(pending: boolean) {
  signInUsername.disabled = pending;
  signInPassword.disabled = pending;
  createUsername.disabled = pending;
  createEmail.disabled = pending;
  createPassword.disabled = pending;
  signInTab.disabled = pending;
  createTab.disabled = pending;
  signInForm.querySelector("button")?.toggleAttribute("disabled", pending);
  createForm.querySelector("button")?.toggleAttribute("disabled", pending);
}

function setAuthMode(mode: "signin" | "create") {
  const signInMode = mode === "signin";
  signInForm.classList.toggle("is-hidden", !signInMode);
  createForm.classList.toggle("is-hidden", signInMode);
  signInTab.classList.toggle("is-active", signInMode);
  createTab.classList.toggle("is-active", !signInMode);
  menuError.textContent = "";
  if (signInMode) {
    signInUsername.focus();
  } else {
    createUsername.focus();
  }
}

async function joinLobby(playerName: string) {
  if (!isFirebaseConfigured) {
    localPlayer = makePlayer(OFFLINE_PLAYER_ID, playerName);
    localVelocityX = 0;
    localVelocityY = 0;
    cameraX = localPlayer.x;
    cameraY = localPlayer.y;
    players.clear();
    renderedPlayers.clear();
    players.set(localPlayer.id, localPlayer);
    renderedPlayers.set(localPlayer.id, localPlayer);
    hasJoinedLobby = true;
    renderPlayersList();
    showGame();
    setStatus("Singleplayer mode (offline test)", "offline");

    if (!animationStarted) {
      animationStarted = true;
      requestAnimationFrame(tick);
    }

    return;
  }

  const playerId = auth.currentUser?.uid;
  if (!playerId) {
    throw new Error("Sign in with email/password first.");
  }
  await loadKickedPlayers();

  if (kickedPlayerIds.has(playerId)) {
    throw new Error("This browser was kicked from the lobby. Clear the kicked marker in devtools to rejoin.");
  }

  localPlayer = makePlayer(playerId, playerName);
  localVelocityX = 0;
  localVelocityY = 0;
  cameraX = localPlayer.x;
  cameraY = localPlayer.y;
  players.set(localPlayer.id, localPlayer);
  renderedPlayers.set(localPlayer.id, localPlayer);
  hasJoinedLobby = true;
  renderPlayersList();
  showGame();
  setStatus("Connected", "online");

  await syncLocalPlayer();
  await onDisconnect(playerRef(localPlayer.id)).remove();
  subscribeToLobby();
  subscribeToKickedPlayers();
  subscribeToChat();

  window.addEventListener("beforeunload", () => {
    if (localPlayer) {
      void remove(playerRef(localPlayer.id));
    }
  });

  if (!animationStarted) {
    animationStarted = true;
    requestAnimationFrame(tick);
  }
}

devtoolsForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!isFirebaseConfigured) {
    devtoolsMessage.textContent = "Devtools require Firebase. Add .env.local to enable.";
    return;
  }

  if (devtoolsPassword.value !== DEVTOOLS_PASSWORD) {
    devtoolsMessage.textContent = "Wrong devtools password.";
    return;
  }

  devtoolsUnlocked = true;
  devtoolsPassword.value = "";
  devtoolsPanel.classList.remove("is-hidden");
  devtoolsMessage.textContent = "Devtools unlocked.";

  if (!auth.currentUser) {
    devtoolsMessage.textContent = "Sign in first to unlock devtools.";
    return;
  }

  void loadKickedPlayers(true)
    .then(() => {
      subscribeToLobby();
      subscribeToKickedPlayers();
    })
    .catch((error) => {
      devtoolsMessage.textContent = `Could not unlock devtools: ${error.message}`;
    });
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void sendChatMessage();
});

signInTab.addEventListener("click", () => {
  setAuthMode("signin");
});

createTab.addEventListener("click", () => {
  setAuthMode("create");
});

signInForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = signInUsername.value.trim();
  const normalizedUsername = normalizeUsername(username);
  const password = signInPassword.value;

  if (!isFirebaseConfigured) {
    menuError.textContent = "Firebase is required for sign in. Configure .env.local first.";
    return;
  }

  if (!username || !password) {
    menuError.textContent = "Enter your username and password.";
    signInUsername.focus();
    return;
  }

  menuError.textContent = "";
  setAuthPending(true);

  void (async () => {
    const usernameIndexSnapshot = await get(usernameIndexRef(normalizedUsername));
    const usernameIndexRecord = usernameIndexSnapshot.val() as UsernameIndexRecord | null;
    if (!usernameIndexRecord?.email) {
      throw new Error("Unknown username.");
    }

    const { displayName } = await signInFirebaseAccount(usernameIndexRecord.email, password);
    await set(ref(database, `accounts/usernames/${usernameStoreKey(normalizedUsername)}/lastLoginAt`), serverTimestamp());
    selectedCharacterId = DEFAULT_CHARACTER_ID;
    signInPassword.value = "";
    await joinLobby(displayName || usernameIndexRecord.username || username);
  })()
    .catch((error) => {
      menuError.textContent = `Could not sign in: ${error.message}`;
      setStatus(`Sign in failed: ${error.message}`, "error");
    })
    .finally(() => {
      setAuthPending(false);
    });
});

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const username = createUsername.value.trim();
  const normalizedUsername = normalizeUsername(username);
  const email = createEmail.value.trim();
  const password = createPassword.value;

  if (!isFirebaseConfigured) {
    menuError.textContent = "Firebase is required for account creation. Configure .env.local first.";
    return;
  }

  if (!username || !email || !password) {
    menuError.textContent = "Choose a username, email, and password.";
    createUsername.focus();
    return;
  }

  if (normalizedUsername.length < 3) {
    menuError.textContent = "Username must be at least 3 characters.";
    createUsername.focus();
    return;
  }

  if (!email.includes("@")) {
    menuError.textContent = "Enter a valid email address.";
    createEmail.focus();
    return;
  }

  if (password.length < 4) {
    menuError.textContent = "Password must be at least 4 characters.";
    createPassword.focus();
    return;
  }

  menuError.textContent = "";
  setAuthPending(true);

  void (async () => {
    const usernameIndexSnapshot = await get(usernameIndexRef(normalizedUsername));
    if (usernameIndexSnapshot.exists()) {
      throw new Error("Username already exists. Sign in instead.");
    }

    const { displayName, uid } = await createFirebaseAccount(username, email, password);
    await set(usernameIndexRef(normalizedUsername), {
      email,
      username: displayName || username,
      uid,
      createdAt: serverTimestamp(),
      lastLoginAt: serverTimestamp()
    } satisfies UsernameIndexRecord);
    createPassword.value = "";
    createEmail.value = "";
    signInUsername.value = username;
    signInPassword.value = "";
    setAuthMode("signin");
    menuError.textContent = "Account created. Sign in to play.";
  })()
    .catch((error) => {
      menuError.textContent = `Could not create account: ${error.message}`;
    })
    .finally(() => {
      setAuthPending(false);
    });
});

setAuthMode("signin");

if (!isFirebaseConfigured) {
  setStatus("Firebase not configured. Add .env.local to enable online lobby.", "offline");
}
