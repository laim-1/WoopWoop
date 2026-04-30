import { get, onDisconnect, onValue, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Unsubscribe } from "firebase/database";
import { database, isFirebaseConfigured, signInPlayer } from "./firebase";
import "./styles.css";

type Area = "forest" | "home";
type CharacterId = "boybrown" | "girlblonde" | "girlbrown";

type CharacterOption = {
  id: CharacterId;
  label: string;
  src: string;
  sprites?: Partial<Record<AnimationState, string>>;
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

type AnimationState = "idle" | "walk" | "run" | "jump";
type SpriteLayer = "shadow" | "body" | "head";
type IdlePlaybackState = {
  nextStartAt: number;
  activeStartAt: number;
  activeEndAt: number;
};
type ForestTilemap = {
  width: number;
  height: number;
  tileWidth: number;
  tileHeight: number;
  drawTileWidth: number;
  drawTileHeight: number;
  columns: number;
  firstGid: number;
  layers: number[][][];
  image: HTMLImageElement;
};
type StoredAccount = {
  username: string;
  normalizedUsername?: string;
  passwordHash: string;
  characterId: CharacterId;
  createdAt?: number | object;
  lastLoginAt?: number | object;
  uid?: string;
};
type AccountsStore = Record<string, StoredAccount>;

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const assetBase = import.meta.env.BASE_URL;
const BASE_WORLD_WIDTH = 960;
const BASE_WORLD_HEIGHT = 640;
const titleLogoSrc = `${assetBase}assets/branding/title-logo.png`;
const characters: CharacterOption[] = [
  {
    id: "boybrown",
    label: "Boy Brown",
    src: `${assetBase}assets/characters/unarmed-run-head.png`,
    sprites: {
      idle: `${assetBase}assets/characters/unarmed-idle-shadow.png`,
      run: `${assetBase}assets/characters/unarmed-run-shadow.png`,
      walk: `${assetBase}assets/characters/unarmed-walk-shadow.png`,
      jump: `${assetBase}assets/characters/unarmed-run-head.png`
    }
  },
  { id: "girlblonde", label: "Girl Blonde", src: `${assetBase}assets/characters/girlblonde.png` },
  { id: "girlbrown", label: "Girl Brown", src: `${assetBase}assets/characters/girlbrown.png` }
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

const world = {
  width: BASE_WORLD_WIDTH,
  height: BASE_WORLD_HEIGHT,
  playerRadius: 24
};

const DEVTOOLS_PASSWORD = "0310";
const DEFAULT_FACING = { x: 0, y: 1 };
const FOREST_AREA: Area = "forest";
const HOME_AREA: Area = "home";
const TRANSITION_PADDING = 24;
const REMOTE_INTERPOLATION_SPEED = 12;
const SYNC_INTERVAL_MS = 90;
const CHAT_LIMIT = 20;
const CHAT_MAX_LENGTH = 120;
const SPRITE_SIZE = 110;
const SPRITE_FRAME_SIZE = 64;
const SPRITE_IDLE_COLUMNS = 12;
const SPRITE_WALK_COLUMNS = 6;
const SPRITE_RUN_COLUMNS = 8;
const IDLE_FRAME_MS = 110;
const IDLE_MIN_INTERVAL_MS = 10_000;
const IDLE_MAX_INTERVAL_MS = 20_000;
const DEFAULT_CHARACTER_ID: CharacterId = characters[0].id;
const WALK_SPEED = 220;
const RUN_SPEED = 320;
const OFFLINE_PLAYER_ID = "offline-local-player";
const CAMERA_ZOOM = 2;
const FOREST_TILEMAP_PATH = `${assetBase}assets/maps/forest-map.json`;
const LOCAL_ACCOUNTS_KEY = "woopwoop.accounts.v1";

const keys = new Set<string>();
const players = new Map<string, Player>();
const renderedPlayers = new Map<string, Player>();
const renderStates = new Map<string, RenderState>();
const kickedPlayerIds = new Set<string>();
const chatMessagesById = new Map<string, ChatMessage & { id: string }>();
const characterImages = new Map<CharacterId, HTMLImageElement>();
const spriteImages = new Map<string, HTMLImageElement>();
const layeredSpriteImages = new Map<string, HTMLImageElement>();
const idlePlaybackStates = new Map<string, IdlePlaybackState>();
let selectedCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
let localPlayer: Player | null = null;
let lastFrameAt = performance.now();
let lastSyncAt = 0;
let playersUnsubscribe: Unsubscribe | null = null;
let kickedUnsubscribe: Unsubscribe | null = null;
let chatUnsubscribe: Unsubscribe | null = null;
let animationStarted = false;
let devtoolsUnlocked = false;
let hasJoinedLobby = false;
let forestTilemap: ForestTilemap | null = null;

for (const character of characters) {
  const image = new Image();
  image.src = character.src;
  characterImages.set(character.id, image);

  if (character.sprites) {
    for (const [state, src] of Object.entries(character.sprites)) {
      if (!src) {
        continue;
      }

      const spriteImage = new Image();
      spriteImage.src = src;
      spriteImages.set(`${character.id}:${state}`, spriteImage);
    }
  }
}

function preloadLayeredSprite(characterId: CharacterId, state: AnimationState, layer: SpriteLayer, src: string) {
  const spriteImage = new Image();
  spriteImage.src = src;
  layeredSpriteImages.set(`${characterId}:${state}:${layer}`, spriteImage);
}

preloadLayeredSprite("boybrown", "idle", "shadow", `${assetBase}assets/characters/unarmed-idle-shadow.png`);
preloadLayeredSprite("boybrown", "idle", "body", `${assetBase}assets/characters/unarmed-idle-body.png`);
preloadLayeredSprite("boybrown", "idle", "head", `${assetBase}assets/characters/unarmed-idle-head.png`);
preloadLayeredSprite("boybrown", "walk", "shadow", `${assetBase}assets/characters/unarmed-walk-shadow.png`);
preloadLayeredSprite("boybrown", "walk", "body", `${assetBase}assets/characters/unarmed-walk-body.png`);
preloadLayeredSprite("boybrown", "walk", "head", `${assetBase}assets/characters/unarmed-walk-head.png`);
preloadLayeredSprite("boybrown", "run", "shadow", `${assetBase}assets/characters/unarmed-run-shadow.png`);
preloadLayeredSprite("boybrown", "run", "body", `${assetBase}assets/characters/unarmed-run-body.png`);
preloadLayeredSprite("boybrown", "run", "head", `${assetBase}assets/characters/unarmed-run-head.png`);

function getSpriteImage(characterId: CharacterId, state: AnimationState) {
  return spriteImages.get(`${characterId}:${state}`);
}

function resolveMapAssetPath(mapPath: string, assetPath: string) {
  if (assetPath.startsWith("http://") || assetPath.startsWith("https://") || assetPath.startsWith("/")) {
    return assetPath;
  }

  const lastSlash = mapPath.lastIndexOf("/");
  const basePath = lastSlash >= 0 ? mapPath.slice(0, lastSlash + 1) : "";
  return `${basePath}${assetPath}`;
}

async function loadImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function toLayerRows(flatData: number[], width: number, height: number) {
  const rows: number[][] = [];

  for (let y = 0; y < height; y += 1) {
    const start = y * width;
    rows.push(flatData.slice(start, start + width));
  }

  return rows;
}

function toSparseLayerRows(
  tiles: Array<{ id: string | number; x: number; y: number }>,
  width: number,
  height: number,
) {
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => 0));

  for (const tile of tiles) {
    if (tile.x < 0 || tile.x >= width || tile.y < 0 || tile.y >= height) {
      continue;
    }

    const id = typeof tile.id === "string" ? Number(tile.id) : tile.id;
    if (!Number.isFinite(id)) {
      continue;
    }

    // Sparse map uses 0-based tile ids while renderer uses 1-based gid.
    rows[tile.y][tile.x] = id + 1;
  }

  return rows;
}

