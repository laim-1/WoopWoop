import { onDisconnect, onValue, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Unsubscribe } from "firebase/database";
import { auth, createFirebaseAccount, database, isFirebaseConfigured, signInFirebaseAccount } from "./firebase";
import { BASE_TILES, ENEMY_PATH, ENEMY_TEMPLATES, GRID_COLUMNS, GRID_ORIGIN_X, GRID_ORIGIN_Y, GRID_ROWS, GRID_SIZE, PATH_TILES, STARTING_MONEY, TOWER_DEFENSE_WORLD, TOWER_ORDER, TOWER_SPECS, WAVE_BREAK_SECONDS, gridTileKey } from "./game/constants";
import { createMatchSync, ensureMatchRoom } from "./game/net/matchSync";
import { createInitialMatchState, firebaseIndexedList } from "./game/simulation";
import type {
  Enemy,
  EnemyTemplate,
  GridPoint,
  MatchPlayerState,
  MatchState,
  Player,
  PlayerRecord,
  PlayerSnapshot,
  QueueMode,
  SceneId,
  Tower,
  TowerShot,
  TowerSpec,
  TowerType,
} from "./game/types";
import "./styles.css";

type RenderState = {
  x: number;
  y: number;
  facingX: number;
  facingY: number;
};

type QueueEntry = {
  id: string;
  name: string;
  queuedAt?: number | object;
};

type QueueRecord = {
  name?: string;
  queuedAt?: number | object;
};

