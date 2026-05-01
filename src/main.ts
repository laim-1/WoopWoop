import { get, onDisconnect, onValue, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Unsubscribe } from "firebase/database";
import { auth, createFirebaseAccount, database, isFirebaseConfigured, signInFirebaseAccount } from "./firebase";
import { WORLD_GRID_SIZE, createGameMapRenderer, loadGameMap } from "./map";
import "./styles.css";

type Area = "forest";
type CharacterId = "boybrown" | "girlblonde" | "girlbrown";

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

type ResourceNodeType = "tree" | "rock" | "berries";
type ResourceBiome = "grass" | "mountain" | "desert" | "ocean";

type ResourceNode = {
  id: string;
  type: ResourceNodeType;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  biome: ResourceBiome;
};

type ResourceInventory = {
  wood: number;
  stone: number;
  berries: number;
};

type BuildBlockType = "woodWall" | "stoneWall" | "woodFloor" | "stoneFloor" | "window";

type PlacedBlock = {
  id: string;
  gx: number;
  gy: number;
  type: BuildBlockType;
  placedBy: string;
  placedAt?: number | object;
};

type BlockRecord = {
  type?: BuildBlockType;
  placedBy?: string;
  placedAt?: number | object;
};

type CatState = "idle" | "wander" | "follow" | "zoomies";

type CatEntity = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: CatState;
  ownerUid: string | null;
  ownerName: string;
  createdBy: string;
  behavior: "follow" | "stay";
  hue: number;
  nextStateAt: number;
  zoomiesUntil: number;
  petUntil: number;
  lastFedAt: number;
  updatedAt?: number | object;
  createdAt?: number | object;
};

type CatRecord = {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  state?: CatState;
  ownerUid?: string;
  ownerName?: string;
  createdBy?: string;
  behavior?: "follow" | "stay";
  hue?: number;
  nextStateAt?: number;
  zoomiesUntil?: number;
  petUntil?: number;
  lastFedAt?: number;
  updatedAt?: number | object;
  createdAt?: number | object;
};

type PeeParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
};

type ResourceHitParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
};

type PlayerColorPalette = {
  body: string;
  hands: string;
  feet: string;
};

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const assetBase = import.meta.env.BASE_URL;
const gameMap = await loadGameMap(assetBase);
const mapRenderer = createGameMapRenderer(gameMap);
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
      <p>Sign in with email + password to play.</p>
      <div class="auth-switch" id="auth-switch">
        <button type="button" class="is-active" id="auth-signin-tab">Sign In</button>
        <button type="button" id="auth-create-tab">Create Account</button>
      </div>
      <form class="join-form" id="signin-form">
        <label for="signin-username">Email</label>
        <input
          id="signin-username"
          maxlength="120"
          minlength="5"
          name="signInUsername"
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

    <aside class="hud-resources is-hidden" id="hud-resources">Wood: 0 | Stone: 0 | Berries: 0</aside>

    <aside class="lobby-panel is-hidden" id="lobby-panel">
      <h2>Players <span id="player-count">0</span></h2>
      <ul id="players-list"></ul>
    </aside>

    <aside class="resource-panel is-hidden" id="resource-panel">
      <h2>Resources</h2>
      <p id="resource-counts">Wood: 0 | Stone: 0 | Berries: 0</p>
    </aside>

    <section class="paint-controls is-hidden" id="paint-controls">
      <div class="paint-controls-actions">
        <button type="button" class="paint-controls-toggle" id="paint-controls-toggle" aria-expanded="false">🖌</button>
        <button type="button" class="hitboxes-toggle" id="hitboxes-toggle" aria-pressed="false">Hitboxes</button>
      </div>
      <form class="paint-controls-panel is-hidden" id="paint-controls-panel">
        <label>Body <input id="paint-body" type="color" value="#ffffff" /></label>
        <label>Hands <input id="paint-hands" type="color" value="#ffffff" /></label>
        <label>Feet <input id="paint-feet" type="color" value="#ffffff" /></label>
      </form>
      <section class="cat-debug is-hidden" id="cat-debug">
        <p id="cat-debug-counts">Tamed: 0 | Untamed: 0</p>
        <div class="cat-debug-actions">
          <label for="cat-debug-delete-count">Delete untamed</label>
          <input id="cat-debug-delete-count" type="number" min="1" step="1" value="1" />
          <button type="button" id="cat-debug-delete-button">Delete</button>
        </div>
      </section>
    </section>

    <section class="chat-drawer is-hidden" id="chat-drawer">
      <button type="button" class="chat-drawer-toggle" id="chat-drawer-toggle" aria-expanded="false">
        ▲ Chat
      </button>
      <div class="chat-panel is-hidden" id="chat-panel">
        <ul id="chat-messages"></ul>
        <form id="chat-form">
          <input id="chat-input" maxlength="120" placeholder="Chat..." autocomplete="off" />
        </form>
      </div>
    </section>

    <section class="build-hotbar is-hidden" id="build-hotbar" aria-label="Build tools">
      <h2>Build Inventory</h2>
      <button type="button" data-build-slot="0">1 Wood Wall</button>
      <button type="button" data-build-slot="1">2 Stone Wall</button>
      <button type="button" data-build-slot="2">3 Wood Floor</button>
      <button type="button" data-build-slot="3">4 Stone Floor</button>
      <button type="button" data-build-slot="4">5 Window</button>
      <span class="build-hotbar-hint">E toggle, LMB place, RMB remove</span>
    </section>

    <section class="cat-menu is-hidden" id="cat-menu" aria-label="Cat actions">
      <h2>Cat Menu</h2>
      <button type="button" data-cat-action="follow">Follow</button>
      <button type="button" data-cat-action="stay">Stay</button>
      <button type="button" data-cat-action="letgo">Let Go</button>
      <button type="button" data-cat-action="pet">Pet</button>
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
const hudResourcesElement = document.querySelector<HTMLElement>("#hud-resources");
const lobbyPanelElement = document.querySelector<HTMLElement>("#lobby-panel");
const playerCountElement = document.querySelector<HTMLSpanElement>("#player-count");
const playersListElement = document.querySelector<HTMLUListElement>("#players-list");
const resourcePanelElement = document.querySelector<HTMLElement>("#resource-panel");
const resourceCountsElement = document.querySelector<HTMLParagraphElement>("#resource-counts");
const paintControlsElement = document.querySelector<HTMLElement>("#paint-controls");
const paintControlsToggleElement = document.querySelector<HTMLButtonElement>("#paint-controls-toggle");
const hitboxesToggleElement = document.querySelector<HTMLButtonElement>("#hitboxes-toggle");
const paintControlsPanelElement = document.querySelector<HTMLFormElement>("#paint-controls-panel");
const paintBodyElement = document.querySelector<HTMLInputElement>("#paint-body");
const paintHandsElement = document.querySelector<HTMLInputElement>("#paint-hands");
const paintFeetElement = document.querySelector<HTMLInputElement>("#paint-feet");
const catDebugElement = document.querySelector<HTMLElement>("#cat-debug");
const catDebugCountsElement = document.querySelector<HTMLParagraphElement>("#cat-debug-counts");
const catDebugDeleteCountElement = document.querySelector<HTMLInputElement>("#cat-debug-delete-count");
const catDebugDeleteButtonElement = document.querySelector<HTMLButtonElement>("#cat-debug-delete-button");
const chatPanelElement = document.querySelector<HTMLElement>("#chat-panel");
const chatMessagesElement = document.querySelector<HTMLUListElement>("#chat-messages");
const chatFormElement = document.querySelector<HTMLFormElement>("#chat-form");
const chatInputElement = document.querySelector<HTMLInputElement>("#chat-input");
const chatDrawerElement = document.querySelector<HTMLElement>("#chat-drawer");
const chatDrawerToggleElement = document.querySelector<HTMLButtonElement>("#chat-drawer-toggle");
const buildHotbarElement = document.querySelector<HTMLElement>("#build-hotbar");
const catMenuElement = document.querySelector<HTMLElement>("#cat-menu");

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
  !hudResourcesElement ||
  !lobbyPanelElement ||
  !playerCountElement ||
  !playersListElement ||
  !resourcePanelElement ||
  !resourceCountsElement ||
  !paintControlsElement ||
  !paintControlsToggleElement ||
  !hitboxesToggleElement ||
  !paintControlsPanelElement ||
  !paintBodyElement ||
  !paintHandsElement ||
  !paintFeetElement ||
  !catDebugElement ||
  !catDebugCountsElement ||
  !catDebugDeleteCountElement ||
  !catDebugDeleteButtonElement ||
  !chatPanelElement ||
  !chatMessagesElement ||
  !chatFormElement ||
  !chatInputElement ||
  !chatDrawerElement ||
  !chatDrawerToggleElement ||
  !buildHotbarElement ||
  !catMenuElement
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
const hudResources = hudResourcesElement;
const lobbyPanel = lobbyPanelElement;
const playerCount = playerCountElement;
const playersList = playersListElement;
const resourcePanel = resourcePanelElement;
const resourceCounts = resourceCountsElement;
const paintControls = paintControlsElement;
const paintControlsToggle = paintControlsToggleElement;
const hitboxesToggle = hitboxesToggleElement;
const paintControlsPanel = paintControlsPanelElement;
const paintBodyInput = paintBodyElement;
const paintHandsInput = paintHandsElement;
const paintFeetInput = paintFeetElement;
const catDebug = catDebugElement;
const catDebugCounts = catDebugCountsElement;
const catDebugDeleteCount = catDebugDeleteCountElement;
const catDebugDeleteButton = catDebugDeleteButtonElement;
const chatPanel = chatPanelElement;
const chatMessages = chatMessagesElement;
const chatForm = chatFormElement;
const chatInput = chatInputElement;
const chatDrawer = chatDrawerElement;
const chatDrawerToggle = chatDrawerToggleElement;
const buildHotbar = buildHotbarElement;
const catMenu = catMenuElement;
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
  playerRadius: 42
};

