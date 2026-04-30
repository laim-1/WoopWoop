import { get, onDisconnect, onValue, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Unsubscribe } from "firebase/database";
import { database, signInPlayer } from "./firebase";
import "./styles.css";

type Area = "forest" | "home";
type CharacterId = "boybrown" | "girlblonde" | "girlbrown";

type CharacterOption = {
  id: CharacterId;
  label: string;
  src: string;
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

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing #app element");
}

const assetBase = import.meta.env.BASE_URL;
const titleLogoSrc = `${assetBase}assets/branding/title-logo.png`;
const characters: CharacterOption[] = [
  { id: "boybrown", label: "Boy Brown", src: `${assetBase}assets/characters/boybrown.png` },
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
      <p>Pick a character, enter a name, then move with <strong>WASD</strong>.</p>
      <section class="character-picker" id="character-picker" aria-label="Choose your character"></section>
      <form class="join-form" id="join-form">
        <label for="player-name">Player name</label>
        <input
          id="player-name"
          maxlength="18"
          minlength="1"
          name="playerName"
          placeholder="Your name"
          required
          autocomplete="nickname"
        />
        <button type="submit">Join Lobby</button>
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
const joinFormElement = document.querySelector<HTMLFormElement>("#join-form");
const nameInputElement = document.querySelector<HTMLInputElement>("#player-name");
const menuErrorElement = document.querySelector<HTMLParagraphElement>("#menu-error");
const characterPickerElement = document.querySelector<HTMLElement>("#character-picker");
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
  !joinFormElement ||
  !nameInputElement ||
  !menuErrorElement ||
  !characterPickerElement ||
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
const joinForm = joinFormElement;
const nameInput = nameInputElement;
const menuError = menuErrorElement;
const characterPicker = characterPickerElement;
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

const world = {
  width: canvas.width,
  height: canvas.height,
  playerRadius: 24,
  speed: 260
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
const SPRITE_SIZE = 58;
const DEFAULT_CHARACTER_ID: CharacterId = characters[0].id;

const keys = new Set<string>();
const players = new Map<string, Player>();
const renderedPlayers = new Map<string, Player>();
const renderStates = new Map<string, RenderState>();
const kickedPlayerIds = new Set<string>();
const chatMessagesById = new Map<string, ChatMessage & { id: string }>();
const characterImages = new Map<CharacterId, HTMLImageElement>();
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

for (const character of characters) {
  const image = new Image();
  image.src = character.src;
  characterImages.set(character.id, image);
}

function renderCharacterPicker() {
  characterPicker.innerHTML = "";

  for (const character of characters) {
    const button = document.createElement("button");
    const image = document.createElement("img");
    const label = document.createElement("span");

    button.type = "button";
    button.className = "character-option";
    button.classList.toggle("is-selected", selectedCharacterId === character.id);
    image.src = character.src;
    image.alt = character.label;
    label.textContent = character.label;
    button.append(image, label);
    button.addEventListener("click", () => {
      selectedCharacterId = character.id;
      renderCharacterPicker();
    });
    characterPicker.append(button);
  }
}

window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLInputElement) {
    return;
  }

  if (event.code === "Enter" && hasJoinedLobby) {
    chatInput.focus();
    event.preventDefault();
  } else if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
    keys.add(event.code);
    event.preventDefault();
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.code);
});

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeFacing(player: Player) {
  const length = Math.hypot(player.facingX, player.facingY);

  if (length === 0) {
    return DEFAULT_FACING;
  }

  return {
    x: player.facingX / length,
    y: player.facingY / length
  };
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
  chatPanel.classList.toggle("is-hidden", !hasJoinedLobby);
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
    localPlayer.step += deltaSeconds * 10;
    localPlayer.x += normalizedX * world.speed * deltaSeconds;
    localPlayer.y += normalizedY * world.speed * deltaSeconds;
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

function drawPlayer(player: Player, isLocal: boolean) {
  const image = characterImages.get(player.characterId) ?? characterImages.get(DEFAULT_CHARACTER_ID);

  if (image?.complete && image.naturalWidth > 0) {
    context.drawImage(image, player.x - SPRITE_SIZE / 2, player.y - SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
  } else {
    context.fillStyle = "#f5f1e8";
    context.beginPath();
    context.arc(player.x, player.y, world.playerRadius, 0, Math.PI * 2);
    context.fill();
  }

  if (isLocal) {
    context.strokeStyle = "#f2ead8";
    context.lineWidth = 3;
    context.strokeRect(player.x - SPRITE_SIZE / 2, player.y - SPRITE_SIZE / 2, SPRITE_SIZE, SPRITE_SIZE);
  }

  context.fillStyle = "#f2ead8";
  context.font = "14px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(isLocal ? "You" : player.name, player.x, player.y - SPRITE_SIZE / 2 - 8);
}

function draw() {
  context.clearRect(0, 0, world.width, world.height);
  updateOverlayPanels();

  if (localPlayer?.area === HOME_AREA) {
    drawHome();
  } else {
    drawForest();
  }

  for (const player of renderedPlayers.values()) {
    drawPlayer(player, player.id === localPlayer?.id);
  }
}

function tick(frameAt: number) {
  const deltaSeconds = Math.min((frameAt - lastFrameAt) / 1000, 0.05);
  lastFrameAt = frameAt;

  updateLocalPlayer(deltaSeconds);
  updateRenderedPlayers(deltaSeconds);

  if (hasJoinedLobby && localPlayer && frameAt - lastSyncAt > SYNC_INTERVAL_MS) {
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

async function joinLobby(playerName: string) {
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

joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const playerName = nameInput.value.trim();

  if (!playerName) {
    menuError.textContent = "Enter a name before joining.";
    nameInput.focus();
    return;
  }

  menuError.textContent = "";
  nameInput.disabled = true;
  joinForm.querySelector("button")?.setAttribute("disabled", "true");

  void joinLobby(playerName).catch((error) => {
    menuError.textContent = `Could not join lobby: ${error.message}`;
    nameInput.disabled = false;
    joinForm.querySelector("button")?.removeAttribute("disabled");
    setStatus(`Could not join: ${error.message}`, "error");
  });
});

renderCharacterPicker();
