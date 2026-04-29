import { get, onDisconnect, onValue, ref, remove, serverTimestamp, set } from "firebase/database";
import type { Unsubscribe } from "firebase/database";
import { database, signInPlayer } from "./firebase";
import "./styles.css";

type Player = {
  id: string;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  name: string;
  lastSeen?: number | object;
};

type PlayerRecord = Omit<Player, "id">;

type KickedRecord = {
  kickedAt?: number | object;
  name?: string;
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

app.innerHTML = `
  <main class="shell">
    <section class="menu" id="join-menu">
      <h1>WoopWoop</h1>
      <p>Enter a name, join the lobby, then move with <strong>WASD</strong>.</p>
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
        <ul class="devtools-list" id="devtools-players-list"></ul>
      </section>
    </section>

    <section class="hud is-hidden" id="game-hud">
      <div>
        <h1>WoopWoop</h1>
        <p>Move with <strong>WASD</strong>. Open another tab to see multiplayer sync.</p>
      </div>
      <div class="status" id="status">Connecting...</div>
    </section>

    <aside class="lobby-panel is-hidden" id="lobby-panel">
      <h2>Connected players <span id="player-count">0</span></h2>
      <ul id="players-list"></ul>
    </aside>

    <canvas class="is-hidden" id="game" width="960" height="640" aria-label="2D multiplayer game canvas"></canvas>
  </main>
`;

const canvasElement = document.querySelector<HTMLCanvasElement>("#game");
const statusElement = document.querySelector<HTMLDivElement>("#status");
const joinMenuElement = document.querySelector<HTMLElement>("#join-menu");
const joinFormElement = document.querySelector<HTMLFormElement>("#join-form");
const nameInputElement = document.querySelector<HTMLInputElement>("#player-name");
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

if (
  !canvasElement ||
  !statusElement ||
  !joinMenuElement ||
  !joinFormElement ||
  !nameInputElement ||
  !menuErrorElement ||
  !devtoolsFormElement ||
  !devtoolsPasswordElement ||
  !devtoolsPanelElement ||
  !devtoolsMessageElement ||
  !devtoolsPlayersListElement ||
  !gameHudElement ||
  !lobbyPanelElement ||
  !playerCountElement ||
  !playersListElement
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
const devtoolsForm = devtoolsFormElement;
const devtoolsPassword = devtoolsPasswordElement;
const devtoolsPanel = devtoolsPanelElement;
const devtoolsMessage = devtoolsMessageElement;
const devtoolsPlayersList = devtoolsPlayersListElement;
const gameHud = gameHudElement;
const lobbyPanel = lobbyPanelElement;
const playerCount = playerCountElement;
const playersList = playersListElement;
const context = renderingContext;

const world = {
  width: canvas.width,
  height: canvas.height,
  playerRadius: 16,
  speed: 260
};

const DEVTOOLS_PASSWORD = "0310";
const DEFAULT_FACING = { x: 0, y: 1 };
const REMOTE_INTERPOLATION_SPEED = 12;
const SYNC_INTERVAL_MS = 90;
const keys = new Set<string>();
const players = new Map<string, Player>();
const renderedPlayers = new Map<string, Player>();
const renderStates = new Map<string, RenderState>();
const kickedPlayerIds = new Set<string>();
let localPlayer: Player | null = null;
let lastFrameAt = performance.now();
let lastSyncAt = 0;
let playersUnsubscribe: Unsubscribe | null = null;
let kickedUnsubscribe: Unsubscribe | null = null;
let animationStarted = false;
let devtoolsUnlocked = false;
let hasJoinedLobby = false;

window.addEventListener("keydown", (event) => {
  if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(event.code)) {
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

function makePlayer(userId: string, name: string): Player {
  return {
    id: userId,
    x: world.width / 2 + Math.random() * 120 - 60,
    y: world.height / 2 + Math.random() * 120 - 60,
    facingX: DEFAULT_FACING.x,
    facingY: DEFAULT_FACING.y,
    name
  };
}

function makeRenderablePlayer(player: Player): RenderablePlayer {
  return {
    ...player,
    targetX: player.x,
    targetY: player.y,
    targetFacingX: player.facingX,
    targetFacingY: player.facingY
  };
}

function playerRef(playerId: string) {
  return ref(database, `rooms/lobby/players/${playerId}`);
}

function playersRef() {
  return ref(database, "rooms/lobby/players");
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
  canvas.classList.remove("is-hidden");
}

function renderPlayersList() {
  const orderedPlayers = [...players.values()].sort((a, b) => a.name.localeCompare(b.name));
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
      const devtoolsSwatch = document.createElement("span");
      const details = document.createElement("span");
      const playerName = document.createElement("span");
      const playerId = document.createElement("small");
      const kickButton = document.createElement("button");

      devtoolsItem.className = "devtools-row";
      details.className = "devtools-player-details";
      devtoolsSwatch.className = "player-swatch";
      playerName.textContent = player.name;
      playerId.textContent = player.id;
      kickButton.type = "button";
      kickButton.textContent = player.id === localPlayer?.id ? "You" : "Kick";
      kickButton.disabled = player.id === localPlayer?.id;
      kickButton.addEventListener("click", () => {
        void kickPlayer(player.id, player.name);
      });

      details.append(playerName, playerId);
      devtoolsItem.append(devtoolsSwatch, details, kickButton);
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
      const marker = document.createElement("span");
      const details = document.createElement("span");
      const label = document.createElement("span");
      const playerId = document.createElement("small");
      const clearButton = document.createElement("button");

      kickedItem.className = "devtools-row devtools-row--kicked";
      details.className = "devtools-player-details";
      marker.className = "kicked-marker";
      label.textContent = "Kicked player";
      playerId.textContent = kickedPlayerId;
      clearButton.type = "button";
      clearButton.textContent = "Unkick";
      clearButton.addEventListener("click", () => {
        void clearKick(kickedPlayerId, kickedPlayerId);
      });

      details.append(label, playerId);
      kickedItem.append(marker, details, clearButton);
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

async function syncLocalPlayer() {
  if (!localPlayer) {
    return;
  }

  const record: PlayerRecord = {
    x: Math.round(localPlayer.x),
    y: Math.round(localPlayer.y),
    facingX: localPlayer.facingX,
    facingY: localPlayer.facingY,
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

  if (dx !== 0 || dy !== 0) {
    const length = Math.hypot(dx, dy);
    const normalizedX = dx / length;
    const normalizedY = dy / length;
    localPlayer.facingX = normalizedX;
    localPlayer.facingY = normalizedY;
    localPlayer.x += normalizedX * world.speed * deltaSeconds;
    localPlayer.y += normalizedY * world.speed * deltaSeconds;
    localPlayer.x = clamp(localPlayer.x, world.playerRadius, world.width - world.playerRadius);
    localPlayer.y = clamp(localPlayer.y, world.playerRadius, world.height - world.playerRadius);
  }
}

function updateRenderedPlayers(deltaSeconds: number) {
  renderedPlayers.clear();

  for (const [id, player] of players) {
    if (id === localPlayer?.id) {
      renderedPlayers.set(id, player);
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
    if (!players.has(id)) {
      renderStates.delete(id);
    }
  }
}

function drawGrid() {
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
}

function drawPlayer(player: Player, isLocal: boolean) {
  const facing = normalizeFacing(player);
  const eyeOffsetX = facing.x * 5;
  const eyeOffsetY = facing.y * 5;
  const perpendicularX = -facing.y * 4;
  const perpendicularY = facing.x * 4;

  context.beginPath();
  context.fillStyle = "#f5f1e8";
  context.arc(player.x, player.y, world.playerRadius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = isLocal ? "#2f4a2d" : "#7b6f58";
  context.lineWidth = isLocal ? 4 : 2;
  context.stroke();

  context.fillStyle = "#11130f";
  context.beginPath();
  context.arc(player.x + eyeOffsetX + perpendicularX, player.y + eyeOffsetY + perpendicularY, 2.4, 0, Math.PI * 2);
  context.arc(player.x + eyeOffsetX - perpendicularX, player.y + eyeOffsetY - perpendicularY, 2.4, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#f2ead8";
  context.font = "14px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(isLocal ? "You" : player.name, player.x, player.y - 26);
}

function draw() {
  context.clearRect(0, 0, world.width, world.height);
  context.fillStyle = "#314529";
  context.fillRect(0, 0, world.width, world.height);
  drawGrid();

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
      const records = snapshot.val() as Record<string, PlayerRecord> | null;
      players.clear();

      if (records) {
        for (const [id, player] of Object.entries(records)) {
          players.set(id, {
            ...player,
            id,
            facingX: player.facingX ?? DEFAULT_FACING.x,
            facingY: player.facingY ?? DEFAULT_FACING.y
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
  hasJoinedLobby = true;
  renderPlayersList();
  showGame();
  setStatus("Connected", "online");

  await syncLocalPlayer();
  await onDisconnect(playerRef(localPlayer.id)).remove();
  subscribeToLobby();
  subscribeToKickedPlayers();

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