async function loadForestTilemap() {
  try {
    const response = await fetch(FOREST_TILEMAP_PATH);
    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as Record<string, unknown>;
    const tiledLayers = Array.isArray(data.layers)
      ? data.layers.filter(
          (layer): layer is { data: number[]; type: string } =>
            Boolean(layer) &&
            typeof layer === "object" &&
            (layer as { type?: unknown }).type === "tilelayer" &&
            Array.isArray((layer as { data?: unknown }).data),
        )
      : [];
    const tiledTileset = Array.isArray(data.tilesets)
      ? (data.tilesets.find((tileset) => typeof tileset === "object" && tileset !== null) as
          | { firstgid?: number; image?: string; columns?: number }
          | undefined)
      : undefined;

    if (
      typeof data.width === "number" &&
      typeof data.height === "number" &&
      typeof data.tilewidth === "number" &&
      typeof data.tileheight === "number" &&
      tiledTileset &&
      typeof tiledTileset.image === "string" &&
      typeof tiledTileset.columns === "number" &&
      tiledLayers.length > 0
    ) {
      const imagePath = resolveMapAssetPath(FOREST_TILEMAP_PATH, tiledTileset.image);
      const image = await loadImage(imagePath);
      const loadedMap: ForestTilemap = {
        width: data.width,
        height: data.height,
        tileWidth: data.tilewidth,
        tileHeight: data.tileheight,
        drawTileWidth: world.width / data.width,
        drawTileHeight: world.height / data.height,
        columns: tiledTileset.columns,
        firstGid: tiledTileset.firstgid ?? 1,
        layers: tiledLayers.map((layer) => toLayerRows(layer.data, data.width as number, data.height as number)),
        image
      };
      forestTilemap = loadedMap;
      return;
    }

    if (
      typeof data.mapWidth === "number" &&
      typeof data.mapHeight === "number" &&
      typeof data.tileSize === "number" &&
      Array.isArray(data.layers)
    ) {
      const sparseLayers = data.layers.filter(
        (layer): layer is { tiles: Array<{ id: string | number; x: number; y: number }> } =>
          Boolean(layer) &&
          typeof layer === "object" &&
          Array.isArray((layer as { tiles?: unknown }).tiles),
      );

      if (sparseLayers.length > 0) {
        const imagePath = `${assetBase}assets/maps/forest-tileset.png`;
        const image = await loadImage(imagePath);
        const loadedMap: ForestTilemap = {
          width: data.mapWidth,
          height: data.mapHeight,
          tileWidth: data.tileSize,
          tileHeight: data.tileSize,
          drawTileWidth: world.width / data.mapWidth,
          drawTileHeight: world.height / data.mapHeight,
          columns: Math.max(1, Math.floor(image.naturalWidth / data.tileSize)),
          firstGid: 1,
          layers: sparseLayers.map((layer) => toSparseLayerRows(layer.tiles, data.mapWidth as number, data.mapHeight as number)),
          image
        };
        forestTilemap = loadedMap;
        return;
      }
    }

    if (
      typeof data.width === "number" &&
      typeof data.height === "number" &&
      typeof data.tileSize === "number" &&
      typeof data.tileset === "string" &&
      typeof data.tilesetColumns === "number" &&
      Array.isArray(data.layers)
    ) {
      const imagePath = resolveMapAssetPath(FOREST_TILEMAP_PATH, data.tileset);
      const image = await loadImage(imagePath);
      const layers = (data.layers as unknown[]).filter(Array.isArray).map((layer) => layer as number[]);
      const loadedMap: ForestTilemap = {
        width: data.width,
        height: data.height,
        tileWidth: data.tileSize,
        tileHeight: data.tileSize,
        drawTileWidth: world.width / data.width,
        drawTileHeight: world.height / data.height,
        columns: data.tilesetColumns,
        firstGid: 1,
        layers: layers.map((flatLayer) => toLayerRows(flatLayer, data.width as number, data.height as number)),
        image
      };
      forestTilemap = loadedMap;
    }
  } catch (error) {
    console.warn("Could not load forest tilemap.", error);
  }
}