const DEVTOOLS_PASSWORD = "0310";
const DEFAULT_FACING = { x: 0, y: 1 };
const FOREST_AREA: Area = "forest";
const REMOTE_INTERPOLATION_SPEED = 12;
const SYNC_INTERVAL_MS = 90;
const CHAT_LIMIT = 20;
const CHAT_MAX_LENGTH = 120;
const DEFAULT_CHARACTER_ID: CharacterId = "boybrown";
const TILE_SIZE = 96;
const BUILD_GRID_SIZE = WORLD_GRID_SIZE;
const BUILD_ACTION_COOLDOWN_MS = 80;
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
const ATTACK_RANGE = 112;
const ATTACK_CONE_DOT = 0.72;
const ATTACK_COOLDOWN_MS = 220;
const PUNCH_DURATION_MS = 210;
const PUNCH_REACH = 52;
const PUNCH_EXTEND_PHASE = 0.34;
const PEE_PARTICLES_PER_SECOND = 48;
const RESOURCE_HIT_PARTICLES = 11;
const BUILD_BLOCK_TYPES: BuildBlockType[] = ["woodWall", "stoneWall", "woodFloor", "stoneFloor", "window"];
const SOLID_BUILD_BLOCKS = new Set<BuildBlockType>(["woodWall", "stoneWall", "window"]);
const CAT_FEED_RANGE = 170;
const CAT_FOLLOW_RADIUS = 220;
const CAT_COMFORT_RADIUS = 90;
const CAT_BASE_SPEED = 220;
const CAT_FOLLOW_SPEED = 320;
const CAT_ZOOMIES_SPEED = 420;
const CAT_ACCELERATION = 14;
const CAT_DAMPING = 2.2;
const CAT_ZOOMIES_CHECK_INTERVAL_MS = 10000;
const CAT_ZOOMIES_CHANCE = 0.02;
const CAT_ZOOMIES_MIN_MS = 4000;
const CAT_ZOOMIES_MAX_MS = 7000;
const MAX_CATS_PER_PLAYER = 8;
const CAT_CLICK_RADIUS = 30;

const keys = new Set<string>();
const players = new Map<string, Player>();
const renderedPlayers = new Map<string, Player>();
const renderStates = new Map<string, RenderState>();
const kickedPlayerIds = new Set<string>();
const chatMessagesById = new Map<string, ChatMessage & { id: string }>();
const selectedCharacterId: CharacterId = DEFAULT_CHARACTER_ID;
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
let chatDrawerOpen = false;
let buildModeEnabled = false;
let buildInventoryOpen = false;
let selectedBuildSlot = 0;
let hoveredBuildCell: { gx: number; gy: number } | null = null;
let lastBuildActionAt = 0;
let lastAttackAt = 0;
let lastPunchAt = -PUNCH_DURATION_MS;
let activePunchSide: -1 | 1 = 1;
let nextPunchSide: -1 | 1 = 1;
let lastPunchAimX = DEFAULT_FACING.x;
let lastPunchAimY = DEFAULT_FACING.y;
const resourceNodes: ResourceNode[] = [];
const inventory: ResourceInventory = {
  wood: 0,
  stone: 0,
  berries: 0
};
const peeParticles: PeeParticle[] = [];
const resourceHitParticles: ResourceHitParticle[] = [];
const blocksByCell = new Map<string, PlacedBlock>();
const catsById = new Map<string, CatEntity>();
const localOwnedCatIds = new Set<string>();
let peeEmissionCarry = 0;
let paintPanelOpen = false;
let showHitboxes = false;
let blocksUnsubscribe: Unsubscribe | null = null;
let catsUnsubscribe: Unsubscribe | null = null;
let ownedCatsUnsubscribe: Unsubscribe | null = null;
let catSpawnComboLatched = false;
let lastCatAiSyncAt = 0;
let selectedCatMenuId: string | null = null;
const localPlayerColors: PlayerColorPalette = {
  body: "#ffffff",
  hands: "#ffffff",
  feet: "#ffffff"
};

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

function worldToGrid(worldCoordinate: number) {
  return Math.floor(worldCoordinate / BUILD_GRID_SIZE);
}

function gridToWorldCenter(gridCoordinate: number) {
  return gridCoordinate * BUILD_GRID_SIZE + BUILD_GRID_SIZE / 2;
}

function cellIdFromGrid(gx: number, gy: number) {
  return `${gx}:${gy}`;
}

function parseCellId(cellId: string) {
  const [gxText, gyText] = cellId.split(":");
  const gx = Number(gxText);
  const gy = Number(gyText);
  if (!Number.isFinite(gx) || !Number.isFinite(gy)) {
    return null;
  }
  return { gx, gy };
}

function isInsideBuildGrid(gx: number, gy: number) {
  return gx >= 0 && gy >= 0 && gx * BUILD_GRID_SIZE < world.width && gy * BUILD_GRID_SIZE < world.height;
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
  } else if (event.code === "KeyE" && hasJoinedLobby) {
    setBuildInventoryOpen(!buildInventoryOpen);
    event.preventDefault();
  } else if (["Digit1", "Digit2", "Digit3", "Digit4", "Digit5"].includes(event.code)) {
    selectedBuildSlot = clamp(Number(event.code.replace("Digit", "")) - 1, 0, BUILD_BLOCK_TYPES.length - 1);
    updateBuildHotbarSelection();
    event.preventDefault();
  } else if (event.code === "Space") {
    if (buildModeEnabled) {
      event.preventDefault();
      return;
    }
    triggerPunch();
    event.preventDefault();
  } else if (event.code === "KeyF" && hasJoinedLobby) {
    void feedNearestCat();
    event.preventDefault();
  } else if (event.code === "Digit9" || event.code === "KeyC") {
    keys.add(event.code);
    if (keys.has("Digit9") && keys.has("KeyC") && !catSpawnComboLatched) {
      catSpawnComboLatched = true;
      void spawnCatForLocalPlayer().catch((error) => {
        const message = error instanceof Error ? error.message : "Unknown error";
        setStatus(`Cat spawn failed: ${message}`, "error");
      });
    }
    event.preventDefault();
  } else if (
    ["KeyW", "KeyA", "KeyS", "KeyD", "KeyP", "ShiftLeft", "ShiftRight"].includes(event.code)
  ) {
    keys.add(event.code);

    if (event.code.startsWith("Key")) {
      event.preventDefault();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
  if (!keys.has("Digit9") || !keys.has("KeyC")) {
    catSpawnComboLatched = false;
  }
});