type QueuePad = {
  mode: QueueMode;
  title: string;
  subtitle: string;
  capacity: number;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const assetBase = import.meta.env.BASE_URL;
const titleLogoSrc = `${assetBase}assets/branding/title-logo.png`;

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
      <p class="menu-copy">A tower defense lobby prototype. Walk into a portal to queue for a match.</p>

      <form class="${isFirebaseConfigured ? "is-hidden" : ""} join-form" id="offline-form">
        <p class="offline-note">Firebase config is missing, so this runs in offline test mode.</p>
        <label for="offline-name">Display name</label>
        <input
          id="offline-name"
          maxlength="18"
          minlength="1"
          name="offlineName"
          placeholder="Player"
          required
          autocomplete="nickname"
        />
        <button type="submit">Play Offline</button>
      </form>

      <section class="${isFirebaseConfigured ? "" : "is-hidden"} auth-card" id="auth-card">
        <div class="auth-switch">
          <button type="button" class="is-active" id="auth-signin-tab">Sign In</button>
          <button type="button" id="auth-create-tab">Create Account</button>
        </div>
        <form class="join-form" id="signin-form">
          <label for="signin-email">Email</label>
          <input
            id="signin-email"
            maxlength="120"
            minlength="5"
            name="signInEmail"
            placeholder="Email"
            required
            type="email"
            autocomplete="email"
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
      </section>

      <p class="menu-error" id="menu-error" role="alert"></p>
    </section>

    <section class="hud is-hidden" id="game-hud">
      <div>
        <h1 id="scene-title">Main Lobby</h1>
        <p id="scene-help">WASD to move. Stand inside a portal box to queue.</p>
      </div>
      <div class="status" id="status">Connecting...</div>
      <button type="button" class="leave-button is-hidden" id="leave-game-button">Return to Lobby</button>
    </section>

    <aside class="lobby-panel is-hidden" id="lobby-panel">
      <h2>Lobby</h2>
      <p id="player-count">Players online: 0</p>
      <p id="queue-status">Stand in a portal to queue.</p>
      <ul id="queue-list"></ul>
    </aside>

    <canvas class="is-hidden" id="game" width="960" height="640" aria-label="Tower defense lobby canvas"></canvas>
  </main>
`;

function requireElement<T extends HTMLElement>(selector: string) {
  const element = document.querySelector<T>(selector);
  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return element;
}

const canvas = requireElement<HTMLCanvasElement>("#game");
const statusEl = requireElement<HTMLDivElement>("#status");
const joinMenu = requireElement<HTMLElement>("#join-menu");
const offlineForm = requireElement<HTMLFormElement>("#offline-form");
const offlineName = requireElement<HTMLInputElement>("#offline-name");
const authCard = requireElement<HTMLElement>("#auth-card");
const signInForm = requireElement<HTMLFormElement>("#signin-form");
const createForm = requireElement<HTMLFormElement>("#create-form");
const signInTab = requireElement<HTMLButtonElement>("#auth-signin-tab");
const createTab = requireElement<HTMLButtonElement>("#auth-create-tab");
const signInEmail = requireElement<HTMLInputElement>("#signin-email");
const signInPassword = requireElement<HTMLInputElement>("#signin-password");
const createUsername = requireElement<HTMLInputElement>("#create-username");
const createEmail = requireElement<HTMLInputElement>("#create-email");
const createPassword = requireElement<HTMLInputElement>("#create-password");
const menuError = requireElement<HTMLParagraphElement>("#menu-error");
const gameHud = requireElement<HTMLElement>("#game-hud");
const sceneTitle = requireElement<HTMLHeadingElement>("#scene-title");
const sceneHelp = requireElement<HTMLParagraphElement>("#scene-help");
const leaveGameButton = requireElement<HTMLButtonElement>("#leave-game-button");
const lobbyPanel = requireElement<HTMLElement>("#lobby-panel");
const playerCount = requireElement<HTMLParagraphElement>("#player-count");
const queueStatus = requireElement<HTMLParagraphElement>("#queue-status");
const queueList = requireElement<HTMLUListElement>("#queue-list");

const maybeContext = canvas.getContext("2d");

if (!maybeContext) {
  throw new Error("Could not initialize 2D canvas context");
}

const context = maybeContext;

const OFFLINE_PLAYER_ID = "offline-local-player";
const DEFAULT_FACING = { x: 0, y: 1 };
const REMOTE_INTERPOLATION_SPEED = 12;
const SYNC_INTERVAL_MS = 90;
const WALK_SPEED = 230;
const RUN_SPEED = 330;
const MOVE_ACCELERATION = 8;
const MOVE_FRICTION = 2.6;
const CAMERA_ZOOM = 1.1;
const CAMERA_FOLLOW_SPEED = 10;
const SINGLE_PLAYER_START_DELAY_MS = 850;
const PLAYER_RADIUS = 28;
/** Hands: pure lateral offset from body center (+ facing), no screen-axis bias so they stay centered when rotating. */
const ARM_SIDE_OFFSET = 23;
const ARM_FORWARD_OFFSET = -5;
const HAND_RADIUS = 7;

const lobbyWorld = {
  width: 2400,
  height: 1600
};

const HOTBAR_SLOT_W = 74;
const HOTBAR_SLOT_H = 34;
const HOTBAR_GAP = 5;
/** Distance from viewport right edge to the tower shop outer border. */
const TOWER_SHOP_SCREEN_PAD = 12;
/** Tower shop interior padding (between border and slot stack). */
const TOWER_SHOP_INNER_PAD = 14;
const TOWER_SHOP_TITLE_HEIGHT = 22;
const TOWER_SHOP_CORNER_RADIUS = 12;

const queuePads: QueuePad[] = [
  {
    mode: "single",
    title: "Single Player",
    subtitle: "Solo tower defense",
    capacity: 1,
    x: 520,
    y: 610,
    width: 420,
    height: 320,
    color: "#4d8bdf"
  },
  {
    mode: "duo",
    title: "Duos",
    subtitle: "Waits for 2 players",
    capacity: 2,
    x: 1460,
    y: 610,
    width: 420,
    height: 320,
    color: "#d99642"
  }
];

const keys = new Set<string>();
const players = new Map<string, Player>();
const renderedPlayers = new Map<string, Player>();
const renderStates = new Map<string, RenderState>();
const queues: Record<QueueMode, Map<string, QueueEntry>> = {
  single: new Map<string, QueueEntry>(),
  duo: new Map<string, QueueEntry>()
};

let localPlayer: Player | null = null;
let localVelocityX = 0;
let localVelocityY = 0;
let cameraX = lobbyWorld.width / 2;
let cameraY = lobbyWorld.height / 2;
let lastFrameAt = performance.now();
let lastSyncAt = 0;
let activeQueueMode: QueueMode | null = null;
let queueEnteredAt = 0;
let animationStarted = false;
let hasJoinedLobby = false;
let playersUnsubscribe: Unsubscribe | null = null;
let singleQueueUnsubscribe: Unsubscribe | null = null;
let duoQueueUnsubscribe: Unsubscribe | null = null;
let towerDefenseGame: MatchState = createInitialMatchState();
let towerDefensePlayerState: Record<string, MatchPlayerState> = {};
let selectedTowerType: TowerType = "dart";
let matchSync: ReturnType<typeof createMatchSync> | null = null;
let currentMatchPlayerIds: string[] = [];
/** True when WASD is held; used so limb animation stops immediately on key release (not when velocity decays). */
let localMovementInput = false;

let pointerClientX = typeof window !== "undefined" ? window.innerWidth / 2 : 0;
let pointerClientY = typeof window !== "undefined" ? window.innerHeight / 2 : 0;
/** Placement ghost / map clicks only after picking a tower in the shop (click or digit). */
let towerShopArmed = false;

function resizeCanvasToViewport() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
}

resizeCanvasToViewport();
window.addEventListener("resize", resizeCanvasToViewport);

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function drawRoundedRectPath(x: number, y: number, width: number, height: number, radius: number) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
}

function startAnimationLoop() {
  if (animationStarted) {
    return;
  }
  animationStarted = true;
  lastFrameAt = performance.now();
  updateRenderedPlayers(0);
  updateCamera(0);
  safeDraw();
  requestAnimationFrame(tick);
}

function activeWorld() {
  return localPlayer?.scene === "towerDefense" ? TOWER_DEFENSE_WORLD : lobbyWorld;
}

function normalizeScene(scene: unknown): SceneId {
  return scene === "towerDefense" ? "towerDefense" : "lobby";
}

function normalizeMatchId(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizePlayer(id: string, snapshot: PlayerSnapshot): Player {
  const scene = normalizeScene(snapshot.scene);
  const world = scene === "towerDefense" ? TOWER_DEFENSE_WORLD : lobbyWorld;
  return {
    id,
    name: typeof snapshot.name === "string" && snapshot.name.trim() ? snapshot.name.trim().slice(0, 18) : `Player ${id.slice(0, 5)}`,
    x: clamp(snapshot.x ?? world.width / 2, PLAYER_RADIUS, world.width - PLAYER_RADIUS),
    y: clamp(snapshot.y ?? world.height / 2, PLAYER_RADIUS, world.height - PLAYER_RADIUS),
    facingX: snapshot.facingX ?? DEFAULT_FACING.x,
    facingY: snapshot.facingY ?? DEFAULT_FACING.y,
    moving: snapshot.moving ?? false,
    step: snapshot.step ?? 0,
    scene,
    matchId: normalizeMatchId(snapshot.matchId),
    lastSeen: snapshot.lastSeen
  };
}

function makePlayer(userId: string, name: string): Player {
  return {
    id: userId,
    name: name.trim().slice(0, 18) || "Player",
    x: lobbyWorld.width / 2,
    y: 1220,
    facingX: DEFAULT_FACING.x,
    facingY: DEFAULT_FACING.y,
    moving: false,
    step: 0,
    scene: "lobby",
    matchId: null
  };
}

function playerRef(playerId: string) {
  return ref(database, `rooms/lobby/players/${playerId}`);
}

function playersRef() {
  return ref(database, "rooms/lobby/players");
}

function queueRef(mode: QueueMode) {
  return ref(database, `rooms/lobby/queues/${mode}`);
}

function queueEntryRef(mode: QueueMode, playerId: string) {
  return ref(database, `rooms/lobby/queues/${mode}/${playerId}`);
}

function setStatus(message: string, state: "online" | "offline" | "error") {
  statusEl.textContent = message;
  statusEl.dataset.state = state;
}

function logBackgroundFailure(label: string, error: unknown) {
  console.warn(label, error);
}

function setAuthMode(mode: "signin" | "create") {
  const signInMode = mode === "signin";
  signInForm.classList.toggle("is-hidden", !signInMode);
  createForm.classList.toggle("is-hidden", signInMode);
  signInTab.classList.toggle("is-active", signInMode);
  createTab.classList.toggle("is-active", !signInMode);
  menuError.textContent = "";
  if (signInMode) {
    signInEmail.focus();
  } else {
    createUsername.focus();
  }
}

function setAuthPending(pending: boolean) {
  offlineName.disabled = pending;
  signInEmail.disabled = pending;
  signInPassword.disabled = pending;
  createUsername.disabled = pending;
  createEmail.disabled = pending;
  createPassword.disabled = pending;
  signInTab.disabled = pending;
  createTab.disabled = pending;
  offlineForm.querySelector("button")?.toggleAttribute("disabled", pending);
  signInForm.querySelector("button")?.toggleAttribute("disabled", pending);
  createForm.querySelector("button")?.toggleAttribute("disabled", pending);
}

function showGameShell() {
  joinMenu.classList.add("is-hidden");
  canvas.classList.remove("is-hidden");
  gameHud.classList.remove("is-hidden");
  lobbyPanel.classList.remove("is-hidden");
}

function updateSceneChrome() {
  const inMatch = localPlayer?.scene === "towerDefense";
  sceneTitle.textContent = inMatch ? "Tower Defense" : "Main Lobby";
  sceneHelp.textContent = inMatch ? "" : "WASD to move. Stand inside a portal box to queue.";
  sceneHelp.classList.toggle("is-hidden", inMatch);
  leaveGameButton.classList.toggle("is-hidden", !inMatch);
  lobbyPanel.classList.toggle("is-hidden", !hasJoinedLobby || inMatch);
}

function queueOccupancy(mode: QueueMode) {
  return queues[mode].size;
}

function updateQueuePanel() {
  const lobbyPlayers = [...players.values()].filter((player) => player.scene === "lobby").length;
  playerCount.textContent = `Players in lobby: ${lobbyPlayers}`;
  queueList.innerHTML = "";

  for (const pad of queuePads) {
    const item = document.createElement("li");
    const title = document.createElement("strong");
    const count = document.createElement("span");
    title.textContent = pad.title;
    count.textContent = `${queueOccupancy(pad.mode)} / ${pad.capacity}`;
    item.append(title, count);
    queueList.append(item);
  }

  if (!localPlayer || localPlayer.scene !== "lobby") {
    queueStatus.textContent = "Match in progress.";
  } else if (activeQueueMode === "single") {
    queueStatus.textContent = "Single player portal active...";
  } else if (activeQueueMode === "duo") {
    queueStatus.textContent =
      queueOccupancy("duo") >= 2 ? "Duo match is starting..." : "Waiting in duos for another player.";
  } else {
    queueStatus.textContent = "Stand in a portal to queue.";
  }
}

function screenToWorldX(cameraCenterX: number, screenX: number) {
  return cameraCenterX + (screenX - window.innerWidth / 2) / CAMERA_ZOOM;
}

function screenToWorldY(cameraCenterY: number, screenY: number) {
  return cameraCenterY + (screenY - window.innerHeight / 2) / CAMERA_ZOOM;
}

function worldToScreenX(cameraCenterX: number, worldX: number) {
  return (worldX - cameraCenterX) * CAMERA_ZOOM + window.innerWidth / 2;
}

function worldToScreenY(cameraCenterY: number, worldY: number) {
  return (worldY - cameraCenterY) * CAMERA_ZOOM + window.innerHeight / 2;
}

function getCameraCenter() {
  const world = activeWorld();
  const halfViewWidth = window.innerWidth / (2 * CAMERA_ZOOM);
  const halfViewHeight = window.innerHeight / (2 * CAMERA_ZOOM);
  return {
    x: clampCameraAxis(cameraX, halfViewWidth, world.width - halfViewWidth, world.width / 2),
    y: clampCameraAxis(cameraY, halfViewHeight, world.height - halfViewHeight, world.height / 2)
  };
}

function clampCameraAxis(value: number, min: number, max: number, fallback: number) {
  if (min > max) {
    return fallback;
  }
  return clamp(value, min, max);
}

function updateCamera(deltaSeconds: number) {
  if (!localPlayer) {
    return;
  }
  const world = activeWorld();
  const halfViewWidth = window.innerWidth / (2 * CAMERA_ZOOM);
  const halfViewHeight = window.innerHeight / (2 * CAMERA_ZOOM);
  const targetX = clampCameraAxis(localPlayer.x, halfViewWidth, world.width - halfViewWidth, world.width / 2);
  const targetY = clampCameraAxis(localPlayer.y, halfViewHeight, world.height - halfViewHeight, world.height / 2);
  const blend = 1 - Math.exp(-CAMERA_FOLLOW_SPEED * deltaSeconds);
  cameraX += (targetX - cameraX) * blend;
  cameraY += (targetY - cameraY) * blend;
}

function containsPoint(pad: QueuePad, x: number, y: number) {
  return x >= pad.x && x <= pad.x + pad.width && y >= pad.y && y <= pad.y + pad.height;
}

function localQueuePad() {
  const player = localPlayer;
  if (!player || player.scene !== "lobby") {
    return null;
  }
  return queuePads.find((pad) => containsPoint(pad, player.x, player.y)) ?? null;
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
    targetVelocityX = (dx / length) * speed;
    targetVelocityY = (dy / length) * speed;
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
  localMovementInput = hasInput;

  if (hasInput) {
    const inputLen = Math.hypot(dx, dy);
    localPlayer.facingX = dx / inputLen;
    localPlayer.facingY = dy / inputLen;
    localPlayer.step += deltaSeconds * (sprinting ? 9.5 : 6.5);
  } else if (movementSpeed > 2) {
    localPlayer.step = 0;
    localPlayer.facingX = localVelocityX / movementSpeed;
    localPlayer.facingY = localVelocityY / movementSpeed;
  } else {
    localVelocityX = 0;
    localVelocityY = 0;
    localPlayer.step = 0;
  }

  const world = activeWorld();
  localPlayer.x = clamp(localPlayer.x + localVelocityX * deltaSeconds, PLAYER_RADIUS, world.width - PLAYER_RADIUS);
  localPlayer.y = clamp(localPlayer.y + localVelocityY * deltaSeconds, PLAYER_RADIUS, world.height - PLAYER_RADIUS);
  players.set(localPlayer.id, localPlayer);
}

function updateRenderedPlayers(deltaSeconds: number) {
  renderedPlayers.clear();

  for (const [id, player] of players) {
    if (!localPlayer || player.scene !== localPlayer.scene) {
      renderStates.delete(id);
      continue;
    }
    if (player.scene === "towerDefense" && player.matchId !== localPlayer.matchId) {
      renderStates.delete(id);
      continue;
    }

    if (id === localPlayer.id) {
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
    renderedPlayers.set(id, { ...player, x: state.x, y: state.y, facingX: state.facingX, facingY: state.facingY });
  }
}

async function enterQueue(mode: QueueMode) {
  if (!localPlayer) {
    return;
  }
  const entry: QueueEntry = {
    id: localPlayer.id,
    name: localPlayer.name,
    queuedAt: Date.now()
  };

  if (!isFirebaseConfigured) {
    queues[mode].set(localPlayer.id, entry);
    updateQueuePanel();
    return;
  }

  await set(queueEntryRef(mode, localPlayer.id), {
    name: localPlayer.name,
    queuedAt: serverTimestamp()
  } satisfies QueueRecord);
}

async function leaveQueue(mode: QueueMode) {
  if (!localPlayer) {
    return;
  }

  if (!isFirebaseConfigured) {
    queues[mode].delete(localPlayer.id);
    updateQueuePanel();
    return;
  }

  await remove(queueEntryRef(mode, localPlayer.id));
}

function clearLocalQueues() {
  const previousMode = activeQueueMode;
  activeQueueMode = null;
  queueEnteredAt = 0;
  if (previousMode) {
    void leaveQueue(previousMode).catch((error) => {
      logBackgroundFailure("Queue cleanup failed", error);
    });
  }
}

function scheduleQueueCleanup(mode: QueueMode, delayMs = 0) {
  window.setTimeout(() => {
    void leaveQueue(mode).catch((error) => {
      logBackgroundFailure("Queue cleanup failed", error);
    });
  }, delayMs);
}

function queueSortValue(entry: QueueEntry) {
  return typeof entry.queuedAt === "number" ? entry.queuedAt : 0;
}

function resolveDuoQueue() {
  if (!localPlayer || localPlayer.scene !== "lobby") {
    return;
  }

  const entries = [...queues.duo.values()].sort((a, b) => {
    const timeDifference = queueSortValue(a) - queueSortValue(b);
    return timeDifference === 0 ? a.id.localeCompare(b.id) : timeDifference;
  });
  const localIndex = entries.findIndex((entry) => entry.id === localPlayer?.id);

  if (localIndex < 0) {
    return;
  }

  const pairStart = Math.floor(localIndex / 2) * 2;
  const pair = entries.slice(pairStart, pairStart + 2);
  if (pair.length === 2) {
    void startMatch("duo", pair.map((entry) => entry.id));
  }
}

function updateQueueState(frameAt: number) {
  if (!localPlayer || localPlayer.scene !== "lobby") {
    if (activeQueueMode) {
      clearLocalQueues();
    }
    return;
  }

  const pad = localQueuePad();
  const nextMode = pad?.mode ?? null;

  if (nextMode !== activeQueueMode) {
    const previousMode = activeQueueMode;
    activeQueueMode = nextMode;
    queueEnteredAt = frameAt;

    if (previousMode) {
      void leaveQueue(previousMode).catch((error) => {
        setStatus(`Queue leave failed: ${error.message}`, "error");
      });
    }

    if (nextMode) {
      void enterQueue(nextMode).catch((error) => {
        setStatus(`Queue join failed: ${error.message}`, "error");
      });
      setStatus(nextMode === "single" ? "Starting single player..." : "Waiting for a duo partner...", isFirebaseConfigured ? "online" : "offline");
    } else {
      setStatus(isFirebaseConfigured ? "In lobby" : "Offline lobby", isFirebaseConfigured ? "online" : "offline");
    }
    updateQueuePanel();
  }

  if (activeQueueMode === "single" && frameAt - queueEnteredAt >= SINGLE_PLAYER_START_DELAY_MS) {
    void startMatch("single", [localPlayer.id]);
  } else if (activeQueueMode === "duo") {
    resolveDuoQueue();
  }
}

function getMatchSpawn(playerIds: string[], playerId: string) {
  const index = Math.max(0, playerIds.indexOf(playerId));
  const offsets = [
    { x: -60, y: 0 },
    { x: 60, y: 0 }
  ];
  const offset = offsets[index % offsets.length];
  return {
    x: TOWER_DEFENSE_WORLD.width / 2 + offset.x,
    y: TOWER_DEFENSE_WORLD.height - 180 + offset.y
  };
}

function resetTowerDefenseGame() {
  towerDefenseGame = createInitialMatchState();
  towerDefensePlayerState = {};
}

/** RTDB can return partial or bad numbers — normalize so spawning/timers stay valid. */
function coerceMatchStateFromRemote(raw: MatchState): MatchState {
  const base = createInitialMatchState(typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now());
  const m: MatchState = { ...base, ...raw };
  if (typeof raw.spawnTimer !== "number" || !Number.isFinite(raw.spawnTimer)) {
    m.spawnTimer = base.spawnTimer;
  }
  if (typeof raw.waveBreakTimer !== "number" || !Number.isFinite(raw.waveBreakTimer)) {
    m.waveBreakTimer = base.waveBreakTimer;
  }
  m.enemies = firebaseIndexedList<Enemy>((raw as { enemies?: unknown }).enemies);
  m.towers = firebaseIndexedList<Tower>((raw as { towers?: unknown }).towers);
  m.shots = firebaseIndexedList<TowerShot>((raw as { shots?: unknown }).shots);
  return m;
}

function localMatchPlayerState() {
  if (!localPlayer) {
    return null;
  }
  if (!towerDefensePlayerState[localPlayer.id]) {
    towerDefensePlayerState[localPlayer.id] = {
      money: STARTING_MONEY,
      selectedTowerType,
      readyState: "pending",
    };
  }
  return towerDefensePlayerState[localPlayer.id];
}

function tileCenter(tile: GridPoint) {
  return {
    x: GRID_ORIGIN_X + tile.gx * GRID_SIZE + GRID_SIZE / 2,
    y: GRID_ORIGIN_Y + tile.gy * GRID_SIZE + GRID_SIZE / 2
  };
}

function currentWaveConfig() {
  const wave = towerDefenseGame.wave;
  return {
    totalEnemies: Math.min(8 + wave * 3, 28),
    spawnInterval: Math.max(0.45, 1.05 - wave * 0.08)
  };
}

function enemyTemplateForWave(wave: number, spawnedIndex: number): EnemyTemplate {
  if (wave >= 3 && spawnedIndex % 6 === 5) {
    return ENEMY_TEMPLATES.tank;
  }
  if (wave >= 2 && spawnedIndex % 4 === 2) {
    return ENEMY_TEMPLATES.runner;
  }
  return ENEMY_TEMPLATES.grunt;
}

function spawnEnemy(template: EnemyTemplate) {
  const spawn = tileCenter(ENEMY_PATH[0]);
  towerDefenseGame.enemies.push({
    id: `enemy-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`,
    kind: template.kind,
    x: spawn.x,
    y: spawn.y,
    hp: template.hp,
    maxHp: template.hp,
    speed: template.speed,
    damage: template.damage,
    radius: template.radius,
    color: template.color,
    reward: template.reward,
    pathIndex: 0,
    progress: 0,
    slowTimer: 0,
    slowMultiplier: 1
  });
}

function rewardForEnemy(enemy: Enemy) {
  return enemy.reward;
}

function damageEnemy(enemy: Enemy, damage: number) {
  enemy.hp = Math.max(0, enemy.hp - damage);
  if (enemy.hp <= 0) {
    const playerState = localMatchPlayerState();
    if (playerState) {
      playerState.money += rewardForEnemy(enemy);
    }
    return true;
  }
  return false;
}

function advanceEnemy(enemy: Enemy, deltaSeconds: number) {
  if (enemy.slowTimer > 0) {
    enemy.slowTimer = Math.max(0, enemy.slowTimer - deltaSeconds);
    if (enemy.slowTimer <= 0) {
      enemy.slowMultiplier = 1;
    }
  }

  if (enemy.pathIndex >= ENEMY_PATH.length - 1) {
    return true;
  }

  let remainingDistance = enemy.speed * enemy.slowMultiplier * deltaSeconds;
  while (remainingDistance > 0 && enemy.pathIndex < ENEMY_PATH.length - 1) {
    const current = tileCenter(ENEMY_PATH[enemy.pathIndex]);
    const next = tileCenter(ENEMY_PATH[enemy.pathIndex + 1]);
    const segmentLength = Math.max(1, Math.hypot(next.x - current.x, next.y - current.y));
    const distanceOnSegment = enemy.progress * segmentLength;
    const distanceToNext = segmentLength - distanceOnSegment;

    if (remainingDistance >= distanceToNext) {
      remainingDistance -= distanceToNext;
      enemy.pathIndex += 1;
      enemy.progress = 0;
      enemy.x = next.x;
      enemy.y = next.y;
      continue;
    }

    enemy.progress += remainingDistance / segmentLength;
    enemy.x = current.x + (next.x - current.x) * enemy.progress;
    enemy.y = current.y + (next.y - current.y) * enemy.progress;
    remainingDistance = 0;
  }

  return enemy.pathIndex >= ENEMY_PATH.length - 1;
}

function distanceBetween(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function findTowerTarget(tower: Tower, spec: TowerSpec) {
  let best: Enemy | null = null;
  let bestProgress = -1;
  for (const enemy of towerDefenseGame.enemies) {
    if (enemy.hp <= 0 || distanceBetween(tower, enemy) > spec.range) {
      continue;
    }
    const progressScore = enemy.pathIndex + enemy.progress;
    if (progressScore > bestProgress) {
      best = enemy;
      bestProgress = progressScore;
    }
  }
  return best;
}

function applySplashDamage(target: Enemy, spec: TowerSpec) {
  const splashRadius = spec.splashRadius ?? 0;
  if (splashRadius <= 0) {
    return;
  }
  for (const enemy of towerDefenseGame.enemies) {
    if (enemy.id === target.id || enemy.hp <= 0 || distanceBetween(enemy, target) > splashRadius) {
      continue;
    }
    damageEnemy(enemy, spec.damage * 0.55);
  }
}

function fireTower(tower: Tower, spec: TowerSpec, target: Enemy) {
  tower.cooldown = 1 / spec.fireRate;
  towerDefenseGame.shots.push({
    x1: tower.x,
    y1: tower.y,
    x2: target.x,
    y2: target.y,
    life: 0.14,
    maxLife: 0.14,
    color: spec.projectileColor
  });
  const killed = damageEnemy(target, spec.damage);
  if (!killed) {
    applySplashDamage(target, spec);
    if (spec.slowMultiplier && spec.slowDuration) {
      target.slowMultiplier = Math.min(target.slowMultiplier, spec.slowMultiplier);
      target.slowTimer = Math.max(target.slowTimer, spec.slowDuration);
    }
  }
}

function updateTowers(deltaSeconds: number) {
  for (const tower of towerDefenseGame.towers) {
    const spec = TOWER_SPECS[tower.type];
    tower.cooldown = Math.max(0, tower.cooldown - deltaSeconds);
    if (tower.cooldown > 0) {
      continue;
    }
    const target = findTowerTarget(tower, spec);
    if (target) {
      fireTower(tower, spec, target);
    }
  }
}

function updateTowerShots(deltaSeconds: number) {
  for (let i = towerDefenseGame.shots.length - 1; i >= 0; i -= 1) {
    const shot = towerDefenseGame.shots[i];
    shot.life -= deltaSeconds;
    if (shot.life <= 0) {
      towerDefenseGame.shots.splice(i, 1);
    }
  }
}

function selectedTowerSpec() {
  return TOWER_SPECS[selectedTowerType];
}

/** Layout for the bordered tower shop panel on the right. */
function towerShopPanelLayout() {
  const stackH = TOWER_ORDER.length * (HOTBAR_SLOT_H + HOTBAR_GAP) - HOTBAR_GAP;
  const innerW = HOTBAR_SLOT_W + TOWER_SHOP_INNER_PAD * 2;
  const panelInnerH = TOWER_SHOP_TITLE_HEIGHT + 10 + stackH;
  const border = 6;
  const panelW = innerW + border * 2;
  const panelH = panelInnerH + border * 2 + TOWER_SHOP_INNER_PAD * 2;
  const panelX = window.innerWidth - TOWER_SHOP_SCREEN_PAD - panelW;
  const panelY = Math.max(72, Math.floor(window.innerHeight / 2 - panelH / 2));
  const contentLeft = panelX + border + TOWER_SHOP_INNER_PAD;
  const stackTop = panelY + border + TOWER_SHOP_INNER_PAD + TOWER_SHOP_TITLE_HEIGHT + 10;
  const slotX = contentLeft + (innerW - HOTBAR_SLOT_W) / 2;
  return {
    panelX,
    panelY,
    panelW,
    panelH,
    innerW,
    border,
    slotX,
    slotTopY: stackTop,
  };
}

function hotbarSlotFromScreenPoint(x: number, y: number) {
  const { slotX, slotTopY } = towerShopPanelLayout();
  if (x < slotX || x > slotX + HOTBAR_SLOT_W) {
    return null;
  }
  for (let index = 0; index < TOWER_ORDER.length; index += 1) {
    const top = slotTopY + index * (HOTBAR_SLOT_H + HOTBAR_GAP);
    if (y >= top && y <= top + HOTBAR_SLOT_H) {
      return TOWER_ORDER[index];
    }
  }
  return null;
}

/** True if click is anywhere on the tower shop panel (backdrop + chrome), not placement. */
function pointerHitsTowerShopPanel(px: number, py: number) {
  const { panelX, panelY, panelW, panelH } = towerShopPanelLayout();
  return px >= panelX && px <= panelX + panelW && py >= panelY && py <= panelY + panelH;
}

/** World position under the cursor in tower-defense scene (for placement ghost and builds). */
function towerCursorWorld() {
  if (!localPlayer || localPlayer.scene !== "towerDefense") {
    return null;
  }
  const cam = getCameraCenter();
  return {
    x: screenToWorldX(cam.x, pointerClientX),
    y: screenToWorldY(cam.y, pointerClientY)
  };
}

function towerOverlapsBlockedTile(x: number, y: number, radius: number) {
  for (let gy = 0; gy < GRID_ROWS; gy += 1) {
    for (let gx = 0; gx < GRID_COLUMNS; gx += 1) {
      const key = gridTileKey({ gx, gy });
      if (!PATH_TILES.has(key) && !BASE_TILES.has(key)) {
        continue;
      }
      const minX = GRID_ORIGIN_X + gx * GRID_SIZE;
      const minY = GRID_ORIGIN_Y + gy * GRID_SIZE;
      const maxX = minX + GRID_SIZE;
      const maxY = minY + GRID_SIZE;
      const nearestX = clamp(x, minX, maxX);
      const nearestY = clamp(y, minY, maxY);
      if (Math.hypot(x - nearestX, y - nearestY) < radius) {
        return true;
      }
    }
  }
  return false;
}

function getTowerPlacementError(x: number, y: number, spec: TowerSpec) {
  if (!localPlayer || localPlayer.scene !== "towerDefense") {
    return "Enter a tower defense round first.";
  }
  if (towerDefenseGame.gameOver) {
    return "The round is over.";
  }
  const playerState = localMatchPlayerState();
  if (!playerState || playerState.money < spec.cost) {
    return `Need $${spec.cost}.`;
  }
  if (
    x - spec.radius < 0 ||
    y - spec.radius < 0 ||
    x + spec.radius > TOWER_DEFENSE_WORLD.width ||
    y + spec.radius > TOWER_DEFENSE_WORLD.height
  ) {
    return "Too close to the edge.";
  }
  if (towerOverlapsBlockedTile(x, y, spec.radius)) {
    return "Tower hitbox overlaps the path or base.";
  }
  for (const tower of towerDefenseGame.towers) {
    const otherSpec = TOWER_SPECS[tower.type];
    if (Math.hypot(tower.x - x, tower.y - y) < otherSpec.radius + spec.radius + 6) {
      return "Tower hitbox overlaps another tower.";
    }
  }
  return null;
}

function placeSelectedTower() {
  if (!towerShopArmed) {
    setStatus("Choose a tower in the shop first, then click the map.", isFirebaseConfigured ? "online" : "offline");
    return;
  }
  const pos = towerCursorWorld();
  if (!pos) {
    return;
  }
  const spec = selectedTowerSpec();
  const error = getTowerPlacementError(pos.x, pos.y, spec);
  if (error) {
    setStatus(error, "error");
    return;
  }
  if (isFirebaseConfigured && matchSync && localPlayer) {
    towerShopArmed = false;
    void matchSync.submitPlaceTower(spec.type, pos.x, pos.y).catch((networkError: unknown) => {
      setStatus(`Place failed: ${networkError instanceof Error ? networkError.message : "network error"}`, "error");
    });
    return;
  }
  const playerState = localMatchPlayerState();
  if (!playerState) {
    return;
  }
  playerState.money -= spec.cost;
  towerDefenseGame.towers.push({
    id: `tower-${towerDefenseGame.nextTowerId}`,
    ownerId: localPlayer?.id ?? OFFLINE_PLAYER_ID,
    type: spec.type,
    x: pos.x,
    y: pos.y,
    cooldown: 0
  });
  towerDefenseGame.nextTowerId += 1;
  towerShopArmed = false;
  setStatus(`${spec.name} placed.`, isFirebaseConfigured ? "online" : "offline");
}

function updateTowerDefenseGame(deltaSeconds: number) {
  if (!localPlayer || localPlayer.scene !== "towerDefense" || towerDefenseGame.gameOver) {
    return;
  }
  if (isFirebaseConfigured && localPlayer.matchId) {
    return;
  }

  const waveConfig = currentWaveConfig();
  if (towerDefenseGame.waveBreakTimer > 0) {
    towerDefenseGame.waveBreakTimer = Math.max(0, towerDefenseGame.waveBreakTimer - deltaSeconds);
  } else if (towerDefenseGame.spawnedThisWave < waveConfig.totalEnemies) {
    towerDefenseGame.spawnTimer -= deltaSeconds;
    if (towerDefenseGame.spawnTimer <= 0) {
      spawnEnemy(enemyTemplateForWave(towerDefenseGame.wave, towerDefenseGame.spawnedThisWave));
      towerDefenseGame.spawnedThisWave += 1;
      towerDefenseGame.spawnTimer = waveConfig.spawnInterval;
    }
  }

  for (let i = towerDefenseGame.enemies.length - 1; i >= 0; i -= 1) {
    const enemy = towerDefenseGame.enemies[i];
    if (enemy.hp <= 0) {
      towerDefenseGame.enemies.splice(i, 1);
    } else if (advanceEnemy(enemy, deltaSeconds)) {
      towerDefenseGame.baseHp = Math.max(0, towerDefenseGame.baseHp - enemy.damage);
      towerDefenseGame.enemies.splice(i, 1);
    }
  }

  updateTowers(deltaSeconds);
  for (let i = towerDefenseGame.enemies.length - 1; i >= 0; i -= 1) {
    if (towerDefenseGame.enemies[i].hp <= 0) {
      towerDefenseGame.enemies.splice(i, 1);
    }
  }
  updateTowerShots(deltaSeconds);

  if (towerDefenseGame.baseHp <= 0) {
    towerDefenseGame.gameOver = true;
    towerDefenseGame.enemies.length = 0;
    setStatus("Base destroyed. You lose.", "error");
    return;
  }

  const waveComplete =
    towerDefenseGame.spawnedThisWave >= waveConfig.totalEnemies && towerDefenseGame.enemies.length === 0;
  if (waveComplete) {
    towerDefenseGame.wave += 1;
    towerDefenseGame.spawnedThisWave = 0;
    towerDefenseGame.spawnTimer = 0;
    towerDefenseGame.waveBreakTimer = WAVE_BREAK_SECONDS;
    setStatus(`Wave ${towerDefenseGame.wave} incoming...`, isFirebaseConfigured ? "online" : "offline");
  }
}

async function startMatch(mode: QueueMode, playerIds: string[]) {
  if (!localPlayer || localPlayer.scene !== "lobby") {
    return;
  }

  const sortedIds = [...playerIds].sort();
  if (!sortedIds.includes(localPlayer.id)) {
    return;
  }

  const matchId = mode === "single" ? `single-${localPlayer.id}-${Date.now()}` : `duo-${sortedIds.join("-")}`;
  const hostId = sortedIds[0];
  const isHost = localPlayer.id === hostId;
  currentMatchPlayerIds = sortedIds;
  const spawn = getMatchSpawn(sortedIds, localPlayer.id);
  localPlayer.scene = "towerDefense";
  localPlayer.matchId = matchId;
  localPlayer.x = spawn.x;
  localPlayer.y = spawn.y;
  localPlayer.facingX = 0;
  localPlayer.facingY = -1;
  localPlayer.moving = false;
  localVelocityX = 0;
  localVelocityY = 0;
  cameraX = spawn.x;
  cameraY = spawn.y;
  players.set(localPlayer.id, localPlayer);
  resetTowerDefenseGame();
  for (const playerId of sortedIds) {
    towerDefensePlayerState[playerId] = {
      money: STARTING_MONEY,
      selectedTowerType: "dart",
      readyState: "pending",
    };
  }
  selectedTowerType = "dart";
  towerShopArmed = false;
  activeQueueMode = null;
  queueEnteredAt = 0;
  // Keep filled duo queues visible briefly so both clients can observe the pair
  // before either one cleans up their own queue entry.
  scheduleQueueCleanup(mode, mode === "duo" ? 2000 : 0);
  updateSceneChrome();
  updateQueuePanel();
  setStatus(
    mode === "single" ? "Defend the base — enemies are spawning." : "Coordinate and build — waves are active.",
    isFirebaseConfigured ? "online" : "offline",
  );

  if (isFirebaseConfigured) {
    matchSync?.stop();
    if (isHost) {
      await ensureMatchRoom(database, matchId, hostId, sortedIds);
    }
    matchSync = createMatchSync(matchId, {
      database,
      localPlayerId: localPlayer.id,
      playerIds: sortedIds,
      mode,
      isHost,
      onState: (state, playerState) => {
        if (!state) {
          return;
        }
        towerDefenseGame = coerceMatchStateFromRemote(state);
        towerDefensePlayerState = playerState;
      },
      onStatus: (message) => {
        setStatus(message, message.toLowerCase().includes("lose") ? "error" : "online");
      },
    });
    await syncLocalPlayer();
  }
}

async function returnToLobby() {
  if (!localPlayer) {
    return;
  }

  clearLocalQueues();
  matchSync?.stop();
  matchSync = null;
  resetTowerDefenseGame();
  currentMatchPlayerIds = [];
  selectedTowerType = "dart";
  towerShopArmed = false;
  localPlayer.scene = "lobby";
  localPlayer.matchId = null;
  localPlayer.x = lobbyWorld.width / 2;
  localPlayer.y = 1220;
  localPlayer.facingX = DEFAULT_FACING.x;
  localPlayer.facingY = DEFAULT_FACING.y;
  localVelocityX = 0;
  localVelocityY = 0;
  cameraX = localPlayer.x;
  cameraY = localPlayer.y;
  players.set(localPlayer.id, localPlayer);
  updateSceneChrome();
  updateQueuePanel();
  setStatus(isFirebaseConfigured ? "Returned to lobby" : "Offline lobby", isFirebaseConfigured ? "online" : "offline");

  if (isFirebaseConfigured) {
    await syncLocalPlayer();
  }
}

async function syncLocalPlayer() {
  if (!localPlayer || !isFirebaseConfigured) {
    return;
  }

  const record: PlayerRecord = {
    name: localPlayer.name,
    x: Math.round(localPlayer.x),
    y: Math.round(localPlayer.y),
    facingX: localPlayer.facingX,
    facingY: localPlayer.facingY,
    moving: localPlayer.moving,
    step: localPlayer.step,
    scene: localPlayer.scene,
    matchId: localPlayer.matchId,
    lastSeen: serverTimestamp()
  };

  await set(playerRef(localPlayer.id), record);
}

function subscribeToPlayers() {
  playersUnsubscribe?.();
  playersUnsubscribe = onValue(
    playersRef(),
    (snapshot) => {
      const records = snapshot.val() as Record<string, PlayerSnapshot> | null;
      players.clear();

      if (records) {
        for (const [id, player] of Object.entries(records)) {
          players.set(id, normalizePlayer(id, player));
        }
      }

      if (localPlayer) {
        players.set(localPlayer.id, localPlayer);
      }

      updateQueuePanel();
    },
    (error) => {
      setStatus(`Lobby read failed: ${error.message}`, "error");
    }
  );
}

function subscribeToQueue(mode: QueueMode) {
  const unsubscribe = onValue(
    queueRef(mode),
    (snapshot) => {
      const records = snapshot.val() as Record<string, QueueRecord> | null;
      queues[mode].clear();

      if (records) {
        for (const [id, entry] of Object.entries(records)) {
          queues[mode].set(id, {
            id,
            name: entry.name?.trim() || `Player ${id.slice(0, 5)}`,
            queuedAt: entry.queuedAt
          });
        }
      }

      updateQueuePanel();
      if (mode === "duo") {
        resolveDuoQueue();
      }
    },
    (error) => {
      setStatus(`${mode} queue failed: ${error.message}`, "error");
    }
  );

  if (mode === "single") {
    singleQueueUnsubscribe?.();
    singleQueueUnsubscribe = unsubscribe;
  } else {
    duoQueueUnsubscribe?.();
    duoQueueUnsubscribe = unsubscribe;
  }
}

async function joinLobby(playerName: string) {
  const playerId = isFirebaseConfigured ? auth.currentUser?.uid : OFFLINE_PLAYER_ID;
  if (!playerId) {
    throw new Error("Sign in first.");
  }

  localPlayer = makePlayer(playerId, playerName);
  localVelocityX = 0;
  localVelocityY = 0;
  localMovementInput = false;
  towerShopArmed = false;
  cameraX = localPlayer.x;
  cameraY = localPlayer.y;
  hasJoinedLobby = true;
  players.clear();
  renderedPlayers.clear();
  renderStates.clear();
  queues.single.clear();
  queues.duo.clear();
  players.set(localPlayer.id, localPlayer);
  resetTowerDefenseGame();
  currentMatchPlayerIds = [];
  matchSync?.stop();
  matchSync = null;
  showGameShell();
  updateSceneChrome();
  updateQueuePanel();
  setStatus(isFirebaseConfigured ? "In lobby" : "Offline lobby", isFirebaseConfigured ? "online" : "offline");
  safeDraw();
  startAnimationLoop();

  if (isFirebaseConfigured) {
    void syncLocalPlayer().catch((error) => {
      setStatus(`Initial sync failed: ${error.message}`, "error");
    });
    onDisconnect(playerRef(localPlayer.id)).remove().catch((error) => {
      logBackgroundFailure("Disconnect cleanup failed", error);
    });
    onDisconnect(queueEntryRef("single", localPlayer.id)).remove().catch((error) => {
      logBackgroundFailure("Queue cleanup failed", error);
    });
    onDisconnect(queueEntryRef("duo", localPlayer.id)).remove().catch((error) => {
      logBackgroundFailure("Queue cleanup failed", error);
    });
    subscribeToPlayers();
    subscribeToQueue("single");
    subscribeToQueue("duo");
  }
}

function drawLobby(camera: { x: number; y: number }) {
  context.fillStyle = "#223b52";
  context.fillRect(0, 0, lobbyWorld.width, lobbyWorld.height);

  context.fillStyle = "#2f5f67";
  context.fillRect(220, 220, lobbyWorld.width - 440, lobbyWorld.height - 440);

  context.strokeStyle = "rgba(255, 255, 255, 0.08)";
  context.lineWidth = 1;
  context.beginPath();
  for (let x = 0; x <= lobbyWorld.width; x += 100) {
    context.moveTo(x, 0);
    context.lineTo(x, lobbyWorld.height);
  }
  for (let y = 0; y <= lobbyWorld.height; y += 100) {
    context.moveTo(0, y);
    context.lineTo(lobbyWorld.width, y);
  }
  context.stroke();

  context.fillStyle = "#39576f";
  context.fillRect(420, 1040, 1560, 180);
  context.fillRect(1080, 360, 240, 860);

  context.textAlign = "center";
  context.textBaseline = "middle";

  for (const pad of queuePads) {
    const isActive = activeQueueMode === pad.mode;
    const count = queueOccupancy(pad.mode);
    context.save();
    context.fillStyle = isActive ? `${pad.color}dd` : `${pad.color}99`;
    context.strokeStyle = isActive ? "#ffffff" : "rgba(255, 255, 255, 0.65)";
    context.lineWidth = isActive ? 8 : 4;
    context.beginPath();
    drawRoundedRectPath(pad.x, pad.y, pad.width, pad.height, 28);
    context.fill();
    context.stroke();

    context.fillStyle = "rgba(10, 16, 24, 0.22)";
    context.fillRect(pad.x + 24, pad.y + pad.height - 92, pad.width - 48, 64);

    context.fillStyle = "#f7fbff";
    context.font = "800 42px system-ui, sans-serif";
    context.fillText(pad.title, pad.x + pad.width / 2, pad.y + 100);
    context.font = "700 24px system-ui, sans-serif";
    context.fillText(pad.subtitle, pad.x + pad.width / 2, pad.y + 150);
    context.font = "800 30px system-ui, sans-serif";
    context.fillText(`${count} / ${pad.capacity}`, pad.x + pad.width / 2, pad.y + pad.height - 58);
    context.restore();
  }

  context.fillStyle = "#f2ead8";
  context.font = "800 34px system-ui, sans-serif";
  context.fillText("Main Lobby", lobbyWorld.width / 2, 300);
  context.font = "18px system-ui, sans-serif";
  context.fillText("Walk into Single Player or Duos to queue for tower defense.", lobbyWorld.width / 2, 340);

  const left = screenToWorldX(camera.x, 0);
  const top = screenToWorldY(camera.y, 0);
  context.strokeStyle = "rgba(255, 255, 255, 0.25)";
  context.strokeRect(left + 18, top + 18, 180, 112);
}

function drawEnemy(enemy: Enemy) {
  context.fillStyle = "rgba(0, 0, 0, 0.28)";
  context.beginPath();
  context.ellipse(enemy.x, enemy.y + enemy.radius * 0.7, enemy.radius * 0.9, enemy.radius * 0.36, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = enemy.color;
  context.strokeStyle = "#111827";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(enemy.x, enemy.y, enemy.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  const barWidth = enemy.radius * 2.2;
  const barX = enemy.x - barWidth / 2;
  const barY = enemy.y - enemy.radius - 13;
  context.fillStyle = "#111827";
  context.fillRect(barX, barY, barWidth, 5);
  context.fillStyle = "#86efac";
  context.fillRect(barX, barY, barWidth * clamp(enemy.hp / enemy.maxHp, 0, 1), 5);
}

function drawTower(tower: Tower) {
  const spec = TOWER_SPECS[tower.type];
  context.fillStyle = "rgba(0, 0, 0, 0.26)";
  context.beginPath();
  context.ellipse(tower.x, tower.y + spec.radius * 0.72, spec.radius, spec.radius * 0.42, 0, 0, Math.PI * 2);
  context.fill();

  const isOwnedByLocal = tower.ownerId === localPlayer?.id;
  context.fillStyle = isOwnedByLocal ? spec.color : "#f59e0b";
  context.strokeStyle = "#111827";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(tower.x, tower.y, spec.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#f8fafc";
  context.font = "800 11px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(isOwnedByLocal ? spec.name.slice(0, 1) : "T", tower.x, tower.y + 1);
}

function drawTowerShots() {
  for (const shot of towerDefenseGame.shots) {
    const alpha = clamp(shot.life / shot.maxLife, 0, 1);
    context.strokeStyle = `${shot.color}${Math.round(alpha * 255).toString(16).padStart(2, "0")}`;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(shot.x1, shot.y1);
    context.lineTo(shot.x2, shot.y2);
    context.stroke();
  }
}

function drawTowerCursorPreview() {
  if (!localPlayer || localPlayer.scene !== "towerDefense" || towerDefenseGame.gameOver || !towerShopArmed) {
    return;
  }
  const pos = towerCursorWorld();
  if (!pos) {
    return;
  }
  const spec = selectedTowerSpec();
  const valid = getTowerPlacementError(pos.x, pos.y, spec) === null;

  context.save();
  context.globalAlpha = valid ? 0.72 : 0.42;
  context.strokeStyle = valid ? "rgba(134, 239, 172, 0.9)" : "rgba(248, 113, 113, 0.95)";
  context.fillStyle = spec.color;
  context.lineWidth = 3;
  context.beginPath();
  context.arc(pos.x, pos.y, spec.radius, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.globalAlpha = 0.18;
  context.beginPath();
  context.arc(pos.x, pos.y, spec.range, 0, Math.PI * 2);
  context.fillStyle = valid ? "#86efac" : "#f87171";
  context.fill();
  context.restore();
}

function drawTowerDefenseHud() {
  const hpRatio = clamp(towerDefenseGame.baseHp / towerDefenseGame.baseMaxHp, 0, 1);
  const localMoney = localMatchPlayerState()?.money ?? STARTING_MONEY;
  const teammateId = currentMatchPlayerIds.find((id) => id !== localPlayer?.id);
  const teammateMoney = teammateId ? towerDefensePlayerState[teammateId]?.money ?? STARTING_MONEY : null;
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "rgba(15, 23, 42, 0.82)";
  context.fillRect(18, window.innerHeight - 152, 390, 130);
  context.strokeStyle = "rgba(226, 232, 240, 0.18)";
  context.strokeRect(18.5, window.innerHeight - 151.5, 389, 129);
  context.fillStyle = "#f8fafc";
  context.font = "800 18px system-ui, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillText(`Wave ${towerDefenseGame.wave} | You $${localMoney}`, 38, window.innerHeight - 118);
  context.font = "700 14px system-ui, sans-serif";
  context.fillText(
    `Enemies: ${towerDefenseGame.enemies.length} | Towers: ${towerDefenseGame.towers.length}`,
    38,
    window.innerHeight - 92
  );
  if (teammateMoney !== null) {
    context.fillText(`Teammate $${teammateMoney}`, 250, window.innerHeight - 118);
  }
  context.fillStyle = "#111827";
  context.fillRect(38, window.innerHeight - 76, 300, 14);
  context.fillStyle = hpRatio > 0.35 ? "#22c55e" : "#ef4444";
  context.fillRect(38, window.innerHeight - 76, 300 * hpRatio, 14);
  context.strokeStyle = "#e2e8f0";
  context.strokeRect(38.5, window.innerHeight - 75.5, 299, 13);
  context.fillStyle = "#f8fafc";
  context.fillText(`Base HP ${towerDefenseGame.baseHp}/${towerDefenseGame.baseMaxHp}`, 38, window.innerHeight - 82);

  const lay = towerShopPanelLayout();
  context.fillStyle = "rgba(15, 23, 42, 0.72)";
  context.strokeStyle = "rgba(226, 232, 240, 0.45)";
  context.lineWidth = 2;
  context.beginPath();
  drawRoundedRectPath(lay.panelX, lay.panelY, lay.panelW, lay.panelH, TOWER_SHOP_CORNER_RADIUS);
  context.closePath();
  context.fill();
  context.stroke();
  context.strokeStyle = "rgba(96, 165, 250, 0.35)";
  context.lineWidth = 1;
  context.beginPath();
  drawRoundedRectPath(lay.panelX + 5, lay.panelY + 5, lay.panelW - 10, lay.panelH - 10, TOWER_SHOP_CORNER_RADIUS - 4);
  context.closePath();
  context.stroke();

  context.fillStyle = "#cbd5f5";
  context.font = "900 13px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText("Tower shop", lay.panelX + lay.panelW / 2, lay.panelY + lay.border + TOWER_SHOP_INNER_PAD + 14);

  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = "700 11px system-ui, sans-serif";
  context.fillStyle = "rgba(226, 232, 240, 0.7)";
  context.fillText(towerShopArmed ? "Placing — Esc to cancel" : "Pick a tower, then click the map.", lay.slotX - 10, lay.slotTopY - 14);

  for (const [index, type] of TOWER_ORDER.entries()) {
    const spec = TOWER_SPECS[type];
    const selected = selectedTowerType === type;
    const slotTop = lay.slotTopY + index * (HOTBAR_SLOT_H + HOTBAR_GAP);
    context.fillStyle = selected ? "rgba(96, 165, 250, 0.55)" : "rgba(30, 41, 59, 0.95)";
    context.fillRect(lay.slotX, slotTop, HOTBAR_SLOT_W, HOTBAR_SLOT_H);
    context.strokeStyle = selected ? "#bfdbfe" : "rgba(226, 232, 240, 0.25)";
    context.lineWidth = selected ? 2 : 1;
    context.strokeRect(lay.slotX + 0.5, slotTop + 0.5, HOTBAR_SLOT_W - 1, HOTBAR_SLOT_H - 1);
    context.fillStyle = localMoney >= spec.cost ? "#f8fafc" : "#fca5a5";
    context.font = "800 10px system-ui, sans-serif";
    context.fillText(`${index + 1} ${spec.name}`, lay.slotX + 6, slotTop + 16);
    context.fillText(`$${spec.cost}`, lay.slotX + 6, slotTop + 28);
  }

  if (towerDefenseGame.gameOver) {
    context.fillStyle = "rgba(127, 29, 29, 0.92)";
    context.fillRect(window.innerWidth / 2 - 210, window.innerHeight / 2 - 70, 420, 140);
    context.fillStyle = "#fee2e2";
    context.textAlign = "center";
    context.font = "900 34px system-ui, sans-serif";
    context.fillText("YOU LOSE", window.innerWidth / 2, window.innerHeight / 2 - 12);
    context.font = "16px system-ui, sans-serif";
    context.fillText("The base HP reached 0. Press Escape to return to the lobby.", window.innerWidth / 2, window.innerHeight / 2 + 26);
  }
  context.restore();
}

function drawTowerDefenseGame() {
  context.fillStyle = "#1f2634";
  context.fillRect(0, 0, TOWER_DEFENSE_WORLD.width, TOWER_DEFENSE_WORLD.height);

  for (let gy = 0; gy < GRID_ROWS; gy += 1) {
    for (let gx = 0; gx < GRID_COLUMNS; gx += 1) {
      const x = GRID_ORIGIN_X + gx * GRID_SIZE;
      const y = GRID_ORIGIN_Y + gy * GRID_SIZE;
      const key = gridTileKey({ gx, gy });
      const isSpawn = gx === ENEMY_PATH[0].gx && gy === ENEMY_PATH[0].gy;
      context.fillStyle = BASE_TILES.has(key) ? "#8f3434" : isSpawn ? "#356d8f" : PATH_TILES.has(key) ? "#b98b54" : "#24344b";
      context.fillRect(x + 1, y + 1, GRID_SIZE - 2, GRID_SIZE - 2);
      context.strokeStyle = "rgba(255, 255, 255, 0.08)";
      context.lineWidth = 1;
      context.strokeRect(x + 0.5, y + 0.5, GRID_SIZE - 1, GRID_SIZE - 1);
    }
  }

  context.strokeStyle = "rgba(255, 244, 202, 0.72)";
  context.lineWidth = 4;
  context.beginPath();
  for (const [index, point] of ENEMY_PATH.entries()) {
    const center = tileCenter(point);
    if (index === 0) {
      context.moveTo(center.x, center.y);
    } else {
      context.lineTo(center.x, center.y);
    }
  }
  context.stroke();

  context.fillStyle = "#dbeafe";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "900 22px system-ui, sans-serif";
  context.fillText("SPAWN", tileCenter(ENEMY_PATH[0]).x, tileCenter(ENEMY_PATH[0]).y);
  context.fillText("BASE", tileCenter({ gx: 15, gy: 6 }).x, tileCenter({ gx: 15, gy: 6 }).y);

  for (const enemy of towerDefenseGame.enemies) {
    drawEnemy(enemy);
  }
  for (const tower of towerDefenseGame.towers) {
    drawTower(tower);
  }
  drawTowerShots();
  drawTowerCursorPreview();

  context.fillStyle = "#f2ead8";
  context.font = "900 38px system-ui, sans-serif";
  context.fillText("Tower Defense", TOWER_DEFENSE_WORLD.width / 2, 92);

  drawTowerDefenseHud();
}

function drawPlayer(player: Player, isLocal: boolean) {
  const facingLength = Math.max(1, Math.hypot(player.facingX, player.facingY));
  const facingX = player.facingX / facingLength;
  const facingY = player.facingY / facingLength;
  const sideX = -facingY;
  const sideY = facingX;
  const walkAnimating = isLocal ? localMovementInput : player.moving;
  const limbPhase = player.step * 5.2;
  const footSwing = walkAnimating ? Math.sin(limbPhase) : 0;
  const handSwing = walkAnimating ? Math.sin(limbPhase + Math.PI) * 0.55 : 0;
  const bodyColor = isLocal ? "#f7f4e8" : "#9dc6ff";
  const handColor = isLocal ? "#e2ddd0" : "#7eb0e8";
  const outlineColor = "#1f2430";

  context.fillStyle = "rgba(0, 0, 0, 0.24)";
  context.beginPath();
  context.ellipse(player.x, player.y + 22, 25, 12, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#334155";
  context.strokeStyle = outlineColor;
  context.lineWidth = 4;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.arc(
      player.x + sideX * side * 20 + facingX * (20 + footSwing * side * 8),
      player.y + sideY * side * 20 + facingY * (20 + footSwing * side * 8),
      9,
      0,
      Math.PI * 2
    );
    context.fill();
    context.stroke();
  }

  context.fillStyle = handColor;
  context.strokeStyle = outlineColor;
  context.lineWidth = 3;
  for (const side of [-1, 1]) {
    context.beginPath();
    context.arc(
      player.x + sideX * side * ARM_SIDE_OFFSET + facingX * (ARM_FORWARD_OFFSET + handSwing * side * 5),
      player.y + sideY * side * ARM_SIDE_OFFSET + facingY * (ARM_FORWARD_OFFSET + handSwing * side * 5),
      HAND_RADIUS,
      0,
      Math.PI * 2
    );
    context.fill();
    context.stroke();
  }

  context.fillStyle = bodyColor;
  context.beginPath();
  context.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = "#111827";
  context.beginPath();
  context.arc(player.x + facingX * 10 + sideX * 9, player.y + facingY * 10 + sideY * 9, 4, 0, Math.PI * 2);
  context.arc(player.x + facingX * 10 - sideX * 9, player.y + facingY * 10 - sideY * 9, 4, 0, Math.PI * 2);
  context.fill();
}

function draw() {
  updateSceneChrome();
  updateQueuePanel();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, canvas.width, canvas.height);

  const camera = getCameraCenter();
  context.save();
  context.setTransform(
    CAMERA_ZOOM,
    0,
    0,
    CAMERA_ZOOM,
    Math.round(window.innerWidth / 2 - camera.x * CAMERA_ZOOM),
    Math.round(window.innerHeight / 2 - camera.y * CAMERA_ZOOM)
  );

  if (localPlayer?.scene === "towerDefense") {
    drawTowerDefenseGame();
  } else {
    drawLobby(camera);
  }

  const playersToDraw = [...renderedPlayers.values()];
  if (localPlayer && !renderedPlayers.has(localPlayer.id)) {
    playersToDraw.push(localPlayer);
  }

  for (const player of playersToDraw) {
    drawPlayer(player, player.id === localPlayer?.id);
  }
  context.restore();

  context.fillStyle = "#f7fbff";
  context.font = "700 14px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  for (const player of playersToDraw) {
    context.fillText(
      player.id === localPlayer?.id ? "You" : player.name,
      worldToScreenX(camera.x, player.x),
      worldToScreenY(camera.y, player.y - PLAYER_RADIUS - 10)
    );
  }
}

function drawRenderErrorFrame(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown render error";
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.fillStyle = "#1e293b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#fee2e2";
  context.font = "700 18px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("The lobby failed to render.", canvas.width / 2, canvas.height / 2 - 16);
  context.font = "14px system-ui, sans-serif";
  context.fillText(message, canvas.width / 2, canvas.height / 2 + 14);
}

function safeDraw() {
  try {
    draw();
  } catch (error) {
    setStatus("Render failed. Check console for details.", "error");
    drawRenderErrorFrame(error);
    console.error(error);
  }
}

function tick(frameAt: number) {
  const deltaSeconds = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
  lastFrameAt = frameAt;

  updateLocalPlayer(deltaSeconds);
  updateTowerDefenseGame(deltaSeconds);
  updateQueueState(frameAt);
  updateRenderedPlayers(deltaSeconds);
  updateCamera(deltaSeconds);

  if (isFirebaseConfigured && hasJoinedLobby && localPlayer && frameAt - lastSyncAt > SYNC_INTERVAL_MS) {
    lastSyncAt = frameAt;
    void syncLocalPlayer().catch((error) => {
      setStatus(`Sync failed: ${error.message}`, "error");
    });
  }

  safeDraw();
  requestAnimationFrame(tick);
}

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) {
    return;
  }

  if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
    keys.add(event.code);
    if (event.code.startsWith("Key")) {
      event.preventDefault();
    }
  } else if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].includes(event.code) && localPlayer?.scene === "towerDefense") {
    const slot = Number(event.code.replace("Digit", "")) - 1;
    selectedTowerType = TOWER_ORDER[slot] ?? selectedTowerType;
    towerShopArmed = true;
    if (isFirebaseConfigured && matchSync) {
      void matchSync.submitSelectedTower(selectedTowerType).catch(() => undefined);
    }
    const spec = selectedTowerSpec();
    setStatus(`Selected ${spec.name} ($${spec.cost}). Click the map to place.`, isFirebaseConfigured ? "online" : "offline");
    event.preventDefault();
  } else if (event.code === "Escape" && localPlayer?.scene === "towerDefense") {
    if (towerShopArmed) {
      towerShopArmed = false;
      setStatus("Placement cancelled.", isFirebaseConfigured ? "online" : "offline");
      event.preventDefault();
      return;
    }
    void returnToLobby();
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

window.addEventListener("pointermove", (event) => {
  if (!localPlayer) {
    return;
  }
  pointerClientX = event.clientX;
  pointerClientY = event.clientY;
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || localPlayer?.scene !== "towerDefense") {
    return;
  }
  const clickedSlot = hotbarSlotFromScreenPoint(event.clientX, event.clientY);
  if (clickedSlot !== null) {
    selectedTowerType = clickedSlot;
    towerShopArmed = true;
    if (isFirebaseConfigured && matchSync) {
      void matchSync.submitSelectedTower(selectedTowerType).catch(() => undefined);
    }
    const spec = selectedTowerSpec();
    setStatus(`Selected ${spec.name} ($${spec.cost}). Click the map to place.`, isFirebaseConfigured ? "online" : "offline");
    event.preventDefault();
    return;
  }
  if (pointerHitsTowerShopPanel(event.clientX, event.clientY)) {
    event.preventDefault();
    return;
  }
  placeSelectedTower();
  event.preventDefault();
});

offlineForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setAuthPending(true);
  menuError.textContent = "";
  void joinLobby(offlineName.value)
    .catch((error) => {
      menuError.textContent = error instanceof Error ? error.message : "Could not start offline mode.";
    })
    .finally(() => {
      setAuthPending(false);
    });
});

signInTab.addEventListener("click", () => {
  setAuthMode("signin");
});

createTab.addEventListener("click", () => {
  setAuthMode("create");
});

signInForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setAuthPending(true);
  menuError.textContent = "";
  void signInFirebaseAccount(signInEmail.value, signInPassword.value)
    .then((result) => joinLobby(result.displayName))
    .catch((error) => {
      menuError.textContent = error instanceof Error ? error.message : "Sign in failed.";
    })
    .finally(() => {
      setAuthPending(false);
    });
});

createForm.addEventListener("submit", (event) => {
  event.preventDefault();
  setAuthPending(true);
  menuError.textContent = "";
  void createFirebaseAccount(createUsername.value, createEmail.value, createPassword.value)
    .then((result) => joinLobby(result.displayName))
    .catch((error) => {
      menuError.textContent = error instanceof Error ? error.message : "Account creation failed.";
    })
    .finally(() => {
      setAuthPending(false);
    });
});

leaveGameButton.addEventListener("click", () => {
  void returnToLobby();
});

window.addEventListener("beforeunload", () => {
  matchSync?.stop();
  if (!localPlayer || !isFirebaseConfigured) {
    return;
  }
  void remove(playerRef(localPlayer.id));
  void remove(queueEntryRef("single", localPlayer.id));
  void remove(queueEntryRef("duo", localPlayer.id));
});

if (!isFirebaseConfigured) {
  authCard.classList.add("is-hidden");
  offlineForm.classList.remove("is-hidden");
}