function getLayeredSpriteImage(characterId: CharacterId, state: AnimationState, layer: SpriteLayer) {
  return layeredSpriteImages.get(`${characterId}:${state}:${layer}`);
}

function resolveAnimationState(player: Player, isLocal: boolean): AnimationState {
  if (!player.moving) {
    return "idle";
  }

  if (isLocal && (keys.has("ShiftLeft") || keys.has("ShiftRight"))) {
    return "run";
  }

  return "walk";
}

function resolveDirectionRow(player: Player) {
  if (Math.abs(player.facingX) > Math.abs(player.facingY)) {
    return player.facingX < 0 ? 1 : 2;
  }

  return player.facingY < 0 ? 3 : 0;
}

function randomIdleDelayMs() {
  return IDLE_MIN_INTERVAL_MS + Math.random() * (IDLE_MAX_INTERVAL_MS - IDLE_MIN_INTERVAL_MS);
}

function getIdleFrameColumn(player: Player, frameAtMs: number, idleFrameCount: number) {
  const state = idlePlaybackStates.get(player.id) ?? {
    nextStartAt: frameAtMs + randomIdleDelayMs(),
    activeStartAt: 0,
    activeEndAt: 0
  };
  idlePlaybackStates.set(player.id, state);

  if (player.moving) {
    state.activeStartAt = 0;
    state.activeEndAt = 0;
    state.nextStartAt = frameAtMs + randomIdleDelayMs();
    return 0;
  }

  if (state.activeStartAt === 0 && frameAtMs >= state.nextStartAt) {
    state.activeStartAt = frameAtMs;
    state.activeEndAt = frameAtMs + IDLE_FRAME_MS * idleFrameCount;
    state.nextStartAt = state.activeEndAt + randomIdleDelayMs();
  }

  if (state.activeStartAt === 0 || frameAtMs >= state.activeEndAt) {
    state.activeStartAt = 0;
    state.activeEndAt = 0;
    return 0;
  }

  return Math.min(Math.floor((frameAtMs - state.activeStartAt) / IDLE_FRAME_MS), idleFrameCount - 1);
}