function drawResourceNode(node: ResourceNode) {
  if (node.type === "tree") {
    const points = 8;
    const innerRatio = 0.56;
    const rotation = -Math.PI / 2;
    context.save();
    context.translate(node.x, node.y);

    // Shadow for depth.
    context.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const angle = rotation + (i / (points * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? node.radius : node.radius * innerRatio;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius + 5;
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = "rgba(0, 0, 0, 0.2)";
    context.fill();

    // Main pine star canopy.
    context.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const angle = rotation + (i / (points * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? node.radius : node.radius * innerRatio;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = node.biome === "mountain" ? "#f3f8fb" : "#4f824e";
    context.fill();

    // Inner highlight.
    context.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const angle = rotation + (i / (points * 2)) * Math.PI * 2;
      const radius = i % 2 === 0 ? node.radius * 0.58 : node.radius * 0.34;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius;
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = node.biome === "mountain" ? "#ffffff" : "#79a86a";
    context.fill();

    context.strokeStyle = node.biome === "mountain" ? "#a9bac6" : "#355737";
    context.lineWidth = 3;
    context.stroke();
    context.restore();
  } else if (node.type === "rock") {
    const sides = 6;
    const rotation = Math.PI / 6;
    context.save();
    context.translate(node.x, node.y);

    // Chunky drop shadow to match icon style.
    context.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (i / sides) * Math.PI * 2;
      const px = Math.cos(angle) * node.radius;
      const py = Math.sin(angle) * node.radius + 4;
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = "rgba(0, 0, 0, 0.22)";
    context.fill();

    // Main face.
    context.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (i / sides) * Math.PI * 2;
      const px = Math.cos(angle) * node.radius;
      const py = Math.sin(angle) * node.radius;
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = "#9ca3ad";
    context.fill();

    // Inner lighter face.
    context.beginPath();
    for (let i = 0; i < sides; i += 1) {
      const angle = rotation + (i / sides) * Math.PI * 2;
      const px = Math.cos(angle) * (node.radius * 0.72);
      const py = Math.sin(angle) * (node.radius * 0.72);
      if (i === 0) {
        context.moveTo(px, py);
      } else {
        context.lineTo(px, py);
      }
    }
    context.closePath();
    context.fillStyle = "#c9ced5";
    context.fill();

    context.strokeStyle = "#5f646c";
    context.lineWidth = 3;
    context.stroke();
    context.restore();
  } else {
    context.save();
    context.translate(node.x, node.y);

    // Leaf cluster base.
    context.fillStyle = "#6f9251";
    context.beginPath();
    context.arc(-node.radius * 0.34, 0, node.radius * 0.46, 0, Math.PI * 2);
    context.arc(node.radius * 0.34, 0, node.radius * 0.46, 0, Math.PI * 2);
    context.arc(0, -node.radius * 0.34, node.radius * 0.46, 0, Math.PI * 2);
    context.arc(0, node.radius * 0.34, node.radius * 0.46, 0, Math.PI * 2);
    context.fill();

    // Lighter leaf center.
    context.fillStyle = "#8eb064";
    context.beginPath();
    context.arc(0, 0, node.radius * 0.42, 0, Math.PI * 2);
    context.fill();

    // Berry dots.
    context.fillStyle = "#c64a48";
    context.beginPath();
    context.arc(-node.radius * 0.22, -node.radius * 0.16, node.radius * 0.16, 0, Math.PI * 2);
    context.arc(node.radius * 0.2, -node.radius * 0.04, node.radius * 0.16, 0, Math.PI * 2);
    context.arc(-node.radius * 0.02, node.radius * 0.2, node.radius * 0.16, 0, Math.PI * 2);
    context.fill();

    // Outline pass for icon look.
    context.strokeStyle = "#4d5f3f";
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(-node.radius * 0.34, 0, node.radius * 0.46, 0, Math.PI * 2);
    context.arc(node.radius * 0.34, 0, node.radius * 0.46, 0, Math.PI * 2);
    context.arc(0, -node.radius * 0.34, node.radius * 0.46, 0, Math.PI * 2);
    context.arc(0, node.radius * 0.34, node.radius * 0.46, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }
}

function findAttackTarget(): ResourceNode | null {
  if (!localPlayer || !hasJoinedLobby) {
    return null;
  }

  let target: ResourceNode | null = null;
  let targetDistance = Number.POSITIVE_INFINITY;
  const facingLength = Math.max(1, Math.hypot(localPlayer.facingX, localPlayer.facingY));
  const fx = localPlayer.facingX / facingLength;
  const fy = localPlayer.facingY / facingLength;

  for (const node of resourceNodes) {
    if (node.hp <= 0) {
      continue;
    }
    const dx = node.x - localPlayer.x;
    const dy = node.y - localPlayer.y;
    const distance = Math.hypot(dx, dy);
    const maxDistance = ATTACK_RANGE + node.radius;
    if (distance > maxDistance) {
      continue;
    }
    const dot = (dx * fx + dy * fy) / Math.max(distance, 1);
    if (dot < ATTACK_CONE_DOT) {
      continue;
    }
    if (distance < targetDistance) {
      target = node;
      targetDistance = distance;
    }
  }

  return target;
}

function performResourceAttack(target: ResourceNode): boolean {
  const now = performance.now();
  if (now - lastAttackAt < ATTACK_COOLDOWN_MS) {
    return false;
  }

  lastAttackAt = now;
  target.hp -= 1;
  emitResourceHitParticles(target);
  if (target.hp > 0) {
    return true;
  }

  if (target.type === "tree") {
    inventory.wood += 1;
  } else if (target.type === "rock") {
    inventory.stone += 1;
  } else {
    inventory.berries += 1;
  }
  updateResourcePanel();
  return true;
}

function emitResourceHitParticles(node: ResourceNode) {
  const colorByType: Record<ResourceNodeType, string> = {
    tree: "#c38a56",
    rock: "#c6d0d8",
    berries: "#d94e66"
  };

  for (let i = 0; i < RESOURCE_HIT_PARTICLES; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 55 + Math.random() * 115;
    resourceHitParticles.push({
      x: node.x + (Math.random() - 0.5) * node.radius * 0.35,
      y: node.y + (Math.random() - 0.5) * node.radius * 0.35,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 24,
      life: 0.24 + Math.random() * 0.22,
      maxLife: 0.24 + Math.random() * 0.22,
      color: colorByType[node.type],
      size: 2.5 + Math.random() * 2.6
    });
  }
}

function triggerPunch() {
  if (!localPlayer || !hasJoinedLobby) {
    return;
  }

  const target = findAttackTarget();
  if (target) {
    const aimDx = target.x - localPlayer.x;
    const aimDy = target.y - localPlayer.y;
    const aimLength = Math.max(1, Math.hypot(aimDx, aimDy));
    lastPunchAimX = aimDx / aimLength;
    lastPunchAimY = aimDy / aimLength;
    void performResourceAttack(target);
  } else {
    const facingLength = Math.max(1, Math.hypot(localPlayer.facingX, localPlayer.facingY));
    lastPunchAimX = localPlayer.facingX / facingLength;
    lastPunchAimY = localPlayer.facingY / facingLength;
  }

  activePunchSide = nextPunchSide;
  nextPunchSide = nextPunchSide === 1 ? -1 : 1;
  lastPunchAt = performance.now();
}

function drawHitboxesOverlay() {
  if (!showHitboxes) {
    return;
  }

  context.save();
  context.lineWidth = 2;

  for (const node of resourceNodes) {
    if (node.hp <= 0) {
      continue;
    }

    // Harvestable/targetable node bounds.
    context.strokeStyle = "rgba(255, 225, 60, 0.9)";
    context.beginPath();
    context.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    context.stroke();

    // Collision bounds.
    let collisionRadius = 0;
    if (node.type === "tree") {
      collisionRadius = node.radius * 0.24;
    } else if (node.type === "rock") {
      collisionRadius = node.radius * 0.88;
    }
    if (collisionRadius > 0) {
      context.strokeStyle = "rgba(255, 90, 90, 0.95)";
      context.beginPath();
      context.arc(node.x, node.y, collisionRadius, 0, Math.PI * 2);
      context.stroke();
    }
  }

  if (localPlayer) {
    // Player body collision.
    context.strokeStyle = "rgba(80, 190, 255, 0.95)";
    context.beginPath();
    context.arc(localPlayer.x, localPlayer.y, world.playerRadius, 0, Math.PI * 2);
    context.stroke();
  }

  context.restore();
}
function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeArea(_area: PlayerSnapshot["area"]): Area {
  return FOREST_AREA;
}

function normalizeCharacterId(characterId: PlayerSnapshot["characterId"]): CharacterId {
  return characterId === "boybrown" || characterId === "girlblonde" || characterId === "girlbrown"
    ? (characterId as CharacterId)
    : DEFAULT_CHARACTER_ID;
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

function blocksRef() {
  return ref(database, "rooms/lobby/blocks");
}

function blockRef(cellId: string) {
  return ref(database, `rooms/lobby/blocks/${cellId}`);
}

function catsRef() {
  return ref(database, "rooms/lobby/cats");
}

function catRef(catId: string) {
  return ref(database, `rooms/lobby/cats/${catId}`);
}

function userOwnedCatsRef(userId: string) {
  return ref(database, `users/${userId}/ownedCats`);
}

function kickedPlayerRef(playerId: string) {
  return ref(database, `rooms/lobby/kicked/${playerId}`);
}

function kickedPlayersRef() {
  return ref(database, "rooms/lobby/kicked");
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
  hudResources.classList.remove("is-hidden");
  lobbyPanel.classList.remove("is-hidden");
  resourcePanel.classList.remove("is-hidden");
  chatPanel.classList.remove("is-hidden");
  canvas.classList.remove("is-hidden");
}

function updateOverlayPanels() {
  chatDrawer.classList.toggle("is-hidden", !hasJoinedLobby || !isFirebaseConfigured);
  resourcePanel.classList.toggle("is-hidden", !hasJoinedLobby);
  paintControls.classList.toggle("is-hidden", !hasJoinedLobby);
  hudResources.classList.toggle("is-hidden", !hasJoinedLobby);
  buildHotbar.classList.toggle("is-hidden", !hasJoinedLobby || !buildInventoryOpen);
  catMenu.classList.toggle("is-hidden", !hasJoinedLobby || !selectedCatMenuId);
  catDebug.classList.toggle("is-hidden", !hasJoinedLobby || !showHitboxes);
}

function setChatDrawerOpen(open: boolean) {
  chatDrawerOpen = open;
  chatPanel.classList.toggle("is-hidden", !open);
  chatDrawerToggle.textContent = `${open ? "▼" : "▲"} Chat`;
  chatDrawerToggle.setAttribute("aria-expanded", String(open));
}

function setPaintPanelOpen(open: boolean) {
  paintPanelOpen = open;
  paintControlsPanel.classList.toggle("is-hidden", !open);
  paintControlsToggle.setAttribute("aria-expanded", String(open));
}

function selectedBuildType() {
  return BUILD_BLOCK_TYPES[selectedBuildSlot] ?? BUILD_BLOCK_TYPES[0];
}

function updateBuildHotbarSelection() {
  const buttons = buildHotbar.querySelectorAll<HTMLButtonElement>("[data-build-slot]");
  for (const button of buttons) {
    const slot = Number(button.dataset.buildSlot ?? -1);
    const selected = slot === selectedBuildSlot;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
}

function setBuildModeEnabled(enabled: boolean) {
  buildModeEnabled = enabled && hasJoinedLobby;
  buildHotbar.classList.toggle("is-build-mode", buildModeEnabled);
  if (!buildModeEnabled) {
    hoveredBuildCell = null;
  }
}

function setBuildInventoryOpen(open: boolean) {
  buildInventoryOpen = open && hasJoinedLobby;
  if (buildInventoryOpen) {
    setBuildModeEnabled(true);
  } else {
    setBuildModeEnabled(false);
  }
}

function setCatMenuOpen(catId: string | null) {
  selectedCatMenuId = catId;
  catMenu.classList.toggle("is-hidden", !catId || !hasJoinedLobby);
}

function getCatCounts() {
  let tamed = 0;
  let untamed = 0;
  for (const cat of catsById.values()) {
    if (cat.ownerUid) {
      tamed += 1;
    } else {
      untamed += 1;
    }
  }
  return { tamed, untamed };
}

function updateCatDebugPanel() {
  const { tamed, untamed } = getCatCounts();
  catDebugCounts.textContent = `Tamed: ${tamed} | Untamed: ${untamed}`;
  const current = Number(catDebugDeleteCount.value);
  if (!Number.isFinite(current) || current < 1) {
    catDebugDeleteCount.value = "1";
  }
  catDebugDeleteCount.max = String(Math.max(1, untamed));
  catDebugDeleteButton.disabled = untamed <= 0;
}

async function deleteUntamedCats(requestedCount: number) {
  if (!hasJoinedLobby) {
    return;
  }
  const untamedCats = [...catsById.values()].filter((cat) => !cat.ownerUid);
  if (untamedCats.length === 0) {
    setStatus("No untamed cats to delete.", "offline");
    updateCatDebugPanel();
    return;
  }
  const count = Math.max(1, Math.min(requestedCount, untamedCats.length));
  const toDelete = untamedCats.slice(0, count);
  if (!isFirebaseConfigured) {
    for (const cat of toDelete) {
      catsById.delete(cat.id);
    }
    updateCatDebugPanel();
    return;
  }
  await Promise.all(toDelete.map((cat) => remove(catRef(cat.id))));
  setStatus(`Deleted ${count} untamed cat${count === 1 ? "" : "s"}.`, "online");
  updateCatDebugPanel();
}

function getHoveredBuildCellFromPointer(event: PointerEvent) {
  const camera = getCameraCenter();
  const worldX = screenToWorldX(camera.x, event.clientX);
  const worldY = screenToWorldY(camera.y, event.clientY);
  const gx = worldToGrid(worldX);
  const gy = worldToGrid(worldY);
  if (!isInsideBuildGrid(gx, gy)) {
    return null;
  }
  return { gx, gy };
}

function isCellOccupiedByPlayer(gx: number, gy: number) {
  const minX = gx * BUILD_GRID_SIZE;
  const minY = gy * BUILD_GRID_SIZE;
  const maxX = minX + BUILD_GRID_SIZE;
  const maxY = minY + BUILD_GRID_SIZE;
  for (const player of players.values()) {
    if (player.x >= minX && player.x <= maxX && player.y >= minY && player.y <= maxY) {
      return true;
    }
  }
  return false;
}

function canPlaceBlockAt(gx: number, gy: number) {
  if (!isInsideBuildGrid(gx, gy)) {
    return false;
  }
  if (isCellOccupiedByPlayer(gx, gy)) {
    return false;
  }
  return true;
}

async function placeSelectedBlockAtCell(gx: number, gy: number) {
  if (!localPlayer || !canPlaceBlockAt(gx, gy)) {
    return;
  }
  const now = performance.now();
  if (now - lastBuildActionAt < BUILD_ACTION_COOLDOWN_MS) {
    return;
  }
  lastBuildActionAt = now;
  const cellId = cellIdFromGrid(gx, gy);
  const type = selectedBuildType();
  if (!isFirebaseConfigured) {
    blocksByCell.set(cellId, { id: cellId, gx, gy, type, placedBy: localPlayer.id, placedAt: Date.now() });
    cullResourcesInsideBlocks();
    return;
  }
  const previous = blocksByCell.get(cellId);
  blocksByCell.set(cellId, { id: cellId, gx, gy, type, placedBy: localPlayer.id, placedAt: Date.now() });
  try {
    await set(blockRef(cellId), {
      type,
      placedBy: localPlayer.id,
      placedAt: serverTimestamp()
    } satisfies BlockRecord);
    cullResourcesInsideBlocks();
  } catch (error) {
    if (previous) {
      blocksByCell.set(cellId, previous);
    } else {
      blocksByCell.delete(cellId);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus(`Build place failed: ${message}`, "error");
  }
}

async function removeBlockAtCell(gx: number, gy: number) {
  if (!localPlayer || !isInsideBuildGrid(gx, gy)) {
    return;
  }
  const now = performance.now();
  if (now - lastBuildActionAt < BUILD_ACTION_COOLDOWN_MS) {
    return;
  }
  lastBuildActionAt = now;
  const cellId = cellIdFromGrid(gx, gy);
  if (!isFirebaseConfigured) {
    blocksByCell.delete(cellId);
    return;
  }
  const previous = blocksByCell.get(cellId);
  blocksByCell.delete(cellId);
  try {
    await remove(blockRef(cellId));
  } catch (error) {
    if (previous) {
      blocksByCell.set(cellId, previous);
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus(`Build remove failed: ${message}`, "error");
  }
}

function randomRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function getOwnerPlayer(cat: CatEntity) {
  if (!cat.ownerUid) {
    return null;
  }
  return players.get(cat.ownerUid) ?? null;
}

function isCatAuthoritativeForLocal(ownerUid: string | null, createdBy: string) {
  if (!isFirebaseConfigured) {
    return true;
  }
  if (!localPlayer) {
    return false;
  }
  return ownerUid === localPlayer.id || (!ownerUid && createdBy === localPlayer.id);
}

function countLocalOwnedCats() {
  if (!localPlayer) {
    return 0;
  }
  let total = 0;
  for (const cat of catsById.values()) {
    if (cat.ownerUid === localPlayer.id) {
      total += 1;
    }
  }
  return total;
}

async function spawnCatForLocalPlayer() {
  if (!localPlayer || !hasJoinedLobby) {
    return;
  }
  if (countLocalOwnedCats() >= MAX_CATS_PER_PLAYER) {
    setStatus(`Cat cap reached (${MAX_CATS_PER_PLAYER}).`, "error");
    return;
  }
  const catId = `cat-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  const spawnDistance = randomRange(62, 128);
  const spawnAngle = Math.random() * Math.PI * 2;
  const spawnX = clamp(localPlayer.x + Math.cos(spawnAngle) * spawnDistance, 24, world.width - 24);
  const spawnY = clamp(localPlayer.y + Math.sin(spawnAngle) * spawnDistance, 24, world.height - 24);
  const now = Date.now();
  const cat: CatRecord = {
    x: Math.round(spawnX),
    y: Math.round(spawnY),
    vx: 0,
    vy: 0,
    state: "idle",
    ownerUid: "",
    ownerName: "",
    createdBy: localPlayer.id,
    behavior: "follow",
    hue: Math.floor(randomRange(10, 45)),
    nextStateAt: now + randomRange(900, 2200),
    zoomiesUntil: 0,
    petUntil: 0,
    lastFedAt: 0,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };
  await set(catRef(catId), cat);
}

function findNearestCatToPlayer(range: number) {
  if (!localPlayer) {
    return null;
  }
  let nearest: CatEntity | null = null;
  let nearestDistance = range;
  for (const cat of catsById.values()) {
    const distance = Math.hypot(cat.x - localPlayer.x, cat.y - localPlayer.y);
    if (distance <= nearestDistance) {
      nearest = cat;
      nearestDistance = distance;
    }
  }
  return nearest;
}

function findClickedCat(worldX: number, worldY: number) {
  let hit: CatEntity | null = null;
  let bestDistance = CAT_CLICK_RADIUS;
  for (const cat of catsById.values()) {
    const distance = Math.hypot(cat.x - worldX, cat.y - worldY);
    if (distance <= bestDistance) {
      hit = cat;
      bestDistance = distance;
    }
  }
  return hit;
}

function cullResourcesInsideBlocks() {
  for (let i = resourceNodes.length - 1; i >= 0; i -= 1) {
    const node = resourceNodes[i];
    const gx = worldToGrid(node.x);
    const gy = worldToGrid(node.y);
    if (blocksByCell.has(cellIdFromGrid(gx, gy))) {
      resourceNodes.splice(i, 1);
    }
  }
}

async function feedNearestCat() {
  if (!localPlayer || !hasJoinedLobby) {
    return;
  }
  if (inventory.berries <= 0) {
    setStatus("Need at least 1 berry to feed a cat.", "error");
    return;
  }
  const cat = findNearestCatToPlayer(CAT_FEED_RANGE);
  if (!cat) {
    setStatus("No cat close enough to feed.", "offline");
    return;
  }
  inventory.berries = Math.max(0, inventory.berries - 1);
  updateResourcePanel();
  const now = Date.now();
  const ownerName = localPlayer.name;
  try {
    await set(catRef(cat.id), {
      ...cat,
      ownerUid: localPlayer.id,
      ownerName,
      behavior: "follow",
      lastFedAt: now,
      state: "follow",
      updatedAt: serverTimestamp()
    } satisfies CatRecord);
    await set(ref(database, `users/${localPlayer.id}/ownedCats/${cat.id}`), true);
    setStatus("You fed a cat. It follows you now!", "online");
  } catch (error) {
    inventory.berries += 1;
    updateResourcePanel();
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus(`Feeding failed: ${message}`, "error");
  }
}

async function syncOwnedCatsIndex() {
  if (!localPlayer || !isFirebaseConfigured) {
    return;
  }
  const desired = new Set<string>();
  for (const cat of catsById.values()) {
    if (cat.ownerUid === localPlayer.id) {
      desired.add(cat.id);
    }
  }
  for (const id of localOwnedCatIds) {
    if (!desired.has(id)) {
      void remove(ref(database, `users/${localPlayer.id}/ownedCats/${id}`));
    }
  }
  for (const id of desired) {
    if (!localOwnedCatIds.has(id)) {
      void set(ref(database, `users/${localPlayer.id}/ownedCats/${id}`), true);
    }
  }
}

function updateCats(deltaSeconds: number, frameAt: number) {
  if (!localPlayer && isFirebaseConfigured) {
    return;
  }

  for (const cat of catsById.values()) {
    const authoritativeForCat = isCatAuthoritativeForLocal(cat.ownerUid, cat.createdBy);
    if (!authoritativeForCat) {
      continue;
    }

    const owner = getOwnerPlayer(cat);
    const ownerOnline = Boolean(owner);
    const now = Date.now();
    if (ownerOnline && cat.state !== "zoomies" && frameAt - lastCatAiSyncAt >= CAT_ZOOMIES_CHECK_INTERVAL_MS) {
      if (Math.random() < CAT_ZOOMIES_CHANCE) {
        cat.state = "zoomies";
        cat.zoomiesUntil = now + randomRange(CAT_ZOOMIES_MIN_MS, CAT_ZOOMIES_MAX_MS);
      }
    }

    let targetVelocityX = 0;
    let targetVelocityY = 0;

    if (cat.behavior === "stay") {
      cat.state = "idle";
      cat.zoomiesUntil = 0;
      cat.vx = 0;
      cat.vy = 0;
      continue;
    } else if (cat.state === "zoomies") {
      if (now >= cat.zoomiesUntil) {
        cat.state = ownerOnline ? "follow" : "idle";
        cat.zoomiesUntil = 0;
      } else {
        if (cat.nextStateAt <= now) {
          cat.nextStateAt = now + randomRange(140, 360);
          const angle = Math.random() * Math.PI * 2;
          targetVelocityX = Math.cos(angle) * CAT_ZOOMIES_SPEED;
          targetVelocityY = Math.sin(angle) * CAT_ZOOMIES_SPEED;
        } else {
          const speed = Math.hypot(cat.vx, cat.vy);
          if (speed > 2) {
            targetVelocityX = (cat.vx / speed) * CAT_ZOOMIES_SPEED;
            targetVelocityY = (cat.vy / speed) * CAT_ZOOMIES_SPEED;
          }
        }
      }
    } else if (owner) {
      const dx = owner.x - cat.x;
      const dy = owner.y - cat.y;
      const distance = Math.hypot(dx, dy);
      if (distance > CAT_FOLLOW_RADIUS) {
        const nx = dx / Math.max(distance, 1);
        const ny = dy / Math.max(distance, 1);
        targetVelocityX = nx * CAT_FOLLOW_SPEED;
        targetVelocityY = ny * CAT_FOLLOW_SPEED;
        cat.state = "follow";
      } else if (distance < CAT_COMFORT_RADIUS) {
        if (cat.nextStateAt <= now) {
          cat.nextStateAt = now + randomRange(350, 850);
          const angle = Math.random() * Math.PI * 2;
          targetVelocityX = Math.cos(angle) * CAT_BASE_SPEED * 0.9;
          targetVelocityY = Math.sin(angle) * CAT_BASE_SPEED * 0.9;
          cat.state = "wander";
        } else if (cat.state === "wander") {
          const speed = Math.hypot(cat.vx, cat.vy);
          if (speed > 2) {
            targetVelocityX = (cat.vx / speed) * CAT_BASE_SPEED * 0.85;
            targetVelocityY = (cat.vy / speed) * CAT_BASE_SPEED * 0.85;
          }
        }
      } else {
        const nx = dx / Math.max(distance, 1);
        const ny = dy / Math.max(distance, 1);
        targetVelocityX = nx * CAT_FOLLOW_SPEED;
        targetVelocityY = ny * CAT_FOLLOW_SPEED;
        cat.state = "wander";
      }
    } else {
      if (cat.nextStateAt <= now) {
        cat.nextStateAt = now + randomRange(300, 900);
        const angle = Math.random() * Math.PI * 2;
        targetVelocityX = Math.cos(angle) * CAT_BASE_SPEED;
        targetVelocityY = Math.sin(angle) * CAT_BASE_SPEED;
        cat.state = "wander";
      } else if (cat.state === "wander") {
        const speed = Math.hypot(cat.vx, cat.vy);
        if (speed > 2) {
          targetVelocityX = (cat.vx / speed) * CAT_BASE_SPEED * 0.95;
          targetVelocityY = (cat.vy / speed) * CAT_BASE_SPEED * 0.95;
        }
      } else {
        cat.state = "idle";
      }
    }

    const accelBlend = 1 - Math.exp(-CAT_ACCELERATION * deltaSeconds);
    cat.vx += (targetVelocityX - cat.vx) * accelBlend;
    cat.vy += (targetVelocityY - cat.vy) * accelBlend;
    const damping = Math.exp(-CAT_DAMPING * deltaSeconds);
    cat.vx *= damping;
    cat.vy *= damping;
    const speed = Math.hypot(cat.vx, cat.vy);
    const maxSpeed = cat.state === "zoomies" ? CAT_ZOOMIES_SPEED : CAT_FOLLOW_SPEED;
    if (speed > maxSpeed) {
      cat.vx = (cat.vx / speed) * maxSpeed;
      cat.vy = (cat.vy / speed) * maxSpeed;
    }
    cat.x = clamp(cat.x + cat.vx * deltaSeconds, 20, world.width - 20);
    cat.y = clamp(cat.y + cat.vy * deltaSeconds, 20, world.height - 20);
  }
  lastCatAiSyncAt = frameAt;
}

function updateResourcePanel() {
  const value = `Wood: ${inventory.wood} | Stone: ${inventory.stone} | Berries: ${inventory.berries}`;
  resourceCounts.textContent = value;
  hudResources.textContent = value;
}

function getBiomeAtPosition(x: number, y: number): ResourceBiome {
  for (const region of gameMap.biomeRegions) {
    if (x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height) {
      return region.biome;
    }
  }
  return "grass";
}

function createSeededRng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function spawnResourceNode(
  rng: () => number,
  type: ResourceNodeType,
  biome: ResourceBiome,
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  index: number,
) {
  const radiusByType: Record<ResourceNodeType, number> = {
    tree: 108,
    rock: 92,
    berries: 30
  };
  const hpByType: Record<ResourceNodeType, number> = {
    tree: 10,
    rock: 12,
    berries: 8
  };
  const radius = radiusByType[type];
  const tries = 10;
  let placedX = 0;
  let placedY = 0;
  let placed = false;

  for (let attempt = 0; attempt < tries; attempt += 1) {
    const x = clamp(xMin + rng() * Math.max(1, xMax - xMin), radius + 4, world.width - radius - 4);
    const y = clamp(yMin + rng() * Math.max(1, yMax - yMin), radius + 4, world.height - radius - 4);
    const gx = worldToGrid(x);
    const gy = worldToGrid(y);
    if (blocksByCell.has(cellIdFromGrid(gx, gy))) {
      continue;
    }
    const heavyOverlap = resourceNodes.some((other) => {
      if (other.hp <= 0) {
        return false;
      }
      const dx = x - other.x;
      const dy = y - other.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = (radius + other.radius) * 0.72;
      return distance < minDistance;
    });
    if (!heavyOverlap) {
      placedX = x;
      placedY = y;
      placed = true;
      break;
    }
  }

  if (!placed) {
    return;
  }

  resourceNodes.push({
    id: `${type}-${biome}-${index}`,
    type,
    x: placedX,
    y: placedY,
    radius,
    hp: hpByType[type],
    maxHp: hpByType[type],
    biome
  });
}

function generateResourceNodes() {
  resourceNodes.length = 0;
  const rng = createSeededRng(13791);
  const perTile = TILE_SIZE;
  const totalSlots = Math.floor((world.width * world.height) / (perTile * perTile));
  let treeIndex = 0;
  let rockIndex = 0;
  let berryIndex = 0;

  for (let slot = 0; slot < totalSlots; slot += 1) {
    const x = rng() * world.width;
    const y = rng() * world.height;
    const biome = getBiomeAtPosition(x, y);
    if (biome === "ocean") {
      continue;
    }

    const roll = rng();
    if (biome !== "desert" && roll < 0.035) {
      spawnResourceNode(rng, "tree", biome, x - 40, x + 40, y - 40, y + 40, treeIndex);
      treeIndex += 1;
    } else if (roll < 0.06) {
      spawnResourceNode(rng, "rock", biome, x - 32, x + 32, y - 32, y + 32, rockIndex);
      rockIndex += 1;
    } else if (roll < 0.08) {
      spawnResourceNode(rng, "berries", biome, x - 24, x + 24, y - 24, y + 24, berryIndex);
      berryIndex += 1;
    }
  }
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

function subscribeToBlocks() {
  blocksUnsubscribe?.();
  blocksUnsubscribe = onValue(
    blocksRef(),
    (snapshot) => {
      const records = snapshot.val() as Record<string, BlockRecord> | null;
      blocksByCell.clear();
      if (!records) {
        return;
      }
      for (const [cellId, record] of Object.entries(records)) {
        if (!record || !record.type || !BUILD_BLOCK_TYPES.includes(record.type)) {
          continue;
        }
        const parsed = parseCellId(cellId);
        if (!parsed || !isInsideBuildGrid(parsed.gx, parsed.gy)) {
          continue;
        }
        blocksByCell.set(cellId, {
          id: cellId,
          gx: parsed.gx,
          gy: parsed.gy,
          type: record.type,
          placedBy: record.placedBy ?? "unknown",
          placedAt: record.placedAt
        });
      }
      cullResourcesInsideBlocks();
    },
    (error) => {
      setStatus(`Blocks failed: ${error.message}`, "error");
    }
  );
}

function subscribeToCats() {
  catsUnsubscribe?.();
  catsUnsubscribe = onValue(
    catsRef(),
    (snapshot) => {
      const records = snapshot.val() as Record<string, CatRecord> | null;
      const seenIds = new Set<string>();
      if (!records) {
        catsById.clear();
        updateCatDebugPanel();
        return;
      }
      for (const [id, record] of Object.entries(records)) {
        if (!record) {
          continue;
        }
        const remoteOwnerUid = record.ownerUid && record.ownerUid.length > 0 ? record.ownerUid : null;
        const remoteCreatedBy = record.createdBy ?? "unknown";
        const authoritativeForCat = isCatAuthoritativeForLocal(remoteOwnerUid, remoteCreatedBy);
        const existing = catsById.get(id);
        const remoteCat: CatEntity = {
          id,
          x: clamp(record.x ?? world.width / 2, 20, world.width - 20),
          y: clamp(record.y ?? world.height / 2, 20, world.height - 20),
          vx: record.vx ?? 0,
          vy: record.vy ?? 0,
          state: record.state ?? "idle",
          ownerUid: remoteOwnerUid,
          ownerName: record.ownerName ?? "",
          createdBy: remoteCreatedBy,
          behavior: record.behavior === "stay" ? "stay" : "follow",
          hue: clamp(record.hue ?? 24, 0, 360),
          nextStateAt: record.nextStateAt ?? Date.now() + randomRange(800, 1600),
          zoomiesUntil: record.zoomiesUntil ?? 0,
          petUntil: record.petUntil ?? 0,
          lastFedAt: record.lastFedAt ?? 0,
          updatedAt: record.updatedAt,
          createdAt: record.createdAt
        };

        if (existing && authoritativeForCat) {
          // Keep locally simulated motion for authoritative cats to avoid
          // jitter from echoed/stale remote snapshots fighting the client sim.
          catsById.set(id, {
            ...existing,
            ownerUid: remoteCat.ownerUid,
            ownerName: remoteCat.ownerName,
            behavior: remoteCat.behavior,
            hue: remoteCat.hue,
            lastFedAt: remoteCat.lastFedAt,
            updatedAt: remoteCat.updatedAt,
            createdAt: remoteCat.createdAt
          });
        } else {
          catsById.set(id, remoteCat);
        }
        seenIds.add(id);
      }

      for (const catId of [...catsById.keys()]) {
        if (!seenIds.has(catId)) {
          catsById.delete(catId);
        }
      }
      updateCatDebugPanel();
    },
    (error) => {
      setStatus(`Cats failed: ${error.message}`, "error");
    }
  );
}

function subscribeToOwnedCats() {
  if (!localPlayer || !isFirebaseConfigured) {
    return;
  }
  ownedCatsUnsubscribe?.();
  ownedCatsUnsubscribe = onValue(
    userOwnedCatsRef(localPlayer.id),
    (snapshot) => {
      const records = snapshot.val() as Record<string, true> | null;
      localOwnedCatIds.clear();
      if (!records) {
        return;
      }
      for (const catId of Object.keys(records)) {
        localOwnedCatIds.add(catId);
      }
    },
    (error) => {
      setStatus(`Owned cats failed: ${error.message}`, "error");
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

async function syncLocalOwnedCats() {
  if (!localPlayer || !isFirebaseConfigured) {
    return;
  }
  const syncs: Promise<void>[] = [];
  for (const cat of catsById.values()) {
    if (cat.ownerUid !== localPlayer.id) {
      continue;
    }
    syncs.push(
      set(catRef(cat.id), {
        x: Math.round(cat.x),
        y: Math.round(cat.y),
        vx: cat.vx,
        vy: cat.vy,
        state: cat.state,
        ownerUid: cat.ownerUid ?? "",
        ownerName: cat.ownerName,
        createdBy: cat.createdBy,
        behavior: cat.behavior,
        hue: cat.hue,
        nextStateAt: Math.round(cat.nextStateAt),
        zoomiesUntil: Math.round(cat.zoomiesUntil),
        petUntil: Math.round(cat.petUntil),
        lastFedAt: Math.round(cat.lastFedAt),
        updatedAt: serverTimestamp(),
        createdAt: cat.createdAt ?? serverTimestamp()
      } satisfies CatRecord)
    );
  }
  await Promise.all(syncs);
}

async function applyCatAction(action: "follow" | "stay" | "letgo" | "pet") {
  if (!localPlayer || !selectedCatMenuId) {
    return;
  }
  const cat = catsById.get(selectedCatMenuId);
  if (!cat) {
    setCatMenuOpen(null);
    return;
  }
  const ownedByLocal = cat.ownerUid === localPlayer.id;
  if (!ownedByLocal && action !== "pet") {
    setStatus("Feed the cat first to control it.", "error");
    return;
  }
  const next = { ...cat };
  if (action === "follow") {
    next.ownerUid = localPlayer.id;
    next.ownerName = localPlayer.name;
    next.behavior = "follow";
    next.state = "follow";
  } else if (action === "stay") {
    next.behavior = "stay";
    next.state = "idle";
    next.vx = 0;
    next.vy = 0;
  } else if (action === "letgo") {
    next.ownerUid = null;
    next.ownerName = "";
    next.behavior = "follow";
    next.state = "wander";
  } else if (action === "pet") {
    next.petUntil = Date.now() + 1400;
    next.state = "idle";
  }
  catsById.set(next.id, next);
  updateCatDebugPanel();
  try {
    await set(catRef(next.id), {
      x: Math.round(next.x),
      y: Math.round(next.y),
      vx: next.vx,
      vy: next.vy,
      state: next.state,
      ownerUid: next.ownerUid ?? "",
      ownerName: next.ownerName,
      createdBy: next.createdBy,
      behavior: next.behavior,
      hue: next.hue,
      nextStateAt: Math.round(next.nextStateAt),
      zoomiesUntil: Math.round(next.zoomiesUntil),
      petUntil: Math.round(next.petUntil),
      lastFedAt: Math.round(next.lastFedAt),
      updatedAt: serverTimestamp(),
      createdAt: next.createdAt ?? serverTimestamp()
    } satisfies CatRecord);
    if (action === "letgo") {
      void remove(ref(database, `users/${localPlayer.id}/ownedCats/${next.id}`));
    } else if (next.ownerUid === localPlayer.id) {
      void set(ref(database, `users/${localPlayer.id}/ownedCats/${next.id}`), true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus(`Cat action failed: ${message}`, "error");
  }
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
    localPlayer.step += deltaSeconds * (sprinting ? 9.5 : 6.5);
  } else {
    localVelocityX = 0;
    localVelocityY = 0;
    localPlayer.step = 0;
  }

  const nextX = localPlayer.x + localVelocityX * deltaSeconds;
  const nextY = localPlayer.y + localVelocityY * deltaSeconds;
  let moved = mapRenderer.moveWithCollision(localPlayer.x, localPlayer.y, nextX, nextY, world.playerRadius);

  // Trees and rocks are solid obstacles.
  for (const node of resourceNodes) {
    if (node.hp <= 0 || node.type === "berries") {
      continue;
    }
    const dx = moved.x - node.x;
    const dy = moved.y - node.y;
    const blockingRadius = node.type === "tree" ? node.radius * 0.24 : node.radius * 0.88;
    const minDistance = world.playerRadius + blockingRadius;
    const distance = Math.hypot(dx, dy);
    if (distance >= minDistance) {
      continue;
    }

    if (distance <= 0.001) {
      moved = { x: localPlayer.x, y: localPlayer.y };
      continue;
    }

    const nx = dx / distance;
    const ny = dy / distance;
    moved = {
      x: node.x + nx * minDistance,
      y: node.y + ny * minDistance
    };
  }

  // Placed blocks can be solid too (walls/windows).
  for (const block of blocksByCell.values()) {
    if (!SOLID_BUILD_BLOCKS.has(block.type)) {
      continue;
    }
    const blockMinX = block.gx * BUILD_GRID_SIZE;
    const blockMinY = block.gy * BUILD_GRID_SIZE;
    const blockMaxX = blockMinX + BUILD_GRID_SIZE;
    const blockMaxY = blockMinY + BUILD_GRID_SIZE;
    const nearestX = clamp(moved.x, blockMinX, blockMaxX);
    const nearestY = clamp(moved.y, blockMinY, blockMaxY);
    const dx = moved.x - nearestX;
    const dy = moved.y - nearestY;
    const distance = Math.hypot(dx, dy);
    if (distance >= world.playerRadius) {
      continue;
    }

    if (distance > 0.001) {
      const nx = dx / distance;
      const ny = dy / distance;
      moved = {
        x: nearestX + nx * world.playerRadius,
        y: nearestY + ny * world.playerRadius
      };
      continue;
    }

    const pushLeft = Math.abs(moved.x - blockMinX);
    const pushRight = Math.abs(blockMaxX - moved.x);
    const pushUp = Math.abs(moved.y - blockMinY);
    const pushDown = Math.abs(blockMaxY - moved.y);
    const minPush = Math.min(pushLeft, pushRight, pushUp, pushDown);
    if (minPush === pushLeft) {
      moved.x = blockMinX - world.playerRadius;
    } else if (minPush === pushRight) {
      moved.x = blockMaxX + world.playerRadius;
    } else if (minPush === pushUp) {
      moved.y = blockMinY - world.playerRadius;
    } else {
      moved.y = blockMaxY + world.playerRadius;
    }
  }

  localPlayer.x = moved.x;
  localPlayer.y = moved.y;
}

function emitPeeParticles(player: Player, deltaSeconds: number) {
  const facingLength = Math.max(1, Math.hypot(player.facingX, player.facingY));
  const fx = player.facingX / facingLength;
  const fy = player.facingY / facingLength;
  const sideX = -fy;
  const sideY = fx;
  const originX = player.x + fx * (world.playerRadius * 0.95);
  const originY = player.y + fy * (world.playerRadius * 0.95);

  const totalToEmit = PEE_PARTICLES_PER_SECOND * deltaSeconds + peeEmissionCarry;
  const emitCount = Math.floor(totalToEmit);
  peeEmissionCarry = totalToEmit - emitCount;

  for (let i = 0; i < emitCount; i += 1) {
    const forwardSpeed = 230 + Math.random() * 95;
    const sideJitter = (Math.random() - 0.5) * 70;
    const upJitter = (Math.random() - 0.5) * 28;
    peeParticles.push({
      x: originX + sideX * ((Math.random() - 0.5) * 8),
      y: originY + sideY * ((Math.random() - 0.5) * 8),
      vx: fx * forwardSpeed + sideX * sideJitter,
      vy: fy * forwardSpeed + sideY * sideJitter + upJitter,
      life: 0.44 + Math.random() * 0.32,
      maxLife: 0.44 + Math.random() * 0.32,
      size: 2.2 + Math.random() * 2
    });
  }
}

function updatePeeParticles(deltaSeconds: number) {
  if (localPlayer && keys.has("KeyP")) {
    emitPeeParticles(localPlayer, deltaSeconds);
  } else {
    peeEmissionCarry = 0;
  }

  for (let i = peeParticles.length - 1; i >= 0; i -= 1) {
    const particle = peeParticles[i];
    particle.life -= deltaSeconds;
    if (particle.life <= 0) {
      peeParticles.splice(i, 1);
      continue;
    }
    particle.vx *= Math.exp(-2.2 * deltaSeconds);
    particle.vy *= Math.exp(-2.2 * deltaSeconds);
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
  }
}

function updateResourceHitParticles(deltaSeconds: number) {
  for (let i = resourceHitParticles.length - 1; i >= 0; i -= 1) {
    const particle = resourceHitParticles[i];
    particle.life -= deltaSeconds;
    if (particle.life <= 0) {
      resourceHitParticles.splice(i, 1);
      continue;
    }
    particle.vx *= Math.exp(-2.4 * deltaSeconds);
    particle.vy *= Math.exp(-2.2 * deltaSeconds);
    particle.vy += 120 * deltaSeconds;
    particle.x += particle.vx * deltaSeconds;
    particle.y += particle.vy * deltaSeconds;
  }
}

function drawPeeParticles() {
  for (const particle of peeParticles) {
    const alpha = Math.max(0, particle.life / Math.max(0.001, particle.maxLife));
    context.fillStyle = `rgba(248, 219, 82, ${0.25 + alpha * 0.65})`;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size * (0.6 + alpha * 0.4), 0, Math.PI * 2);
    context.fill();
  }
}

function drawResourceHitParticles() {
  for (const particle of resourceHitParticles) {
    const alpha = Math.max(0, particle.life / Math.max(0.001, particle.maxLife));
    const hexAlpha = Math.round((0.35 + alpha * 0.6) * 255)
      .toString(16)
      .padStart(2, "0");
    context.fillStyle = `${particle.color}${hexAlpha}`;
    context.beginPath();
    context.arc(particle.x, particle.y, particle.size * (0.65 + alpha * 0.35), 0, Math.PI * 2);
    context.fill();
  }
}

function drawPlacedBlocks() {
  const fillByType: Record<BuildBlockType, string> = {
    woodWall: "#8b5a38",
    stoneWall: "#8f959d",
    woodFloor: "#a57a4f",
    stoneFloor: "#aeb5be",
    window: "#9dcce8"
  };
  for (const block of blocksByCell.values()) {
    const centerX = gridToWorldCenter(block.gx);
    const centerY = gridToWorldCenter(block.gy);
    const minX = centerX - BUILD_GRID_SIZE / 2;
    const minY = centerY - BUILD_GRID_SIZE / 2;
    context.fillStyle = fillByType[block.type];
    context.fillRect(minX + 2, minY + 2, BUILD_GRID_SIZE - 4, BUILD_GRID_SIZE - 4);
    context.strokeStyle = "rgba(20, 20, 24, 0.55)";
    context.lineWidth = 2;
    context.strokeRect(minX + 1.5, minY + 1.5, BUILD_GRID_SIZE - 3, BUILD_GRID_SIZE - 3);
  }
}

function drawBuildPreview() {
  if (!buildModeEnabled || !hoveredBuildCell) {
    return;
  }
  const { gx, gy } = hoveredBuildCell;
  const centerX = gridToWorldCenter(gx);
  const centerY = gridToWorldCenter(gy);
  const minX = centerX - BUILD_GRID_SIZE / 2;
  const minY = centerY - BUILD_GRID_SIZE / 2;
  const valid = canPlaceBlockAt(gx, gy);
  context.fillStyle = valid ? "rgba(109, 220, 142, 0.28)" : "rgba(240, 90, 90, 0.3)";
  context.fillRect(minX + 2, minY + 2, BUILD_GRID_SIZE - 4, BUILD_GRID_SIZE - 4);
  context.strokeStyle = valid ? "rgba(109, 220, 142, 0.95)" : "rgba(240, 90, 90, 0.95)";
  context.lineWidth = 2;
  context.strokeRect(minX + 1.5, minY + 1.5, BUILD_GRID_SIZE - 3, BUILD_GRID_SIZE - 3);
}

function drawCats() {
  const now = Date.now();
  for (const cat of catsById.values()) {
    const bodyRadius = 22;
    const earSize = 9;
    const hue = cat.hue % 360;
    const catColor = `hsl(${hue}deg 40% 62%)`;
    const petActive = cat.petUntil > now;
    const petScale = petActive ? 1 + Math.sin(now / 70) * 0.12 : 1;
    context.save();
    context.translate(cat.x, cat.y);
    context.scale(petScale, petScale);
    context.translate(-cat.x, -cat.y);
    context.fillStyle = catColor;
    context.beginPath();
    context.arc(cat.x, cat.y, bodyRadius, 0, Math.PI * 2);
    context.fill();

    context.beginPath();
    context.moveTo(cat.x - 10, cat.y - 16);
    context.lineTo(cat.x - 15, cat.y - 16 - earSize);
    context.lineTo(cat.x - 4, cat.y - 20);
    context.closePath();
    context.fill();

    context.beginPath();
    context.moveTo(cat.x + 10, cat.y - 16);
    context.lineTo(cat.x + 15, cat.y - 16 - earSize);
    context.lineTo(cat.x + 4, cat.y - 20);
    context.closePath();
    context.fill();

    context.fillStyle = "#101217";
    context.beginPath();
    context.arc(cat.x - 5, cat.y - 3, 2.2, 0, Math.PI * 2);
    context.arc(cat.x + 5, cat.y - 3, 2.2, 0, Math.PI * 2);
    context.fill();

    if (cat.state === "zoomies") {
      context.strokeStyle = "rgba(255, 236, 125, 0.9)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(cat.x, cat.y, bodyRadius + 6, 0, Math.PI * 2);
      context.stroke();
    }
    if (petActive) {
      context.fillStyle = "rgba(255, 140, 170, 0.95)";
      context.beginPath();
      context.arc(cat.x - 14, cat.y - 32, 4, 0, Math.PI * 2);
      context.arc(cat.x + 14, cat.y - 32, 4, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }
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
  const handRadius = Math.max(5, Math.round(bodyRadius * 0.28));
  const footRadius = Math.max(5, Math.round(bodyRadius * 0.32));
  const facingLength = Math.max(1, Math.hypot(player.facingX, player.facingY));
  const facingX = player.facingX / facingLength;
  const facingY = player.facingY / facingLength;
  const sideX = -facingY;
  const sideY = facingX;
  const hasLocalInput = keys.has("KeyW") || keys.has("KeyA") || keys.has("KeyS") || keys.has("KeyD");
  const animateFeet = isLocal ? hasLocalInput : player.moving;
  const footSwing = animateFeet ? Math.sin(player.step * 5.2) : 0;
  const footForward = bodyRadius * 0.66;
  const footSide = bodyRadius * 0.52;
  const footForwardOffsetA = footSwing * bodyRadius * 0.24;
  const footForwardOffsetB = -footSwing * bodyRadius * 0.24;
  const footBaseX = player.x + facingX * footForward;
  const footBaseY = player.y + facingY * footForward;
  const handSide = bodyRadius * 0.96;
  const handForward = bodyRadius * 0.14;
  const handBaseLeftX = player.x + sideX * handSide + facingX * handForward;
  const handBaseLeftY = player.y + sideY * handSide + facingY * handForward;
  const handBaseRightX = player.x - sideX * handSide + facingX * handForward;
  const handBaseRightY = player.y - sideY * handSide + facingY * handForward;
  const punchAge = performance.now() - lastPunchAt;
  const punchActive = isLocal && punchAge >= 0 && punchAge < PUNCH_DURATION_MS;
  const punchPhase = punchActive ? punchAge / PUNCH_DURATION_MS : 1;
  let punchPulse = 0;
  if (punchActive) {
    if (punchPhase < PUNCH_EXTEND_PHASE) {
      // Quick forward jab.
      const t = punchPhase / PUNCH_EXTEND_PHASE;
      punchPulse = 1 - Math.pow(1 - t, 3);
    } else {
      // Smoother recovery back to guard.
      const t = (punchPhase - PUNCH_EXTEND_PHASE) / (1 - PUNCH_EXTEND_PHASE);
      const eased = 1 - Math.pow(t, 2);
      punchPulse = Math.max(0, eased);
    }
  }
  const leftPunch = punchActive && activePunchSide === 1 ? punchPulse * PUNCH_REACH : 0;
  const rightPunch = punchActive && activePunchSide === -1 ? punchPulse * PUNCH_REACH : 0;
  const punchDirX = punchActive && isLocal ? lastPunchAimX : facingX;
  const punchDirY = punchActive && isLocal ? lastPunchAimY : facingY;
  const handLeftX = handBaseLeftX + punchDirX * leftPunch;
  const handLeftY = handBaseLeftY + punchDirY * leftPunch;
  const handRightX = handBaseRightX + punchDirX * rightPunch;
  const handRightY = handBaseRightY + punchDirY * rightPunch;
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

  // Draw feet first so the body overlaps them.
  const palette = isLocal
    ? localPlayerColors
    : { body: "#f2f2f2", hands: "#f2f2f2", feet: "#f2f2f2" };
  context.fillStyle = palette.feet;
  context.beginPath();
  context.arc(
    footBaseX + sideX * footSide + facingX * footForwardOffsetA,
    footBaseY + sideY * footSide + facingY * footForwardOffsetA,
    footRadius,
    0,
    Math.PI * 2
  );
  context.fill();
  context.strokeStyle = outlineColor;
  context.lineWidth = outlineWidth;
  context.stroke();

  context.beginPath();
  context.arc(
    footBaseX - sideX * footSide + facingX * footForwardOffsetB,
    footBaseY - sideY * footSide + facingY * footForwardOffsetB,
    footRadius,
    0,
    Math.PI * 2
  );
  context.fill();
  context.stroke();

  // Draw side hands before the body so they tuck underneath.
  context.fillStyle = palette.hands;
  context.beginPath();
  context.arc(handLeftX, handLeftY, handRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.beginPath();
  context.arc(handRightX, handRightY, handRadius, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  // Body last so it sits above the hands.
  context.fillStyle = palette.body;
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
  drawPlacedBlocks();
  drawBuildPreview();
  drawCats();

  for (const player of renderedPlayers.values()) {
    drawPlayer(player, player.id === localPlayer?.id);
  }

  // Draw resources over players so characters can walk "under" canopies/icons.
  for (const node of resourceNodes) {
    if (node.hp <= 0) {
      continue;
    }
    drawResourceNode(node);
  }
  drawHitboxesOverlay();
  drawResourceHitParticles();
  drawPeeParticles();
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

  for (const cat of catsById.values()) {
    if (
      cat.x < viewportLeft - 50 ||
      cat.x > viewportRight + 50 ||
      cat.y < viewportTop - 50 ||
      cat.y > viewportBottom + 50
    ) {
      continue;
    }
    const label = cat.ownerName ? `${cat.ownerName}'s cat` : "Cat";
    context.fillText(label, worldToScreenX(camera.x, cat.x), worldToScreenY(camera.y, cat.y - 32));
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
  updateCats(deltaSeconds, frameAt);
  updateResourceHitParticles(deltaSeconds);
  updatePeeParticles(deltaSeconds);
  updateRenderedPlayers(deltaSeconds);
  updateCamera(deltaSeconds);

  if (isFirebaseConfigured && hasJoinedLobby && localPlayer && frameAt - lastSyncAt > SYNC_INTERVAL_MS) {
    lastSyncAt = frameAt;
    void Promise.all([syncLocalPlayer(), syncLocalOwnedCats()])
      .then(() => {
        void syncOwnedCatsIndex();
      })
      .catch((error) => {
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
        setBuildInventoryOpen(false);
        setCatMenuOpen(null);
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
    setBuildInventoryOpen(false);
    setCatMenuOpen(null);
    blocksByCell.clear();
    catsById.clear();
    localOwnedCatIds.clear();
    generateResourceNodes();
    updateResourcePanel();
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
  setBuildInventoryOpen(false);
  setCatMenuOpen(null);
  blocksByCell.clear();
  generateResourceNodes();
  updateResourcePanel();
  renderPlayersList();
  showGame();
  setStatus("Connected", "online");

  await syncLocalPlayer();
  await onDisconnect(playerRef(localPlayer.id)).remove();
  subscribeToLobby();
  subscribeToKickedPlayers();
  subscribeToChat();
  subscribeToBlocks();
  subscribeToCats();
  subscribeToOwnedCats();

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

chatDrawerToggle.addEventListener("click", () => {
  setChatDrawerOpen(!chatDrawerOpen);
});

paintControlsToggle.addEventListener("click", () => {
  setPaintPanelOpen(!paintPanelOpen);
});

hitboxesToggle.addEventListener("click", () => {
  showHitboxes = !showHitboxes;
  hitboxesToggle.setAttribute("aria-pressed", String(showHitboxes));
  hitboxesToggle.textContent = showHitboxes ? "Hitboxes On" : "Hitboxes";
  updateCatDebugPanel();
});

paintBodyInput.addEventListener("input", () => {
  localPlayerColors.body = paintBodyInput.value;
});

paintHandsInput.addEventListener("input", () => {
  localPlayerColors.hands = paintHandsInput.value;
});

paintFeetInput.addEventListener("input", () => {
  localPlayerColors.feet = paintFeetInput.value;
});

canvas.addEventListener("pointerdown", (event) => {
  if (!hasJoinedLobby) {
    return;
  }

  if (buildModeEnabled) {
    const hovered = getHoveredBuildCellFromPointer(event);
    if (hovered) {
      if (event.button === 2) {
        void removeBlockAtCell(hovered.gx, hovered.gy);
      } else if (event.button === 0) {
        void placeSelectedBlockAtCell(hovered.gx, hovered.gy);
      }
    }
    event.preventDefault();
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const camera = getCameraCenter();
  const worldX = screenToWorldX(camera.x, event.clientX);
  const worldY = screenToWorldY(camera.y, event.clientY);
  const clickedCat = findClickedCat(worldX, worldY);
  if (clickedCat) {
    if (localPlayer && clickedCat.ownerUid === localPlayer.id) {
      setCatMenuOpen(clickedCat.id);
    } else {
      setCatMenuOpen(null);
    }
    event.preventDefault();
    return;
  }
  setCatMenuOpen(null);

  triggerPunch();
  event.preventDefault();
});

canvas.addEventListener("pointermove", (event) => {
  if (!buildModeEnabled || !hasJoinedLobby) {
    hoveredBuildCell = null;
    return;
  }
  hoveredBuildCell = getHoveredBuildCellFromPointer(event);
});

canvas.addEventListener("pointerleave", () => {
  hoveredBuildCell = null;
});

canvas.addEventListener("contextmenu", (event) => {
  if (!buildModeEnabled) {
    return;
  }
  event.preventDefault();
});

const buildHotbarButtons = buildHotbar.querySelectorAll<HTMLButtonElement>("[data-build-slot]");
for (const button of buildHotbarButtons) {
  button.addEventListener("click", () => {
    const slot = Number(button.dataset.buildSlot ?? "0");
    selectedBuildSlot = clamp(slot, 0, BUILD_BLOCK_TYPES.length - 1);
    updateBuildHotbarSelection();
    setBuildInventoryOpen(true);
  });
}

const catMenuButtons = catMenu.querySelectorAll<HTMLButtonElement>("[data-cat-action]");
for (const button of catMenuButtons) {
  button.addEventListener("click", () => {
    const action = button.dataset.catAction;
    if (action === "follow" || action === "stay" || action === "letgo" || action === "pet") {
      void applyCatAction(action);
    }
  });
}

catDebugDeleteButton.addEventListener("click", () => {
  const count = Math.floor(Number(catDebugDeleteCount.value));
  const safeCount = Number.isFinite(count) && count > 0 ? count : 1;
  void deleteUntamedCats(safeCount).catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    setStatus(`Delete untamed failed: ${message}`, "error");
  });
});

catDebugDeleteCount.addEventListener("input", () => {
  const value = Math.floor(Number(catDebugDeleteCount.value));
  if (!Number.isFinite(value) || value < 1) {
    catDebugDeleteCount.value = "1";
  }
});
signInTab.addEventListener("click", () => {
  setAuthMode("signin");
});

createTab.addEventListener("click", () => {
  setAuthMode("create");
});

signInForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const email = signInUsername.value.trim();
  const password = signInPassword.value;

  if (!isFirebaseConfigured) {
    menuError.textContent = "Firebase is required for sign in. Configure .env.local first.";
    return;
  }

  if (!email || !password) {
    menuError.textContent = "Enter your email and password.";
    signInUsername.focus();
    return;
  }

  menuError.textContent = "";
  setAuthPending(true);

  void (async () => {
    const { displayName } = await signInFirebaseAccount(email, password);
    signInPassword.value = "";
    await joinLobby(displayName || email);
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

  if (username.length < 3) {
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
    await createFirebaseAccount(username, email, password);
    createPassword.value = "";
    createEmail.value = "";
    signInUsername.value = email;
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
setChatDrawerOpen(false);
setPaintPanelOpen(false);
updateBuildHotbarSelection();
setBuildInventoryOpen(false);
setCatMenuOpen(null);
updateCatDebugPanel();

if (!isFirebaseConfigured) {
  setStatus("Firebase not configured. Add .env.local to enable online lobby.", "offline");
}