function getFrameCountForDirection(state: AnimationState, directionRow: number) {
  if (state === "idle") {
    // Provided idle sheets only include 4 frames on the north-facing row.
    return directionRow === 3 ? 4 : SPRITE_IDLE_COLUMNS;
  }

  if (state === "walk") {
    return SPRITE_WALK_COLUMNS;
  }

  return SPRITE_RUN_COLUMNS;
}

function resolveFrameColumn(player: Player, state: AnimationState, frameAtMs: number, directionRow: number) {
  const frameCount = getFrameCountForDirection(state, directionRow);

  if (state === "idle") {
    return getIdleFrameColumn(player, frameAtMs, frameCount);
  }

  return Math.floor(player.step % frameCount);
}

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
    return { x: fallbackX, y: fallbackY };
  }

  const halfViewWidth = canvas.width / (2 * CAMERA_ZOOM);
  const halfViewHeight = canvas.height / (2 * CAMERA_ZOOM);
  return {
    x: clamp(localPlayer.x, halfViewWidth, world.width - halfViewWidth),
    y: clamp(localPlayer.y, halfViewHeight, world.height - halfViewHeight)
  };
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

function normalizeArea(area: PlayerSnapshot["area"]): Area {
  return area === HOME_AREA ? HOME_AREA : FOREST_AREA;
}

function normalizeCharacterId(characterId: PlayerSnapshot["characterId"]): CharacterId {
  return characters.some((character) => character.id === characterId) ? (characterId as CharacterId) : DEFAULT_CHARACTER_ID;
}

function currentArea(): Area {
  return localPlayer?.area ?? FOREST_AREA;
}

function makePlayer(userId: string, name: string): Player {
  return {
    id: userId,
    x: world.width / 2 + Math.random() * 120 - 60,
    y: world.height / 2 + Math.random() * 120 - 60,
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

function accountRefByUsername(normalizedUsername: string) {
  return ref(database, `accounts/usernames/${usernameStoreKey(normalizedUsername)}`);
}

function accountLastLoginRef(normalizedUsername: string) {
  return ref(database, `accounts/usernames/${usernameStoreKey(normalizedUsername)}/lastLoginAt`);
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

  localPlayer.moving = dx !== 0 || dy !== 0;

  if (localPlayer.moving) {
    const length = Math.hypot(dx, dy);
    const normalizedX = dx / length;
    const normalizedY = dy / length;
    localPlayer.facingX = normalizedX;
    localPlayer.facingY = normalizedY;
    const sprinting = keys.has("ShiftLeft") || keys.has("ShiftRight");
    const speed = sprinting ? RUN_SPEED : WALK_SPEED;
    const animationSpeed = sprinting ? 13 : 9;
    localPlayer.step += deltaSeconds * animationSpeed;
    localPlayer.x += normalizedX * speed * deltaSeconds;
    localPlayer.y += normalizedY * speed * deltaSeconds;
  } else {
    localPlayer.step = 0;
  }

  localPlayer.x = clamp(localPlayer.x, world.playerRadius, world.width - world.playerRadius);
  localPlayer.y = clamp(localPlayer.y, world.playerRadius, world.height - world.playerRadius);

  if (localPlayer.area === FOREST_AREA && localPlayer.x <= world.playerRadius) {
    localPlayer.area = HOME_AREA;
    localPlayer.x = world.width - world.playerRadius - TRANSITION_PADDING;
    localPlayer.y = world.height / 2;
    localPlayer.facingX = -1;
    localPlayer.facingY = 0;
    setStatus("Entered home", "online");
  } else if (localPlayer.area === HOME_AREA && localPlayer.x >= world.width - world.playerRadius) {
    localPlayer.area = FOREST_AREA;
    localPlayer.x = world.playerRadius + TRANSITION_PADDING;
    localPlayer.y = world.height / 2;
    localPlayer.facingX = 1;
    localPlayer.facingY = 0;
    setStatus("Entered main plaza", "online");
  }
}

function updateRenderedPlayers(deltaSeconds: number) {
  renderedPlayers.clear();

  for (const [id, player] of players) {
    if (player.area !== currentArea()) {
      renderStates.delete(id);
      idlePlaybackStates.delete(id);
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
      idlePlaybackStates.delete(id);
    }
  }
}

function drawForest() {
  context.fillStyle = "#314529";
  context.fillRect(0, 0, world.width, world.height);
  context.strokeStyle = "rgba(72, 94, 62, 0.34)";
  context.lineWidth = 1;

  for (let x = 0; x <= world.width; x += 40) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, world.height);
    context.stroke();
  }

  for (let y = 0; y <= world.height; y += 40) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(world.width, y);
    context.stroke();
  }

  context.fillStyle = "rgba(18, 31, 16, 0.72)";
  context.fillRect(0, 0, 18, world.height);
  context.fillStyle = "#d8c9aa";
  context.font = "16px system-ui, sans-serif";
  context.textAlign = "left";
  context.fillText("Home entrance", 28, world.height / 2 - 12);
}

function drawForestTilemap() {
  if (!forestTilemap || forestTilemap.layers.length === 0) {
    drawForest();
    return;
  }

  context.fillStyle = "#1f2c1c";
  context.fillRect(0, 0, world.width, world.height);

  for (const layer of forestTilemap.layers) {
    for (let y = 0; y < forestTilemap.height; y += 1) {
      const row = layer[y];
      if (!row) {
        continue;
      }

      for (let x = 0; x < forestTilemap.width; x += 1) {
        const tileValue = row[x] ?? 0;
        if (tileValue < forestTilemap.firstGid) {
          continue;
        }

        const tileIndex = tileValue - forestTilemap.firstGid;
        const sourceX = (tileIndex % forestTilemap.columns) * forestTilemap.tileWidth;
        const sourceY = Math.floor(tileIndex / forestTilemap.columns) * forestTilemap.tileHeight;
        const drawStartX = Math.round(x * forestTilemap.drawTileWidth);
        const drawEndX = Math.round((x + 1) * forestTilemap.drawTileWidth);
        const drawStartY = Math.round(y * forestTilemap.drawTileHeight);
        const drawEndY = Math.round((y + 1) * forestTilemap.drawTileHeight);
        context.drawImage(
          forestTilemap.image,
          sourceX,
          sourceY,
          forestTilemap.tileWidth,
          forestTilemap.tileHeight,
          drawStartX,
          drawStartY,
          Math.max(1, drawEndX - drawStartX),
          Math.max(1, drawEndY - drawStartY)
        );
      }
    }
  }
}

function drawHome() {
  context.fillStyle = "#5f472b";
  context.fillRect(0, 0, world.width, world.height);

  context.strokeStyle = "rgba(45, 31, 19, 0.34)";
  context.lineWidth = 2;
  for (let x = 24; x < world.width; x += 48) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, world.height);
    context.stroke();
  }

  context.fillStyle = "#2f2519";
  context.fillRect(0, 0, world.width, 28);
  context.fillRect(0, world.height - 28, world.width, 28);
  context.fillRect(0, 0, 28, world.height);
  context.fillRect(world.width - 28, 0, 28, world.height);

  context.fillStyle = "#80613a";
  context.fillRect(96, 96, 150, 86);
  context.fillStyle = "#f2ead8";
  context.font = "16px system-ui, sans-serif";
  context.textAlign = "right";
  context.fillText("Forest exit", world.width - 36, world.height / 2 - 12);
}

function drawPlayer(player: Player, isLocal: boolean, frameAtMs: number) {
  const image = characterImages.get(player.characterId) ?? characterImages.get(DEFAULT_CHARACTER_ID);
  const animationState = resolveAnimationState(player, isLocal);
  const layeredShadow = getLayeredSpriteImage(player.characterId, animationState, "shadow");
  const layeredBody = getLayeredSpriteImage(player.characterId, animationState, "body");
  const layeredHead = getLayeredSpriteImage(player.characterId, animationState, "head");
  const spriteImage =
    getSpriteImage(player.characterId, animationState) ??
    getSpriteImage(player.characterId, "run") ??
    getSpriteImage(player.characterId, "idle");

  if (layeredShadow?.complete && layeredBody?.complete && layeredHead?.complete) {
    const row = resolveDirectionRow(player);
    const column = resolveFrameColumn(player, animationState, frameAtMs, row);
    const layers: HTMLImageElement[] = [layeredShadow, layeredBody, layeredHead];

    for (const layerImage of layers) {
      context.drawImage(
        layerImage,
        column * SPRITE_FRAME_SIZE,
        row * SPRITE_FRAME_SIZE,
        SPRITE_FRAME_SIZE,
        SPRITE_FRAME_SIZE,
        player.x - SPRITE_SIZE / 2,
        player.y - SPRITE_SIZE / 2,
        SPRITE_SIZE,
        SPRITE_SIZE
      );
    }
  } else if (spriteImage?.complete && spriteImage.naturalWidth >= SPRITE_FRAME_SIZE && spriteImage.naturalHeight >= SPRITE_FRAME_SIZE) {
    const row = resolveDirectionRow(player);
    const column = resolveFrameColumn(player, animationState, frameAtMs, row);

    context.drawImage(
      spriteImage,
      column * SPRITE_FRAME_SIZE,
      row * SPRITE_FRAME_SIZE,
      SPRITE_FRAME_SIZE,
      SPRITE_FRAME_SIZE,
      player.x - SPRITE_SIZE / 2,
      player.y - SPRITE_SIZE / 2,
      SPRITE_SIZE,
      SPRITE_SIZE
    );
  } else if (image?.complete && image.naturalWidth > 0) {
    context.drawImage(image, player.x - SPRITE_SIZE / 2, player.y - SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
  } else {
    context.fillStyle = "#f5f1e8";
    context.beginPath();
    context.arc(player.x, player.y, world.playerRadius, 0, Math.PI * 2);
    context.fill();
  }

}

function draw(frameAtMs: number) {
  context.clearRect(0, 0, world.width, world.height);
  updateOverlayPanels();
  const camera = getCameraCenter();
  const viewportLeft = screenToWorldX(camera.x, 0);
  const viewportTop = screenToWorldY(camera.y, 0);
  const viewportRight = screenToWorldX(camera.x, canvas.width);
  const viewportBottom = screenToWorldY(camera.y, canvas.height);

  context.save();
  context.setTransform(
    CAMERA_ZOOM,
    0,
    0,
    CAMERA_ZOOM,
    canvas.width / 2 - camera.x * CAMERA_ZOOM,
    canvas.height / 2 - camera.y * CAMERA_ZOOM
  );

  if (localPlayer?.area === HOME_AREA) {
    drawHome();
  } else {
    drawForestTilemap();
  }

  for (const player of renderedPlayers.values()) {
    drawPlayer(player, player.id === localPlayer?.id, frameAtMs);
  }
  context.restore();

  context.fillStyle = "#f2ead8";
  context.font = "14px system-ui, sans-serif";
  context.textAlign = "center";
  for (const player of renderedPlayers.values()) {
    if (
      player.x < viewportLeft - SPRITE_SIZE ||
      player.x > viewportRight + SPRITE_SIZE ||
      player.y < viewportTop - SPRITE_SIZE ||
      player.y > viewportBottom + SPRITE_SIZE
    ) {
      continue;
    }

    context.fillText(
      player.id === localPlayer?.id ? "You" : player.name,
      worldToScreenX(camera.x, player.x),
      worldToScreenY(camera.y, player.y - SPRITE_SIZE / 2 - 8)
    );
  }
}

function tick(frameAt: number) {
  const deltaSeconds = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
  lastFrameAt = frameAt;

  updateLocalPlayer(deltaSeconds);
  updateRenderedPlayers(deltaSeconds);

  if (isFirebaseConfigured && hasJoinedLobby && localPlayer && frameAt - lastSyncAt > SYNC_INTERVAL_MS) {
    lastSyncAt = frameAt;
    void syncLocalPlayer().catch((error) => {
      setStatus(`Sync failed: ${error.message}`, "error");
    });
  }

  draw(frameAt);
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

function readLocalAccounts(): AccountsStore {
  const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
  if (!raw) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as AccountsStore;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeLocalAccounts(accounts: AccountsStore) {
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function hashPassword(password: string) {
  const bytes = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getStoredAccount(normalizedUsername: string) {
  if (!isFirebaseConfigured) {
    return readLocalAccounts()[normalizedUsername] ?? null;
  }

  await signInPlayer();
  const snapshot = await get(accountRefByUsername(normalizedUsername));
  return (snapshot.val() as StoredAccount | null) ?? null;
}

async function createStoredAccount(username: string, normalizedUsername: string, passwordHash: string) {
  if (!isFirebaseConfigured) {
    const accounts = readLocalAccounts();
    if (accounts[normalizedUsername]) {
      throw new Error("Username already exists. Sign in instead.");
    }

    accounts[normalizedUsername] = {
      username,
      normalizedUsername,
      passwordHash,
      characterId: DEFAULT_CHARACTER_ID,
      createdAt: Date.now()
    };
    writeLocalAccounts(accounts);
    return;
  }

  const uid = await signInPlayer();
  const existing = await get(accountRefByUsername(normalizedUsername));
  if (existing.exists()) {
    throw new Error("Username already exists. Sign in instead.");
  }

  await set(accountRefByUsername(normalizedUsername), {
    username,
    normalizedUsername,
    passwordHash,
    characterId: DEFAULT_CHARACTER_ID,
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
    uid
  } satisfies StoredAccount);
}

function setAuthPending(pending: boolean) {
  signInUsername.disabled = pending;
  signInPassword.disabled = pending;
  createUsername.disabled = pending;
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

  const playerId = await signInPlayer();
  await loadKickedPlayers();

  if (kickedPlayerIds.has(playerId)) {
    throw new Error("This browser was kicked from the lobby. Clear the kicked marker in devtools to rejoin.");
  }

  localPlayer = makePlayer(playerId, playerName);
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

  void signInPlayer()
    .then(async () => {
      await loadKickedPlayers(true);
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

  if (!normalizedUsername || !password) {
    menuError.textContent = "Enter your username and password.";
    signInUsername.focus();
    return;
  }

  menuError.textContent = "";
  setAuthPending(true);

  void hashPassword(password)
    .then(async (passwordHash) => {
      const account = await getStoredAccount(normalizedUsername);
      if (!account || account.passwordHash !== passwordHash) {
        throw new Error("Invalid username or password.");
      }

      selectedCharacterId = account.characterId ?? DEFAULT_CHARACTER_ID;
      if (isFirebaseConfigured) {
        await set(accountLastLoginRef(normalizedUsername), serverTimestamp());
      }
      signInPassword.value = "";
      return joinLobby(account.username);
    })
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
  const password = createPassword.value;

  if (!normalizedUsername || !password) {
    menuError.textContent = "Choose a username and password.";
    createUsername.focus();
    return;
  }

  if (normalizedUsername.length < 3) {
    menuError.textContent = "Username must be at least 3 characters.";
    createUsername.focus();
    return;
  }

  if (password.length < 4) {
    menuError.textContent = "Password must be at least 4 characters.";
    createPassword.focus();
    return;
  }

  menuError.textContent = "";
  setAuthPending(true);

  void hashPassword(password)
    .then(async (passwordHash) => {
      await createStoredAccount(username, normalizedUsername, passwordHash);
      createPassword.value = "";
      signInUsername.value = username;
      signInPassword.value = "";
      setAuthMode("signin");
      menuError.textContent = "Account created. Sign in to play.";
    })
    .catch((error) => {
      menuError.textContent = `Could not create account: ${error.message}`;
    })
    .finally(() => {
      setAuthPending(false);
    });
});

setAuthMode("signin");
void loadForestTilemap();

if (!isFirebaseConfigured) {
  setStatus("Firebase not configured. Add .env.local to enable online lobby.", "offline");
}
